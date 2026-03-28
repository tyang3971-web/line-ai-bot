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

  // 嘗試解析記帳
  const expense = await parseExpense(text)
  if (expense) {
    await saveExpense({
      user_id: userId,
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
    })
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 已記帳！\n${expense.category} | ${expense.description}\n💰 $${expense.amount.toLocaleString()}\n\n輸入「本月」查看統計`,
    } as TextMessage)
  } else {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `💡 說明：\n記帳：「午餐 120」\n查詢：「本月」「本週」\n新聞：「今日新聞」\n\n輸入「幫助」查看完整說明`,
    } as TextMessage)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const signature = req.headers['x-line-signature'] as string
  const body = JSON.stringify(req.body)

  if (!validateSignature(body, lineConfig.channelSecret, signature)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const events: WebhookEvent[] = req.body.events
  await Promise.all(events.map(handleMessage))

  res.status(200).json({ ok: true })
}

export const config = {
  api: { bodyParser: true },  // LINE SDK reads req.body directly
}
