import Anthropic from '@anthropic-ai/sdk'
import type { NewsItem } from './scrapers/hackernews'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function summarizeNews(items: NewsItem[]): Promise<string> {
  if (items.length === 0) return '今天沒有找到相關新聞。'

  const itemList = items
    .map((item, i) => `${i + 1}. [${item.source}] ${item.title}\n   ${item.url}`)
    .join('\n\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', // 用 Haiku 省成本
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `你是 AI 新聞整理助手。以下是今天 AI / Claude 相關的最新文章列表，請用繁體中文：
1. 為每篇文章寫一行重點摘要（30字內）
2. 最後寫3行「今日重點觀察」

文章列表：
${itemList}

請用這個格式輸出：
---
📰 今日 AI 精選（${new Date().toLocaleDateString('zh-TW')}）
---

[逐條摘要，每條格式：• 標題：重點說明（來源）]

---
🔍 今日觀察
1. ...
2. ...
3. ...`,
      },
    ],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}

export async function parseExpense(text: string): Promise<{
  amount: number
  category: string
  description: string
} | null> {
  // 先用簡單 regex 嘗試解析（不消耗 API）
  // 支援全形空格、多空格、各種分隔
  const cleaned = text.replace(/[\u3000\u00A0]/g, ' ').replace(/\s+/g, ' ').trim()
  console.log('cleaned text:', JSON.stringify(cleaned))
  // 支援「午餐 150」和「午餐150」（有無空格都行）
  const match = cleaned.match(/^(.+?)\s*(\d+)\s*(.*)$/)
  if (match) {
    const desc = match[1].trim()
    const amount = parseInt(match[2])
    const extra = match[3].trim()
    if (amount > 0) {
      // 簡單分類
      const catMap: Record<string, string> = {
        '早餐':'餐飲','午餐':'餐飲','晚餐':'餐飲','宵夜':'餐飲','咖啡':'餐飲','飲料':'餐飲','吃':'餐飲','喝':'餐飲','便當':'餐飲','麵':'餐飲','飯':'餐飲',
        '捷運':'交通','公車':'交通','計程車':'交通','uber':'交通','油':'交通','停車':'交通','高鐵':'交通','火車':'交通','搭':'交通',
        '買':'購物','衣':'購物','鞋':'購物','包':'購物',
        '電影':'娛樂','遊戲':'娛樂','唱歌':'娛樂','KTV':'娛樂',
      }
      let category = extra || '其他'
      for (const [kw, cat] of Object.entries(catMap)) {
        if (desc.includes(kw)) { category = cat; break }
      }
      return { amount, category, description: desc }
    }
  }

  // 也嘗試「數字在前」的格式：150 午餐
  const match2 = cleaned.match(/^(\d+)\s+(.+)$/)
  if (match2) {
    const amount = parseInt(match2[1])
    const desc = match2[2].trim()
    if (amount > 0) {
      return { amount, category: '其他', description: desc }
    }
  }

  return null
}
