// Hacker News - 搜尋 AI / Claude 相關熱門文章
export type NewsItem = {
  title: string
  url: string
  score: number
  source: string
}

const HN_SEARCH = 'https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&numericFilters=points>20&query='

export async function scrapeHackerNews(): Promise<NewsItem[]> {
  const queries = ['Claude AI', 'Anthropic', 'LLM AI agent']
  const seen = new Set<string>()
  const results: NewsItem[] = []

  for (const q of queries) {
    const res = await fetch(`${HN_SEARCH}${encodeURIComponent(q)}`)
    const json = await res.json()
    for (const hit of json.hits || []) {
      if (!hit.url || seen.has(hit.objectID)) continue
      seen.add(hit.objectID)
      results.push({
        title: hit.title,
        url: hit.url,
        score: hit.points || 0,
        source: 'Hacker News',
      })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8)
}
