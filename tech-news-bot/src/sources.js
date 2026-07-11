const Parser = require('rss-parser')
const parser = new Parser({
  timeout: 15000,
  // Some outlets 403 generic/bot-flagged User-Agents (common for cloud/
  // datacenter IPs like Render's) — a normal browser UA avoids that for
  // sites that only check the header rather than doing deeper bot detection.
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
})

/**
 * Curated RSS sources. `isRumorSource: true` means this outlet alone can
 * never confirm a candidate — it always needs a second, distinct source.
 * `isOfficial: true` (none configured by default) would let a single
 * sighting confirm immediately — reserve that for manufacturer newsrooms
 * you trust and have vetted, e.g. NVIDIA/AMD/Intel press RSS feeds if you
 * add them later.
 */
const FEEDS = [
  { name: "Tom's Hardware", url: 'https://www.tomshardware.com/feeds/all', isRumorSource: false },
  { name: 'TechPowerUp', url: 'https://www.techpowerup.com/rss/news', isRumorSource: false },
  { name: 'Guru3D', url: 'https://www.guru3d.com/rss/news.xml', isRumorSource: false },
  { name: 'Wccftech', url: 'https://wccftech.com/feed/', isRumorSource: false },
  { name: 'PCWorld', url: 'https://www.pcworld.com/feed', isRumorSource: false },
  { name: 'Ars Technica (Gadgets)', url: 'https://arstechnica.com/gadgets/feed/', isRumorSource: false },
  { name: 'VideoCardz', url: 'https://videocardz.com/feed', isRumorSource: true }, // GPU rumor mill — corroboration only
]

async function fetchAllFeedItems(lookbackDays) {
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  const items = []
  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url)
      for (const item of parsed.items) {
        const publishedAt = item.isoDate ? new Date(item.isoDate) : null
        if (publishedAt && publishedAt.getTime() < cutoff) continue
        items.push({
          sourceName: feed.name,
          sourceUrl: item.link,
          title: item.title,
          snippet: (item.contentSnippet || item.summary || '').slice(0, 500),
          publishedAt,
          isOfficial: !!feed.isOfficial,
          isRumorSource: !!feed.isRumorSource,
        })
      }
    } catch (e) {
      console.log(`! feed fetch failed: ${feed.name} — ${e.message}`)
    }
  }
  return items
}

module.exports = { FEEDS, fetchAllFeedItems }
