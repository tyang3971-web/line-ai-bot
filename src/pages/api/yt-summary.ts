import type { NextApiRequest, NextApiResponse } from 'next'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Gemini 原生支援 YouTube URL（不需抓字幕）
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0]
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
  } catch {}
  return null
}

async function getVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`)
    if (res.ok) {
      const data = await res.json()
      return data.title || videoId
    }
  } catch {}
  return videoId
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { url } = req.body
  if (!url) return res.status(400).json({ error: '請提供 YouTube 網址' })

  const videoId = extractVideoId(url)
  if (!videoId) return res.status(400).json({ error: '無法解析 YouTube 網址' })

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`

  // Gemini 直接處理 YouTube URL（支援影片理解，不需要下載或字幕）
  const result = await model.generateContent([
    {
      fileData: {
        fileUri: cleanUrl,
        mimeType: 'video/mp4',
      }
    },
    {
      text: `請用繁體中文產生這部 YouTube 影片的完整摘要，輸出格式如下：

## 🎬 影片主題
（一句話說明這部影片在講什麼）

## 📋 重點摘要
（5-10 個重點，每點用 • 開頭，清楚說明）

## 💡 關鍵概念
（列出影片中提到的重要技術、工具或概念）

## 🔧 實際應用
（這些內容可以怎麼實際應用在工作中）

## ⭐ 最重要的一句話
（用一句話總結這部影片的核心價值）`
    }
  ])

  const summary = result.response.text()
  const title = await getVideoTitle(videoId)

  res.status(200).json({
    videoId,
    title,
    source: 'Gemini 2.0 Flash (direct video understanding)',
    summary,
  })
}
