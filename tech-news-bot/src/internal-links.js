const STORE_URL = 'https://gamertech.ca'

/**
 * Whitelisted internal links the drafting model is allowed to choose from,
 * per hardware category. The model NEVER invents a URL — it can only pick
 * one of these (or "none") — see draft.js. Keep this list in sync with
 * real, live pages/collections on the store.
 */
const LINKS_BY_CATEGORY = {
  'Graphics Card': [
    { url: `${STORE_URL}/collections/pc-parts?filter.p.product_type=Graphics+Card`, label: 'Shop used graphics cards at GamerTech' },
    { url: `${STORE_URL}/pages/best-gaming-pc-canada`, label: 'Best Gaming PC in Canada (2026)' },
  ],
  'Processor': [
    { url: `${STORE_URL}/collections/pc-parts?filter.p.product_type=Processor`, label: 'Shop used CPUs at GamerTech' },
    { url: `${STORE_URL}/pages/best-workstation-pc-canada`, label: 'Best Workstation PC in Canada' },
  ],
  'Motherboard': [
    { url: `${STORE_URL}/collections/build-your-own`, label: 'Build Your Own PC at GamerTech' },
  ],
  'Memory': [
    { url: `${STORE_URL}/collections/pc-parts?filter.p.product_type=Memory`, label: 'Shop used RAM at GamerTech' },
  ],
  'Solid State Drive': [
    { url: `${STORE_URL}/collections/pc-parts?filter.p.product_type=Solid+State+Drive`, label: 'Shop used SSDs at GamerTech' },
  ],
  'Cooling': [
    { url: `${STORE_URL}/collections/pc-parts?filter.p.product_type=Liquid+Cooling`, label: 'Shop liquid cooling parts at GamerTech' },
  ],
  'Case': [
    { url: `${STORE_URL}/collections/build-your-own`, label: 'Build Your Own PC at GamerTech' },
  ],
  'Power Supply': [
    { url: `${STORE_URL}/collections/pc-parts?filter.p.product_type=Power+Supply`, label: 'Shop used power supplies at GamerTech' },
  ],
  'Other': [
    { url: `${STORE_URL}/collections/pc-parts`, label: 'Shop all PC Parts at GamerTech' },
  ],
}

function allowedLinksForCategory(category) {
  return LINKS_BY_CATEGORY[category] || LINKS_BY_CATEGORY['Other']
}

function allUrls() {
  const urls = new Set(['none'])
  for (const list of Object.values(LINKS_BY_CATEGORY)) for (const l of list) urls.add(l.url)
  return [...urls]
}

module.exports = { STORE_URL, LINKS_BY_CATEGORY, allowedLinksForCategory, allUrls }
