const { JSDOM } = require('jsdom')
const { Readability } = require('@mozilla/readability')

function extractPreviewImage(html) {
  const ogA = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  const ogB = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  const og = ogA || ogB
  if (og) return og[1]
  const twA = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
  const twB = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)
  const tw = twA || twB
  return tw ? tw[1] : null
}

/**
 * Best-effort extraction of the readable article text AND its preview image
 * (og:image / twitter:image — the image the source outlet itself displays
 * for the story) from a news URL. Returns null on failure (paywalled,
 * blocked, malformed) — callers should skip that source rather than draft
 * from an empty/garbage excerpt.
 */
async function fetchArticleContent(url) {
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
    const text = article.textContent.replace(/\s+/g, ' ').trim().slice(0, 8000) // cap excerpt length
    const imageUrl = extractPreviewImage(html)
    return { text, imageUrl }
  } catch (e) {
    console.log(`  ! could not fetch/parse ${url}: ${e.message}`)
    return null
  }
}

module.exports = { fetchArticleContent }
