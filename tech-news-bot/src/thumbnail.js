/**
 * Generates a branded SVG thumbnail entirely in code — no third-party photos,
 * no new dependencies, no legal risk. Used as the featured image for every
 * tech-news-bot article instead of reusing a source outlet's own image.
 */

const ICON = {
  'Graphics Card': '🎮',
  'Processor': '🧠',
  'Motherboard': '🧩',
  'Memory': '📏',
  'Solid State Drive': '💾',
  'Cooling': '💧',
  'Case': '🖥️',
  'Power Supply': '🔌',
  'Other': '🛠️',
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
}

// Naive word-wrap by estimated character width — good enough for a bold
// sans-serif headline at a fixed font size; no font-metrics library needed.
function wrapText(text, maxCharsPerLine, maxLines) {
  const words = text.split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxCharsPerLine && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
    if (lines.length === maxLines - 1) break
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) lines.length = maxLines
  // Ellipsize if we truncated words that never made it in
  const consumed = lines.join(' ').length
  if (consumed < text.length && lines.length === maxLines) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'
  }
  return lines
}

function generateThumbnailSvg({ productName, category }) {
  const W = 1200, H = 630
  const icon = ICON[category] || ICON['Other']
  const lines = wrapText(productName, 24, 3)
  const lineHeight = 76
  const titleStartY = H / 2 - ((lines.length - 1) * lineHeight) / 2 + 20

  const tspans = lines.map((line, i) =>
    `<tspan x="80" y="${titleStartY + i * lineHeight}">${escapeXml(line)}</tspan>`
  ).join('')

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a5f"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 120}" cy="${H - 100}" r="260" fill="#8b5cf6" opacity="0.12"/>
  <circle cx="${W - 300}" cy="80" r="140" fill="#22d3ee" opacity="0.08"/>
  <text x="${W - 100}" y="${H / 2 + 60}" font-size="360" text-anchor="end" opacity="0.10">${icon}</text>

  <rect x="80" y="72" rx="20" ry="20" width="${180 + category.length * 11}" height="44" fill="#8b5cf6"/>
  <text x="${80 + 22}" y="101" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#ffffff" letter-spacing="1">${icon} ${escapeXml(category.toUpperCase())} NEWS</text>

  <text font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="#ffffff">${tspans}</text>

  <text x="80" y="${H - 56}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="#ffffff">GamerTech</text>
  <text x="80" y="${H - 26}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#94a3b8">PC Tech News &#183; gamertech.ca</text>
</svg>`
}

module.exports = { generateThumbnailSvg }
