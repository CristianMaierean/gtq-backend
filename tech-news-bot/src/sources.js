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
  // Added 2026-07-17 to widen the pool of raw candidates/corroboration chances
  // (same classifier + 2-source rule — this only adds more sources, not a lower bar).
  { name: 'HotHardware', url: 'https://hothardware.com/rss/news', isRumorSource: false },
  { name: 'KitGuru', url: 'https://www.kitguru.net/feed/', isRumorSource: false },
  { name: 'Neowin', url: 'https://www.neowin.net/news/rss/', isRumorSource: false },
  { name: 'PC Gamer', url: 'https://www.pcgamer.com/rss/', isRumorSource: false },
  { name: 'Digital Trends (Computing)', url: 'https://www.digitaltrends.com/computing/feed/', isRumorSource: false },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', isRumorSource: false },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', isRumorSource: false },
  { name: 'Windows Central', url: 'https://www.windowscentral.com/rss.xml', isRumorSource: false },
  // Tried and excluded: Tweaktown and Overclock3D 403 even with a real browser
  // User-Agent (Cloudflare bot protection, not UA-based) — would just log
  // failed-fetch noise every run. Notebookcheck and AnandTech's RSS endpoints
  // returned 404 (URLs may have changed or the feed was discontinued) — revisit
  // later if a working feed URL turns up.
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
