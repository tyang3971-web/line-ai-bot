// 本地測試爬蟲效果
// 執行：node scripts/test-scrapers.mjs

async function testHN() {
  const res = await fetch('https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&numericFilters=points>20&query=Claude+AI')
  const json = await res.json()
  console.log('\n🔶 Hacker News:')
  for (const hit of json.hits) {
    console.log(`  [${hit.points}pts] ${hit.title}`)
    console.log(`  ${hit.url}`)
  }
}

async function testReddit() {
  const res = await fetch('https://www.reddit.com/r/ClaudeAI/hot.json?limit=5', {
    headers: { 'User-Agent': 'test-bot/1.0' }
  })
  const json = await res.json()
  console.log('\n🔷 Reddit r/ClaudeAI:')
  for (const post of json.data.children.slice(0, 5)) {
    const d = post.data
    if (!d.stickied) console.log(`  [${d.score}pts] ${d.title}`)
  }
}

async function testAnthropic() {
  const res = await fetch('https://www.anthropic.com/news', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  const html = await res.text()
  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  console.log('\n🔵 Anthropic Blog:')
  console.log(`  Page title: ${titleMatch?.[1]}`)
  // 簡單確認頁面可以抓到
  console.log(`  Content length: ${html.length} chars`)
}

await testHN().catch(e => console.error('HN error:', e.message))
await testReddit().catch(e => console.error('Reddit error:', e.message))
await testAnthropic().catch(e => console.error('Anthropic error:', e.message))
console.log('\n✅ Scraper test complete')
