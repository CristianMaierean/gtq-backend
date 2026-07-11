const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Render Postgres (and most managed Postgres) requires SSL on external
// connections; the Internal Database URL within the same Render private
// network typically doesn't need it, but accepting it either way is safe.
const needsSSL = process.env.RENDER || /render\.com/.test(process.env.DATABASE_URL || '')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
})

// Idempotent — every statement in schema.sql is CREATE TABLE IF NOT EXISTS,
// so this is safe (and cheap) to call on every run. That matters on Render:
// cron job containers are ephemeral, so there's no "run setup once" step to
// remember — the bot self-heals its own schema on every invocation.
async function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8')
  await pool.query(sql)
}

// CLI entrypoint (`npm run setup-db`) — same as ensureSchema, but closes the
// pool afterward since nothing else runs in that process.
async function runMigration() {
  await ensureSchema()
  console.log('Schema applied.')
  await pool.end()
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// ── raw headline dedup (avoid re-classifying the same RSS item every run) ──
async function hasClassifiedHeadline(sourceUrl) {
  const r = await pool.query('SELECT 1 FROM raw_headlines_seen WHERE source_url = $1', [sourceUrl])
  return r.rowCount > 0
}
async function recordClassifiedHeadline(sourceUrl, title, wasHardware) {
  await pool.query(
    `INSERT INTO raw_headlines_seen (source_url, title, was_hardware) VALUES ($1,$2,$3)
     ON CONFLICT (source_url) DO NOTHING`,
    [sourceUrl, title, wasHardware]
  )
}

// ── candidate products + sightings ──────────────────────────────────────
async function getOrCreateSeenProduct(productName, category) {
  const key = norm(productName)
  const existing = await pool.query('SELECT * FROM seen_products WHERE normalized_name = $1', [key])
  if (existing.rowCount) return existing.rows[0]
  const inserted = await pool.query(
    `INSERT INTO seen_products (normalized_name, product_name, category) VALUES ($1,$2,$3) RETURNING *`,
    [key, productName, category]
  )
  return inserted.rows[0]
}

async function addSighting(seenProductId, { sourceName, sourceUrl, title, isOfficial, isRumorSource, publishedAt }) {
  await pool.query(
    `INSERT INTO candidate_sightings (seen_product_id, source_name, source_url, title, is_official, is_rumor_source, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (seen_product_id, source_url) DO NOTHING`,
    [seenProductId, sourceName, sourceUrl, title, !!isOfficial, !!isRumorSource, publishedAt || null]
  )
}

// A candidate is "confirmed" once it has (a) any official-source sighting, or
// (b) 2+ sightings from distinct non-rumor sources.
async function getNewlyConfirmedCandidates() {
  const { rows } = await pool.query(`
    SELECT sp.*
    FROM seen_products sp
    WHERE sp.status = 'candidate'
      AND (
        EXISTS (SELECT 1 FROM candidate_sightings cs WHERE cs.seen_product_id = sp.id AND cs.is_official)
        OR (
          SELECT COUNT(DISTINCT cs.source_name)
          FROM candidate_sightings cs
          WHERE cs.seen_product_id = sp.id AND cs.is_rumor_source = false
        ) >= 2
      )
  `)
  return rows
}

async function getSightingsForProduct(seenProductId) {
  const { rows } = await pool.query(
    'SELECT * FROM candidate_sightings WHERE seen_product_id = $1 ORDER BY fetched_at ASC',
    [seenProductId]
  )
  return rows
}

async function markConfirmed(seenProductId) {
  await pool.query(`UPDATE seen_products SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [seenProductId])
}
async function markPublished(seenProductId) {
  await pool.query(`UPDATE seen_products SET status = 'published', published_at = now() WHERE id = $1`, [seenProductId])
}
async function markRejected(seenProductId) {
  await pool.query(`UPDATE seen_products SET status = 'rejected' WHERE id = $1`, [seenProductId])
}

async function recordArticle(seenProductId, article) {
  await pool.query(
    `INSERT INTO articles (seen_product_id, shopify_article_id, shopify_blog_handle, shopify_article_handle,
       title, seo_title, seo_description, internal_link_url, source_citations)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [seenProductId, article.shopifyArticleId, article.blogHandle, article.articleHandle,
     article.title, article.seoTitle, article.seoDesc, article.internalLinkUrl, JSON.stringify(article.sources)]
  )
}

module.exports = {
  pool, runMigration, ensureSchema, norm,
  hasClassifiedHeadline, recordClassifiedHeadline,
  getOrCreateSeenProduct, addSighting, getNewlyConfirmedCandidates, getSightingsForProduct,
  markConfirmed, markPublished, markRejected, recordArticle,
}
