// Anthropic 官方 blog 最新文章（HTML scraping）
import type { NewsItem } from './hackernews'

export async function scrapeAnthropicBlog(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://www.anthropic.com/news', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; line-ai-bot/1.0)' }
    })
    const html = await res.text()

    // 抓取文章標題和連結（Anthropic blog 結構）
    const articleRegex = /<a[^>]+href="(\/news\/[^"]+)"[^>]*>[\s\S]*?<[^>]*>([^<]{10,})<\/[^>]*>/g
    const results: NewsItem[] = []
    const seen = new Set<string>()
    let match

    while ((match = articleRegex.exec(html)) !== null) {
      const path = match[1]
      const title = match[2].trim().replace(/\s+/g, ' ')
      if (seen.has(path) || title.length < 15) continue
      seen.add(path)
      results.push({
        title,
        url: `https://www.anthropic.com${path}`,
        score: 100, // 官方部落格優先
        source: 'Anthropic Blog',
      })
      if (results.length >= 5) break
    }

    return results
  } catch {
    return []
  }
}
