// 本地測試爬蟲效果
// 執行：node scripts/test-scrapers.mjs

async function testHN(query = 'Claude AI') {
  const res = await fetch(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&numericFilters=points>20&query=${encodeURIComponent(query)}`)
  const json = await res.json()
  console.log(`\n🔶 Hacker News "${query}":`)
  for (const hit of json.hits.slice(0, 3)) {
    console.log(`  [${hit.points}pts] ${hit.title}`)
  }
}

async function testDevTo() {
  const res = await fetch('https://dev.to/api/articles?tag=ai&per_page=5&top=1')
  const articles = await res.json()
  console.log('\n🟢 Dev.to AI:')
  for (const a of articles.slice(0, 3)) {
    console.log(`  [👍${a.positive_reactions_count}] ${a.title}`)
  }
}

async function testAnthropic() {
  const res = await fetch('https://www.anthropic.com/news', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  const html = await res.text()
  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  console.log('\n🔵 Anthropic Blog:')
  console.log(`  Page OK: ${res.ok} | Size: ${(html.length/1024).toFixed(0)}KB`)
  console.log(`  Title: ${titleMatch?.[1]}`)
}

await testHN('Claude AI').catch(e => console.error('HN Claude error:', e.message))
await testHN('AI agent').catch(e => console.error('HN Agent error:', e.message))
await testDevTo().catch(e => console.error('DevTo error:', e.message))
await testAnthropic().catch(e => console.error('Anthropic error:', e.message))
console.log('\n✅ All scrapers OK')
