// Reddit - r/ClaudeAI, r/MachineLearning, r/artificial 新文章
import type { NewsItem } from './hackernews'

const SUBREDDITS = ['ClaudeAI', 'artificial', 'MachineLearning']
const HEADERS = { 'User-Agent': 'line-ai-bot/1.0 (daily digest)' }

export async function scrapeReddit(): Promise<NewsItem[]> {
  const results: NewsItem[] = []

  for (const sub of SUBREDDITS) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/hot.json?limit=5`,
        { headers: HEADERS }
      )
      const json = await res.json()
      const posts = json?.data?.children || []
      for (const post of posts) {
        const d = post.data
        if (d.stickied || d.score < 10) continue
        results.push({
          title: d.title,
          url: d.url?.startsWith('http') ? d.url : `https://reddit.com${d.permalink}`,
          score: d.score,
          source: `r/${sub}`,
        })
      }
    } catch {
      // skip if subreddit unavailable
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8)
}
