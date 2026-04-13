import type { NextApiRequest, NextApiResponse } from 'next'
import { Client, WebhookEvent, TextMessage } from '@line/bot-sdk'
import {
  createFamily,
  joinFamily,
  getUserFamily,
  getFamilyMembers,
  saveFamilyExpense,
  getFamilyMonthlyStats,
  getFamilyWeeklyStats,
} from '@/lib/family-accounting'

const lineConfig = {
  channelAccessToken: process.env.FAMILY_LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.FAMILY_LINE_CHANNEL_SECRET!,
}
const client = new Client(lineConfig)

// 使用者顯示名稱快取
async function getDisplayName(userId: string): Promise<string> {
  try {
    const profile = await client.getProfile(userId)
    return profile.displayName
  } catch {
    return '家人'
  }
}

async function parseIntent(text: string) {
  const prompt = `你是家庭記帳助理。分析用戶訊息，只輸出 JSON：

用戶訊息：「${text}」

規則：
1. 記帳（提到金額）→ {"type":"expense","amount":數字,"category":"餐飲/交通/購物/娛樂/訂閱/帳單/生活/其他","description":"說明10字內"}
2. 查詢 → {"type":"query","period":"本月/本週"}
3. 其他 → {"type":"chat","reply":"用繁體中文回答，50字內"}

如果不確定是不是記帳，回 {"type":"chat","reply":"..."}`

  // 優先 Claude Haiku
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = raw.match(/\{[^}]*\}/)
    return match ? JSON.parse(match[0]) : {}
  } catch (e) {
    console.error('Claude failed:', e)
  }

  // Fallback Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 },
          }),
        }
      )
      const data = await resp.json()
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      const match = raw.match(/\{[^}]*\}/)
      return match ? JSON.parse(match[0]) : {}
    } catch (e2) {
      console.error('Gemini also failed:', e2)
    }
  }
  return {}
}

