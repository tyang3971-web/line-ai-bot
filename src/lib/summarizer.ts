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

const PARSE_PROMPT = `從以下文字提取記帳資訊。只輸出JSON，不要其他文字。

規則：
- amount: 實際花費金額（數字）。找「元」「塊」「$」前面的數字，或文中最合理的消費金額。注意：帳號ID中的數字不是金額。
- category: 分類（餐飲/交通/購物/娛樂/訂閱/帳單/其他）
- description: 簡短說明（10字內）

如果不是記帳訊息，回傳 {"amount":0}

範例：
"午餐150" → {"amount":150,"category":"餐飲","description":"午餐"}
"Gemini tyang3971帳號55元 信用卡" → {"amount":55,"category":"訂閱","description":"Gemini帳號"}
"搭捷運35" → {"amount":35,"category":"交通","description":"搭捷運"}
"星巴克 拿鐵 180" → {"amount":180,"category":"餐飲","description":"星巴克拿鐵"}`

export async function parseExpense(text: string): Promise<{
  amount: number
  category: string
  description: string
} | null> {
  const prompt = `${PARSE_PROMPT}\n\n"${text}"`

  // 優先 Claude Haiku
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = raw.match(/\{[^}]+\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    console.log('Claude parsed:', JSON.stringify(parsed))
    if (!parsed.amount || parsed.amount <= 0) return null
    return parsed
  } catch (e) {
    console.error('Claude parseExpense failed, trying Gemini fallback:', e)
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
            generationConfig: { temperature: 0 },
          }),
        }
      )
      const data = await resp.json()
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      const jsonMatch = raw.match(/\{[^}]+\}/)
      if (!jsonMatch) return null
      const parsed = JSON.parse(jsonMatch[0])
      console.log('Gemini parsed:', JSON.stringify(parsed))
      if (!parsed.amount || parsed.amount <= 0) return null
      return parsed
    } catch (e) {
      console.error('Gemini parseExpense also failed:', e)
    }
  }

  return null
}
