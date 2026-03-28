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
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `從這段文字中提取記帳資訊，輸出 JSON（只輸出JSON，不要其他文字）：
"${text}"

格式：{"amount": 數字, "category": "餐飲|交通|購物|娛樂|其他", "description": "說明"}

如果不是記帳訊息，輸出：{"amount": 0}`,
      },
    ],
  })

  try {
    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const parsed = JSON.parse(raw.trim())
    if (!parsed.amount || parsed.amount <= 0) return null
    return parsed
  } catch {
    return null
  }
}
