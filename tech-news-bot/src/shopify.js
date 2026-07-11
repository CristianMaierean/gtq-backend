const STORE = process.env.SHOPIFY_STORE
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN
const VERSION = process.env.SHOPIFY_API_VERSION || '2024-10'
const BASE = `https://${STORE}.myshopify.com/admin/api/${VERSION}`
const H = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function rest(method, endpoint, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${BASE}${endpoint}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * (attempt + 1)); continue }
    const text = await r.text()
    const data = text ? JSON.parse(text) : {}
    if (!r.ok) throw new Error(`${method} ${endpoint} -> ${r.status}: ${text.slice(0, 400)}`)
    await sleep(350)
    return data
  }
  throw new Error(`${method} ${endpoint} -> rate-limited after retries`)
}

let cachedBlogId = null
async function ensureBlog() {
  if (cachedBlogId) return cachedBlogId
  const title = process.env.SHOPIFY_NEWS_BLOG_TITLE || 'PC Tech News'
  const handle = process.env.SHOPIFY_NEWS_BLOG_HANDLE || 'pc-tech-news'
  const existing = await rest('GET', '/blogs.json')
  const found = existing.blogs.find(b => b.handle === handle)
  if (found) { cachedBlogId = found.id; return found.id }
  const created = await rest('POST', '/blogs.json', { blog: { title, handle, commentable: 'no' } })
  cachedBlogId = created.blog.id
  return cachedBlogId
}

async function publishArticle({ title, handle, bodyHtml, seoTitle, seoDesc, tags }) {
  const blogId = await ensureBlog()
  const payload = { article: {
    title, handle, author: 'GamerTech', body_html: bodyHtml, published: true, tags,
    metafields: [
      { namespace: 'global', key: 'title_tag', value: seoTitle, type: 'single_line_text_field' },
      { namespace: 'global', key: 'description_tag', value: seoDesc, type: 'single_line_text_field' },
    ],
  } }
  const d = await rest('POST', `/blogs/${blogId}/articles.json`, payload)
  return { blogId, blogHandle: process.env.SHOPIFY_NEWS_BLOG_HANDLE || 'pc-tech-news', article: d.article }
}

module.exports = { rest, ensureBlog, publishArticle }
