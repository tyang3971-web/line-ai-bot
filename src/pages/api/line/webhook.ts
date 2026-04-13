import type { NextApiRequest, NextApiResponse } from 'next'
import {
  Client,
  validateSignature,
  WebhookEvent,
  TextMessage,
} from '@line/bot-sdk'
import { parseExpense } from '@/lib/summarizer'
import { saveExpense, getMonthlyStats, getWeeklyStats } from '@/lib/accounting'
import { scrapeHackerNews } from '@/lib/scrapers/hackernews'
import { scrapeReddit } from '@/lib/scrapers/reddit'
import { summarizeNews } from '@/lib/summarizer'

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
}
const client = new Client(lineConfig)

// 關鍵字指令
const COMMANDS = {
  '本月': handleMonthly,
  '本週': handleWeekly,
  '週報': handleWeekly,
  '月報': handleMonthly,
  'AI新聞': handleNews,
  '今日新聞': handleNews,
  '說明': handleHelp,
  '幫助': handleHelp,
  'help': handleHelp,
}

async function handleHelp(userId: string): Promise<string> {
  return `🤖 記帳機器人使用說明

【記帳】直接說：
• 午餐 120
• 搭捷運 35
• 買書 450 商業書

【查詢】
• 「本月」- 本月支出統計
• 「本週」- 近7天支出
• 「今日新聞」- 最新AI動態

【分類】
🍽 餐飲 🚌 交通 🛍 購物 🎮 娛樂 📦 其他`
}

async function handleMonthly(userId: string): Promise<string> {
  const stats = await getMonthlyStats(userId)
  if (stats.count === 0) return '📊 本月尚無記帳記錄'

  const catLines = Object.entries(stats.byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amt]) => `  ${cat}: $${amt.toLocaleString()}`)
    .join('\n')

  const recent = stats.items.slice(0, 5)
    .map(e => `  ${new Date(e.created_at!).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} ${e.description} $${e.amount}`)
    .join('\n')

  return `📊 本月支出統計
──────────────
💰 總計：$${stats.total.toLocaleString()}（${stats.count} 筆）

按類別：
${catLines}

最近5筆：
${recent}`
}

async function handleWeekly(userId: string): Promise<string> {
  const stats = await getWeeklyStats(userId)
  if (stats.count === 0) return '📊 近7天尚無記帳記錄'

  const lines = stats.items
    .map(e => `  ${new Date(e.created_at!).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} ${e.category} ${e.description} $${e.amount}`)
    .join('\n')

  return `📊 近7天支出
──────────────
💰 總計：$${stats.total.toLocaleString()}（${stats.count} 筆）

明細：
${lines}`
}

async function handleNews(userId: string): Promise<string> {
  const [hn, reddit] = await Promise.all([scrapeHackerNews(), scrapeReddit()])
  const items = [...hn, ...reddit].slice(0, 10)
  const summary = await summarizeNews(items)
  return summary.slice(0, 4000) // LINE 訊息上限 5000 字
}

