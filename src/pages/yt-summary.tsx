import { useState } from 'react'
import Head from 'next/head'

type Result = {
  title: string
  transcriptLength: number
  summary: string
  videoId: string
}

const EXAMPLE_URLS = [
  'https://youtu.be/2u93VTYvG5U',
  'https://www.youtube.com/watch?v=9WCuRL46IcE',
]

export default function YTSummaryPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/yt-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '摘要失敗')
      setResult(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function formatSummary(text: string) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) {
        return (
          <h3 key={i} className="text-blue-400 font-bold text-base mt-6 mb-2">
            {line.replace('## ', '')}
          </h3>
        )
      }
      if (line.startsWith('• ')) {
        return (
          <p key={i} className="text-gray-300 text-sm leading-relaxed pl-2 py-0.5">
            {line}
          </p>
        )
      }
      if (line.trim() === '') return <div key={i} className="h-1" />
      return <p key={i} className="text-gray-300 text-sm leading-relaxed">{line}</p>
    })
  }

  return (
    <>
      <Head>
        <title>YouTube 影片摘要 | AI Tools</title>
      </Head>
      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
        <div className="max-w-3xl mx-auto px-6 py-14">

          {/* Header */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-1.5 rounded-full mb-5">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
              YouTube × Claude AI
            </div>
            <h1 className="text-4xl font-bold mb-3">
              YouTube 影片摘要
            </h1>
            <p className="text-gray-500 text-sm">
              貼上任何 YouTube 連結，AI 自動擷取字幕並生成繁中摘要
            </p>
          </div>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="flex gap-3">
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://youtu.be/... 或 https://www.youtube.com/watch?v=..."
                className="flex-1 bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
              >
                {loading ? '分析中…' : '生成摘要'}
              </button>
            </div>

            {/* Example URLs */}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs text-[#555]">範例：</span>
              {EXAMPLE_URLS.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUrl(u)}
                  className="text-xs text-blue-500 hover:text-blue-400 underline transition-colors"
                >
                  {u.replace('https://', '').slice(0, 30)}…
                </button>
              ))}
            </div>
          </form>

          {/* Loading */}
          {loading && (
            <div className="bg-[#111] border border-[#222] rounded-2xl p-8 text-center">
              <div className="flex justify-center gap-1.5 mb-4">
                {[0, 150, 300].map(delay => (
                  <div key={delay} className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
              <p className="text-[#888] text-sm">正在擷取字幕並分析內容…</p>
              <p className="text-[#555] text-xs mt-1">通常需要 10–20 秒</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              {/* Video info */}
              <div className="bg-[#111] border border-[#222] rounded-2xl p-5 flex items-center gap-4">
                <img
                  src={`https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg`}
                  alt={result.title}
                  className="w-28 rounded-lg flex-shrink-0 object-cover"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-snug mb-1 line-clamp-2">
                    {result.title}
                  </p>
                  <p className="text-xs text-[#555]">
                    字幕長度：{(result.transcriptLength / 1000).toFixed(1)}K 字元 · Claude Sonnet 4.6 分析
                  </p>
                  <a
                    href={`https://youtu.be/${result.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-500 hover:underline mt-1 inline-block"
                  >
                    在 YouTube 觀看 →
                  </a>
                </div>
              </div>

              {/* Summary content */}
              <div className="bg-[#111] border border-[#222] rounded-2xl p-6">
                {formatSummary(result.summary)}
              </div>

              {/* Copy button */}
              <button
                onClick={() => navigator.clipboard.writeText(result.summary)}
                className="w-full border border-[#222] hover:border-[#444] text-[#888] hover:text-white py-2.5 rounded-xl text-sm transition-colors"
              >
                複製摘要文字
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