async function handleMessage(event: WebhookEvent) {
  if (event.type !== 'message' || event.message.type !== 'text') return
  try {
    const userId = event.source.userId!
    const text = event.message.text.trim()

    // ===== 建立家庭 =====
    if (text.startsWith('建立家庭')) {
      const name = text.replace('建立家庭', '').trim() || '我的家庭'
      const nickname = await getDisplayName(userId)
      const result = await createFamily(userId, name, nickname)
      await reply(event.replyToken, `🏠 家庭「${result.name}」建立成功！\n\n📋 加入碼：${result.joinCode}\n\n請把加入碼分享給家人，他們輸入：\n加入家庭 ${result.joinCode}`)
      return
    }

    // ===== 加入家庭 =====
    if (text.startsWith('加入家庭')) {
      const code = text.replace('加入家庭', '').trim()
      if (!code) {
        await reply(event.replyToken, '請輸入加入碼：\n加入家庭 XXXXXX')
        return
      }
      const nickname = await getDisplayName(userId)
      const result = await joinFamily(userId, code, nickname)
      if (!result) {
        await reply(event.replyToken, '❌ 找不到這個家庭，請確認加入碼')
        return
      }
      if ('alreadyJoined' in result) {
        await reply(event.replyToken, `你已經是「${result.familyName}」的成員了！`)
        return
      }
      await reply(event.replyToken, `✅ 已加入「${result.familyName}」！\n\n現在可以直接記帳：\n午餐 120\n搭捷運 35`)
      return
    }

    // ===== 查看成員 =====
    if (text === '成員' || text === '家人') {
      const family = await getUserFamily(userId)
      if (!family) {
        await reply(event.replyToken, noFamilyMsg())
        return
      }
      const members = await getFamilyMembers(family.familyId)
      const list = members.map((m, i) => `${i + 1}. ${m.nickname}`).join('\n')
      await reply(event.replyToken, `🏠 ${family.familyName}\n📋 加入碼：${family.joinCode}\n\n👥 成員（${members.length}人）：\n${list}`)
      return
    }

    // ===== 說明 =====
    if (text === '說明' || text === '幫助' || text === 'help') {
      await reply(event.replyToken, `🏠 家庭記帳 Bot 使用說明\n\n【建立/加入】\n• 建立家庭 我的家\n• 加入家庭 XXXXXX\n• 成員\n\n【記帳】直接說：\n• 午餐 120\n• 搭捷運 35\n• 買菜 450\n\n【查詢】\n• 本月 — 月度報表\n• 本週 — 近7天明細\n\n💡 所有家人的帳目會合在一起`)
      return
    }

    // ===== 需要先加入家庭 =====
    const family = await getUserFamily(userId)
    if (!family) {
      await reply(event.replyToken, noFamilyMsg())
      return
    }

    // ===== 本月 =====
    if (text.includes('本月') || text.includes('月報')) {
      const stats = await getFamilyMonthlyStats(family.familyId)
      if (stats.count === 0) {
        await reply(event.replyToken, '📊 本月尚無記帳記錄')
        return
      }
      const catLines = Object.entries(stats.byCategory)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, amt]) => `  ${cat}: $${amt.toLocaleString()}`)
        .join('\n')
      const memberLines = Object.entries(stats.byMember)
        .sort(([, a], [, b]) => b - a)
        .map(([name, amt]) => `  ${name}: $${amt.toLocaleString()}`)
        .join('\n')
      const recent = stats.items.slice(0, 5)
        .map(e => `  ${new Date(e.created_at!).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} ${e.nickname} ${e.description} $${e.amount}`)
        .join('\n')
      await reply(event.replyToken, `📊 ${family.familyName} 本月支出\n──────────────\n💰 總計：$${stats.total.toLocaleString()}（${stats.count} 筆）\n\n按類別：\n${catLines}\n\n按成員：\n${memberLines}\n\n最近5筆：\n${recent}`)
      return
    }

    // ===== 本週 =====
    if (text.includes('本週') || text.includes('週報')) {
      const stats = await getFamilyWeeklyStats(family.familyId)
      if (stats.count === 0) {
        await reply(event.replyToken, '📊 近7天尚無記帳記錄')
        return
      }
      const lines = stats.items
        .map(e => `  ${new Date(e.created_at!).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} ${e.nickname} ${e.category} ${e.description} $${e.amount}`)
        .join('\n')
      await reply(event.replyToken, `📊 ${family.familyName} 近7天\n──────────────\n💰 總計：$${stats.total.toLocaleString()}（${stats.count} 筆）\n\n${lines}`)
      return
    }

    // ===== AI 意圖解析（記帳/聊天）=====
    const parsed = await parseIntent(text)

    if (parsed.type === 'expense' && parsed.amount > 0) {
      await saveFamilyExpense({
        familyId: family.familyId,
        userId,
        nickname: family.nickname,
        amount: Number(parsed.amount),
        category: String(parsed.category || '其他'),
        description: String(parsed.description || text),
      })
      await reply(event.replyToken, `✅ 已記帳！\n👤 ${family.nickname}\n${parsed.category} | ${parsed.description}\n💰 $${Number(parsed.amount).toLocaleString()}\n\n輸入「本月」查看家庭統計`)
    } else if (parsed.type === 'query') {
      // 轉到月報/週報
      const isWeekly = String(parsed.period || '').includes('週')
      if (isWeekly) {
        const stats = await getFamilyWeeklyStats(family.familyId)
        await reply(event.replyToken, stats.count === 0 ? '📊 近7天尚無記錄' : `📊 近7天共 $${stats.total.toLocaleString()}（${stats.count} 筆）`)
      } else {
        const stats = await getFamilyMonthlyStats(family.familyId)
        await reply(event.replyToken, stats.count === 0 ? '📊 本月尚無記錄' : `📊 本月共 $${stats.total.toLocaleString()}（${stats.count} 筆）\n\n輸入「本月」看完整報表`)
      }
    } else if (parsed.type === 'chat' && parsed.reply) {
      await reply(event.replyToken, String(parsed.reply))
    } else {
      await reply(event.replyToken, '🤖 記帳：「午餐 120」\n查詢：「本月」「本週」\n說明：「幫助」')
    }
  } catch (err) {
    console.error('Family handleMessage error:', err)
  }
}

function noFamilyMsg() {
  return '👋 歡迎使用家庭記帳！\n\n請先建立或加入家庭：\n• 建立家庭 我的家\n• 加入家庭 XXXXXX\n\n輸入「幫助」查看完整說明'
}

async function reply(replyToken: string, text: string) {
  await client.replyMessage(replyToken, { type: 'text', text } as TextMessage)
}

async function getRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const body = JSON.parse(rawBody)

  if (!body.events || body.events.length === 0) {
    return res.status(200).json({ ok: true })
  }

  const events: WebhookEvent[] = body.events
  await Promise.all(events.map(handleMessage))

  res.status(200).json({ ok: true })
}

export const config = {
  api: { bodyParser: false },
}
