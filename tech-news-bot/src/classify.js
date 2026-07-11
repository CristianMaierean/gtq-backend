const Anthropic = require('@anthropic-ai/sdk')
const { z } = require('zod')
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod')

const client = new Anthropic() // reads ANTHROPIC_API_KEY from env

const ClassificationSchema = z.object({
  is_new_hardware_announcement: z.boolean()
    .describe('True only if this headline announces a genuinely NEW PC hardware product (GPU, CPU, motherboard, cooler, RAM, SSD, case, PSU, etc.) — not a review, driver update, price drop, restock, benchmark, rumor-only leak, or opinion piece.'),
  product_name: z.string().describe('The specific product name/model, e.g. "NVIDIA GeForce RTX 5070 Ti Super". Empty string if not a hardware announcement.'),
  category: z.enum(['Graphics Card', 'Processor', 'Motherboard', 'Memory', 'Solid State Drive', 'Cooling', 'Case', 'Power Supply', 'Other']),
  confidence: z.number().min(0).max(1).describe('Your confidence that this is a genuine, official new-product announcement (not a rumor/leak).'),
})

const CLASSIFIER_MODEL = 'claude-haiku-4-5'

async function classifyHeadline({ title, snippet, sourceName }) {
  const response = await client.messages.parse({
    model: CLASSIFIER_MODEL,
    max_tokens: 400,
    system: 'You classify PC hardware news headlines. Be conservative: only mark is_new_hardware_announcement=true for an actual new product announcement, not commentary, reviews, or price/availability news about existing products.',
    messages: [{
      role: 'user',
      content: `Source: ${sourceName}\nHeadline: ${title}\nSnippet: ${snippet}`,
    }],
    output_config: { format: zodOutputFormat(ClassificationSchema) },
  })
  return response.parsed_output
}

module.exports = { classifyHeadline, CLASSIFIER_MODEL }
