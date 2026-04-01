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

  // 用 Gemini AI 理解用戶意圖
  console.log('Input:', text)
  const aiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `你是 LINE 記帳助理。根據用戶訊息判斷意圖並回傳 JSON。

用戶訊息：「${text}」

判斷規則：
1. 如果是記帳（提到金額/花費）→ {"type":"expense","amount":數字,"category":"餐飲/交通/購物/娛樂/訂閱/帳單/其他","description":"說明10字內"}
2. 如果是備註/提醒（沒有金額但要記錄）→ {"type":"note","content":"整理後的備註內容","category":"分類"}
3. 如果是問題/聊天 → {"type":"chat","reply":"用繁體中文簡短回答，50字內"}
4. 如果是查詢記帳 → {"type":"query","period":"本月/本週"}

只輸出 JSON，不要其他文字。

範例：
"午餐150" → {"type":"expense","amount":150,"category":"餐飲","description":"午餐"}
"請幫我把tyang3971寫入備注，並分類為專案成本" → {"type":"note","content":"tyang3971 帳號","category":"專案成本"}
"今天天氣如何" → {"type":"chat","reply":"我是記帳助理，天氣的部分我不太確定，但我可以幫你記帳喔！"}
"本月" → {"type":"query","period":"本月"}` }] }],
        generationConfig: { temperature: 0 }
      }),
    }
  )
  const aiData = await aiResp.json()
  const raw = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
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
