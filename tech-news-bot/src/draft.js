const Anthropic = require('@anthropic-ai/sdk')
const { z } = require('zod')
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod')
const { allowedLinksForCategory, allUrls } = require('./internal-links')

const client = new Anthropic()
const WRITER_MODEL = 'claude-sonnet-5'

const DraftSchema = z.object({
  headline: z.string().describe('SEO-friendly blog headline, e.g. "NVIDIA\'s New RTX 5070 Ti Super: What We Know So Far"'),
  slug: z.string().regex(/^[a-z0-9-]+$/).describe('kebab-case URL slug, no special characters'),
  seoTitle: z.string().describe('<=70 characters, for the meta title_tag'),
  seoDescription: z.string().describe('<=160 characters, for the meta description_tag'),
  tldr: z.string().describe('1-3 sentence direct-answer summary of what was announced and why it matters'),
  keySpecs: z.array(z.object({ label: z.string(), value: z.string() })).max(8)
    .describe('Only specs/facts explicitly present in the provided source excerpts. Omit anything not stated.'),
  narrativeHtml: z.string()
    .describe('2-4 short paragraphs as <p>...</p> HTML covering what was announced, why it matters, and how it compares to the previous generation/competitors — grounded ONLY in the provided source excerpts. No invented numbers, prices, or release dates.'),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).max(4)
    .describe('Grounded Q&A pairs a reader would search for about this announcement'),
  internalLinkUrl: z.enum(allUrls()).describe('Pick the single most relevant URL from the provided whitelist for this category, or "none" if nothing fits.'),
  internalLinkLabel: z.string().describe('Short label for the internal link CTA, matching the chosen URL\'s intent'),
})

function buildSourceBlock(excerpts) {
  return excerpts.map((e, i) =>
    `[SOURCE ${i + 1}: ${e.sourceName} — ${e.sourceUrl}]\n${e.text}`
  ).join('\n\n---\n\n')
}

async function draftArticle({ productName, category, excerpts }) {
  const allowedLinks = allowedLinksForCategory(category)
  const linksBlock = allowedLinks.map(l => `- ${l.url} (${l.label})`).join('\n')

  const system = `You are a hardware news writer for GamerTech, a Canadian PC retailer and builder based in Vaughan, Ontario. Write a short, factual news post about a newly announced PC hardware product.

STRICT GROUNDING RULES:
- Use ONLY facts, specs, and quotes present in the SOURCE excerpts provided below. Do not invent specs, prices, release dates, or benchmark numbers.
- If a detail (price, release date, exact specs) is not stated in the sources, omit it — do not guess or estimate.
- Attribute claims naturally in prose (e.g. "according to Tom's Hardware...") when helpful, but do not fabricate quotes.
- Write for PC builders and gamers: clear, informative, no hype-filled marketing language.
- For internalLinkUrl, choose ONLY from this exact whitelist for the "${category}" category (or "none"):
${linksBlock}`

  const response = await client.messages.parse({
    model: WRITER_MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system,
    messages: [{
      role: 'user',
      content: `Product: ${productName}\nCategory: ${category}\n\nSOURCE EXCERPTS:\n\n${buildSourceBlock(excerpts)}`,
    }],
    output_config: { effort: 'high', format: zodOutputFormat(DraftSchema) },
  })

  const draft = response.parsed_output
  // Defense in depth: never trust a model-returned URL outright — verify it's
  // actually in this category's whitelist before it reaches the template.
  if (draft.internalLinkUrl !== 'none' && !allowedLinks.some(l => l.url === draft.internalLinkUrl)) {
    draft.internalLinkUrl = 'none'
  }
  return draft
}

module.exports = { draftArticle, WRITER_MODEL, DraftSchema }
