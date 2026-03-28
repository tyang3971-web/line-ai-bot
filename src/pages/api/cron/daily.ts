// Vercel Cron Job - 每天台灣時間 18:00 執行（UTC 10:00）
// vercel.json 設定：{"crons": [{"path": "/api/cron/daily", "schedule": "0 10 * * *"}]}

import type { NextApiRequest, NextApiResponse } from 'next'
import { scrapeHackerNews } from '@/lib/scrapers/hackernews'
import { scrapeReddit } from '@/lib/scrapers/reddit'
import { scrapeAnthropicBlog } from '@/lib/scrapers/anthropic'
import { summarizeNews } from '@/lib/summarizer'
import { sendDailyDigest } from '@/lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 驗證 Vercel Cron 呼叫（防止外部觸發）
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('🤖 Daily digest starting...')

    // 並行爬取所有來源
    const [hn, reddit, anthropic] = await Promise.all([
      scrapeHackerNews(),
      scrapeReddit(),
      scrapeAnthropicBlog(),
    ])

    // 合併並去重（Anthropic 官方優先）
    const allItems = [...anthropic, ...hn, ...reddit]
    const seen = new Set<string>()
    const uniqueItems = allItems.filter(item => {
      if (seen.has(item.url)) return false
      seen.add(item.url)
      return true
    }).slice(0, 15)

    console.log(`📰 Found ${uniqueItems.length} items (Anthropic: ${anthropic.length}, HN: ${hn.length}, Reddit: ${reddit.length})`)

    // Claude Haiku 生成摘要
    const summary = await summarizeNews(uniqueItems)

    // 發送 Email
    await sendDailyDigest(summary, uniqueItems)

    console.log('✅ Daily digest sent to chem7324@gmail.com')
    res.status(200).json({
      success: true,
      itemCount: uniqueItems.length,
      sources: { anthropic: anthropic.length, hn: hn.length, reddit: reddit.length },
    })
  } catch (err) {
    console.error('Daily digest error:', err)
    res.status(500).json({ error: String(err) })
  }
}
