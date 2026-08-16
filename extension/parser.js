const SNIPPET_SELECTORS = ['.VwiC3b', '[data-sncf]', '.IsZvec', '.aCOpRe']

function cleanText(value) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function finalResultUrl(href, baseUrl) {
  let url
  try {
    url = new URL(href, baseUrl)
  } catch {
    return null
  }

  if (url.hostname.endsWith('google.com') && url.pathname === '/url') {
    const target = url.searchParams.get('q') ?? url.searchParams.get('url')
    if (!target) return null
    try {
      url = new URL(target)
    } catch {
      return null
    }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  url.hash = ''
  return url.toString()
}

export function parseGoogleResults(document, maxResults) {
  const root = document.querySelector('#search')
  if (!root || maxResults < 1) return []

  const results = []
  const seen = new Set()
  for (const heading of root.querySelectorAll('a h3')) {
    const anchor = heading.closest('a')
    if (!anchor || anchor.closest('[data-text-ad]')) continue
    const url = finalResultUrl(anchor.getAttribute('href') ?? anchor.href, document.URL)
    if (!url || seen.has(url)) continue

    const card = heading.closest('.MjjYud, .g') ?? anchor.parentElement
    let snippet = ''
    for (const selector of SNIPPET_SELECTORS) {
      snippet = cleanText(card?.querySelector(selector)?.textContent)
      if (snippet) break
    }

    const title = cleanText(heading.textContent)
    if (!title) continue
    seen.add(url)
    results.push({
      url,
      title,
      ...(snippet ? { snippet } : {}),
    })
    if (results.length >= maxResults) break
  }
  return results
}

export function detectGoogleBlock(document) {
  const url = new URL(document.URL)
  const title = cleanText(document.title).toLowerCase()
  const hasCaptcha = Boolean(
    document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], form[action*="/sorry/"]'),
  )
  if (url.pathname.startsWith('/sorry/') || title === 'sorry...' || hasCaptcha) {
    return {
      code: 'GOOGLE_CAPTCHA',
      message: 'Google requires human verification',
    }
  }
  return null
}
