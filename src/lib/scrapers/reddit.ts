// 替代 Reddit（Reddit 封鎖未授權）
// 使用 HN Algolia API 搜尋多個關鍵字 + MIT Technology Review RSS
import type { NewsItem } from './hackernews'

// HN 補充搜尋（不同關鍵字，避免和 hackernews.ts 重複）
const EXTRA_QUERIES = ['AI agent', 'large language model', 'GPT Claude Gemini']

export async function scrapeReddit(): Promise<NewsItem[]> {
  const results: NewsItem[] = []

  // 1. HN 補充搜尋（AI 更廣泛話題）
  for (const q of EXTRA_QUERIES) {
    try {
      const res = await fetch(
        `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=3&numericFilters=points>30&query=${encodeURIComponent(q)}`
      )
      if (!res.ok) continue
      const json = await res.json()
      for (const hit of (json.hits || [])) {
        if (!hit.url) continue
        results.push({
          title: hit.title,
          url: hit.url,
          score: hit.points || 0,
          source: 'Hacker News (AI)',
        })
      }
    } catch { /* skip */ }
  }

  // 2. Dev.to AI tag（公開 API）
  try {
    const res = await fetch('https://dev.to/api/articles?tag=ai&per_page=5&top=1')
    if (res.ok) {
      const articles = await res.json()
      for (const a of articles) {
        results.push({
          title: a.title,
          url: a.url,
          score: (a.positive_reactions_count || 0) + (a.comments_count || 0) * 2,
          source: 'Dev.to',
        })
      }
    }
  } catch { /* skip */ }

  return results.sort((a, b) => b.score - a.score).slice(0, 8)
}
