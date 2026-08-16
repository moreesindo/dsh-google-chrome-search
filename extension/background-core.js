export function buildGoogleSearchUrl(query) {
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('q', query.trim())
  return url.toString()
}

export function normalizeExtensionSettings(value) {
  if (!value || typeof value !== 'object') throw new Error('Extension settings are missing')
  const port = Number(value.port)
  const token = typeof value.token === 'string' ? value.token.trim() : ''
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid bridge port')
  if (token.length < 16) throw new Error('Bridge token must be at least 16 characters')
  return { port, token, bridgeUrl: `ws://127.0.0.1:${port}` }
}
