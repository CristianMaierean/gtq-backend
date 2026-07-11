require('dotenv').config({ quiet: true })

const db = require('./db')
const { fetchAllFeedItems } = require('./sources')
const { classifyHeadline } = require('./classify')
const { fetchArticleText } = require('./fetch-article')
const { draftArticle } = require('./draft')
const { renderArticleHtml } = require('./template')
const { publishArticle } = require('./shopify')

const LOOKBACK_DAYS = parseInt(process.env.LOOKBACK_DAYS || '2', 10)
const CONFIDENCE_THRESHOLD = 0.6
const MAX_SOURCES_PER_ARTICLE = 3

async function discoverAndClassify() {
  const items = await fetchAllFeedItems(LOOKBACK_DAYS)
  console.log(`Fetched ${items.length} RSS items from the last ${LOOKBACK_DAYS} day(s).`)

  let classified = 0, hardwareHits = 0
  for (const item of items) {
    if (await db.hasClassifiedHeadline(item.sourceUrl)) continue
    let result
    try {
      result = await classifyHeadline({ title: item.title, snippet: item.snippet, sourceName: item.sourceName })
    } catch (e) {
      console.log(`  ! classify failed for "${item.title}": ${e.message}`)
      continue
    }
    classified++
    await db.recordClassifiedHeadline(item.sourceUrl, item.title, result.is_new_hardware_announcement)

    if (result.is_new_hardware_announcement && result.confidence >= CONFIDENCE_THRESHOLD && result.product_name) {
      hardwareHits++
      const product = await db.getOrCreateSeenProduct(result.product_name, result.category)
      await db.addSighting(product.id, {
        sourceName: item.sourceName, sourceUrl: item.sourceUrl, title: item.title,
        isOfficial: item.isOfficial, isRumorSource: item.isRumorSource, publishedAt: item.publishedAt,
      })
      console.log(`  + candidate sighting: "${result.product_name}" (${result.category}) via ${item.sourceName}`)
    }
  }
  console.log(`Classified ${classified} new headlines, ${hardwareHits} hardware-announcement hits.`)
}

async function draftAndPublishConfirmed() {
  const confirmed = await db.getNewlyConfirmedCandidates()
  console.log(`${confirmed.length} candidate(s) newly confirmed (2+ sources or an official source).`)

  for (const product of confirmed) {
    await db.markConfirmed(product.id)
    const sightings = (await db.getSightingsForProduct(product.id)).slice(0, MAX_SOURCES_PER_ARTICLE)

    console.log(`\n→ Drafting: "${product.product_name}" (${product.category}) — ${sightings.length} source(s)`)
    const excerpts = []
    for (const s of sightings) {
      const text = await fetchArticleText(s.source_url)
      if (text) excerpts.push({ sourceName: s.source_name, sourceUrl: s.source_url, text })
    }
    if (excerpts.length === 0) {
      console.log('  ! could not fetch readable text from any source — skipping, will retry next run')
      continue // leave status='confirmed' so it's retried, not lost
    }

    let draft
    try {
      draft = await draftArticle({ productName: product.product_name, category: product.category, excerpts })
    } catch (e) {
      console.log(`  ! draft failed: ${e.message}`)
      continue
    }

    const bodyHtml = renderArticleHtml(draft, sightings, product.category)

    try {
      const { blogHandle, article } = await publishArticle({
        title: draft.headline, handle: draft.slug, bodyHtml,
        seoTitle: draft.seoTitle, seoDesc: draft.seoDescription, tags: product.category,
      })
      await db.recordArticle(product.id, {
        shopifyArticleId: article.id, blogHandle, articleHandle: article.handle,
        title: draft.headline, seoTitle: draft.seoTitle, seoDesc: draft.seoDescription,
        internalLinkUrl: draft.internalLinkUrl, sources: sightings.map(s => ({ name: s.source_name, url: s.source_url })),
      })
      await db.markPublished(product.id)
      console.log(`  ✓ published: /blogs/${blogHandle}/${article.handle}`)
    } catch (e) {
      console.log(`  ! publish failed: ${e.message}`)
    }
  }
}

;(async () => {
  console.log(`=== tech-news-bot run started ${new Date().toISOString()} ===`)
  await db.ensureSchema()
  await discoverAndClassify()
  await draftAndPublishConfirmed()
  console.log('=== run complete ===')
  await db.pool.end()
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
