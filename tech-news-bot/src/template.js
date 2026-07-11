const CSS = `<style>
*{box-sizing:border-box}
.tn-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1e293b;max-width:900px}
.tn-tag{display:inline-block;background:rgba(8,145,178,.12);color:#0891b2;border:1px solid rgba(8,145,178,.25);border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 14px}
.tn-ans{background:#f0fdf4;border-left:4px solid #10b981;border-radius:0 12px 12px 0;padding:18px 22px;margin:0 0 26px}
.tn-ans p{margin:0;color:#065f46;font-size:15px;line-height:1.65}
.tn-h{font-size:19px;font-weight:800;color:#0f172a;margin:28px 0 12px}
.tn-body p{font-size:15.5px;line-height:1.7;color:#334155;margin:0 0 14px}
.tn-specs{width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px}
.tn-specs th{background:#0f172a;color:#fff;padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.tn-specs td{padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#1e293b}
.tn-specs tr:nth-child(even) td{background:#f8fafc}
.tn-specs td:first-child{font-weight:600;color:#475569;width:40%}
.tn-cta{background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:14px;padding:24px 28px;margin:26px 0;text-align:center;color:#fff}
.tn-cta a{display:inline-block;padding:11px 26px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;background:#10b981;color:#fff;margin-top:10px}
.faq-item{border-bottom:1px solid #e2e8f0;padding:16px 0}
.faq-item:last-child{border-bottom:none}
.faq-q{font-weight:700;color:#0f172a;margin:0 0 8px;font-size:15px}
.faq-a{color:#475569;font-size:14px;line-height:1.65;margin:0}
.tn-sources{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:24px 0;font-size:13px;color:#64748b}
.tn-sources a{color:#0891b2}
</style>`

function renderArticleHtml(draft, sightings, category) {
  const specRows = draft.keySpecs.map(s => `    <tr><td>${s.label}</td><td>${s.value}</td></tr>`).join('\n')
  const faqHtml = draft.faq.map(f => `<div class="faq-item">
<p class="faq-q">${f.question}</p>
<p class="faq-a">${f.answer}</p>
</div>`).join('\n')
  const sourceLinks = sightings.map(s => `<a href="${s.source_url}" target="_blank" rel="noopener">${s.source_name}</a>`).join(' · ')

  const cta = draft.internalLinkUrl && draft.internalLinkUrl !== 'none'
    ? `<div class="tn-cta"><div>Looking to build or upgrade?</div><a href="${draft.internalLinkUrl}">${draft.internalLinkLabel}</a></div>`
    : ''

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        headline: draft.headline,
        description: draft.seoDescription,
        author: { '@type': 'Organization', name: 'GamerTech' },
        publisher: { '@type': 'Organization', name: 'GamerTech' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: draft.faq.map(f => ({
          '@type': 'Question', name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
    ],
  }

  return `${CSS}
<div class="tn-wrap">
<span class="tn-tag">${category} · PC Hardware News</span>

<div class="tn-ans"><p>${draft.tldr}</p></div>

<div class="tn-body">
${draft.narrativeHtml}
</div>

${specRows ? `<h2 class="tn-h">What We Know</h2>
<table class="tn-specs"><tr><th>Spec</th><th>Detail</th></tr>
${specRows}
</table>` : ''}

${cta}

${draft.faq.length ? `<h2 class="tn-h">Frequently Asked Questions</h2>\n${faqHtml}` : ''}

<div class="tn-sources"><strong>Sources:</strong> ${sourceLinks}</div>
</div>

<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`
}

module.exports = { renderArticleHtml }
