const { JSDOM } = require('jsdom')
const { Readability } = require('@mozilla/readability')

/**
 * Best-effort extraction of the readable article text from a news URL.
 * Returns null on failure (paywalled, blocked, malformed) — callers should
 * skip that source rather than draft from an empty/garbage excerpt.
 */
async function fetchArticleText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GamerTechNewsBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const dom = new JSDOM(html, { url })
    const article = new Readability(dom.window.document).parse()
    if (!article || !article.textContent) return null
    return article.textContent.replace(/\s+/g, ' ').trim().slice(0, 8000) // cap excerpt length
  } catch (e) {
    console.log(`  ! could not fetch/parse ${url}: ${e.message}`)
    return null
  }
}

module.exports = { fetchArticleText }