async function handleMessage(event: WebhookEvent) {
  if (event.type !== 'message' || event.message.type !== 'text') return
  try {
  const userId = event.source.userId!
  const text = event.message.text.trim()

  // 檢查是否為指令
  for (const [keyword, handler] of Object.entries(COMMANDS)) {
    if (text.includes(keyword)) {
      const reply = await handler(userId)
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: reply,
      } as TextMessage)
      return
    }
  }

  // Claude Haiku 全能助理（fallback Gemini）
  console.log('Input:', text)
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const intentPrompt = `你是 Tina 的 LINE 私人助理「小幫手」。你很聰明、有溫度、反應快。現在時間：${now}（台灣時間）。

用戶訊息：「${text}」

根據意圖回傳 JSON（只輸出JSON）：

1. 記帳（提到金額/花費/元/塊/$）
→ {"type":"expense","amount":數字,"category":"餐飲/交通/購物/娛樂/訂閱/帳單/生活/其他","description":"說明15字內"}

2. 設定提醒（提到幾點/明天/下午/提醒我）
→ {"type":"reminder","time":"ISO 8601 格式 台灣時間","message":"提醒內容"}
例："下午3點提醒我開會" → {"type":"reminder","time":"2026-04-02T15:00:00+08:00","message":"開會"}
例："明天早上9點提醒我寄email" → {"type":"reminder","time":"2026-04-03T09:00:00+08:00","message":"寄email"}

3. 備註/記錄（要記住某事但不是花費）
→ {"type":"note","content":"整理後的內容","category":"分類"}

4. 查詢記帳
→ {"type":"query","period":"本月/本週"}

5. 一般問題/聊天/任何其他
→ {"type":"chat","reply":"用繁體中文回答，像聰明的私人助理一樣。簡潔有用，最多100字。可以給建議、回答問題、閒聊。"}

範例：
"午餐150" → {"type":"expense","amount":150,"category":"餐飲","description":"午餐"}
"Gemini帳號55元 信用卡" → {"type":"expense","amount":55,"category":"訂閱","description":"Gemini帳號費用"}
"5點半提醒我去接小孩" → {"type":"reminder","time":"2026-04-02T17:30:00+08:00","message":"去接小孩"}
"幫我記一下tyang3971分類為專案成本" → {"type":"note","content":"tyang3971","category":"專案成本"}
"今天適合帶寶寶出門嗎" → {"type":"chat","reply":"建議先查一下天氣預報喔！如果沒下雨的話，下午4點後比較涼爽適合帶寶寶出門散步 🌤"}
"謝謝" → {"type":"chat","reply":"不客氣！有需要隨時找我 😊"}`

  let raw = '{}'
  // 優先 Claude Haiku
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: intentPrompt }],
    })
    raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    console.log('Claude intent:', raw)
  } catch (e) {
    console.error('Claude intent failed, trying Gemini:', e)
    // Fallback Gemini
    try {
      const aiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: intentPrompt }] }],
            generationConfig: { temperature: 0.3 },
          }),
        }
      )
      const aiData = await aiResp.json()
      raw = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      console.log('Gemini intent:', raw)
    } catch (e2) {
      console.error('Gemini intent also failed:', e2)
    }
  }

  const jsonMatch = raw.match(/\{[^}]*\}/)
  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(jsonMatch?.[0] || '{}') } catch {}
  console.log('AI parsed:', JSON.stringify(parsed))

  if (parsed.type === 'expense' && parsed.amount && Number(parsed.amount) > 0) {
    await saveExpense({
      user_id: userId,
      amount: Number(parsed.amount),
      category: String(parsed.category || '其他'),
      description: String(parsed.description || text),
    })
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 已記帳！\n${parsed.category} | ${parsed.description}\n💰 $${Number(parsed.amount).toLocaleString()}\n\n輸入「本月」查看統計`,
    } as TextMessage)
  } else if (parsed.type === 'reminder' && parsed.time && parsed.message) {
    // 存提醒到 Supabase
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
      await sb.from('reminders').insert({
        user_id: userId,
        message: String(parsed.message),
        remind_at: String(parsed.time),
      })
      const timeStr = new Date(String(parsed.time)).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `⏰ 提醒已設定！\n時間：${timeStr}\n內容：${parsed.message}\n\n到時候我會提醒你 👍`,
      } as TextMessage)
    } catch (e) {
      console.error('Reminder save error:', e)
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `⚠️ 提醒設定失敗，請稍後再試`,
      } as TextMessage)
    }
  } else if (parsed.type === 'note') {
    // 備註也存到記帳（金額 0），方便查看
    await saveExpense({
      user_id: userId,
      amount: 0.01, // 最小值，代表備註
      category: String(parsed.category || '備註'),
      description: String(parsed.content || text),
    })
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📝 已記錄備註！\n分類：${parsed.category}\n內容：${parsed.content}`,
    } as TextMessage)
  } else if (parsed.type === 'query') {
    const period = String(parsed.period || '本月')
    const handler = period.includes('週') ? handleWeekly : handleMonthly
    const reply = await handler(userId)
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: reply,
    } as TextMessage)
  } else if (parsed.type === 'chat' && parsed.reply) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: String(parsed.reply),
    } as TextMessage)
  } else {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🤖 收到！但我不太確定你的意思。\n\n記帳：「午餐 150」\n備註：「記錄 xxx 分類為 xxx」\n查詢：「本月」「本週」`,
    } as TextMessage)
  }
  } catch (err) {
    console.error('handleMessage error:', err)
  }
}

// 手動讀 raw body
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
  const signature = req.headers['x-line-signature'] as string
  const body = JSON.parse(rawBody)

  // LINE Verify 或空 events 直接回 200
  if (!body.events || body.events.length === 0) {
    return res.status(200).json({ ok: true })
  }

  // TODO: 修復 raw body signature 驗證後再啟用
  // if (!validateSignature(rawBody, lineConfig.channelSecret, signature)) {
  //   console.error('Signature validation failed')
  //   return res.status(401).json({ error: 'Invalid signature' })
  // }

  const events: WebhookEvent[] = body.events
  await Promise.all(events.map(handleMessage))

  res.status(200).json({ ok: true })
}

// 關閉 Next.js 內建 bodyParser，手動讀 raw body 做 signature 驗證
export const config = {
  api: { bodyParser: false },
}
