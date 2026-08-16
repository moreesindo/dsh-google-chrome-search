export type SearchSource = {
  url: string
  title?: string
  snippet?: string
}

export type ClientMessage =
  | { type: 'hello'; token: string }
  | { type: 'result'; id: string; sources: SearchSource[]; content?: string; truncated?: boolean }
  | { type: 'error'; id: string; code: string; message: string }

export type SearchMessage = {
  type: 'search'
  id: string
  query: string
  maxResults: number
}

const MAX_QUERY_LENGTH = 2048
const MAX_TITLE_LENGTH = 300
const MAX_SNIPPET_LENGTH = 500

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSource(value: unknown): value is SearchSource {
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.snippet === undefined || typeof value.snippet === 'string')
  )
}

export function parseClientMessage(raw: string): ClientMessage {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON message')
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Invalid client message')
  }

  if (value.type === 'hello' && typeof value.token === 'string' && value.token.length > 0) {
    return { type: 'hello', token: value.token }
  }

  if (
    value.type === 'result' &&
    typeof value.id === 'string' &&
    Array.isArray(value.sources) &&
    value.sources.every(isSource) &&
    (value.content === undefined || typeof value.content === 'string') &&
    (value.truncated === undefined || typeof value.truncated === 'boolean')
  ) {
    return {
      type: 'result',
      id: value.id,
      sources: value.sources,
      ...(value.content === undefined ? {} : { content: value.content }),
      ...(value.truncated === undefined ? {} : { truncated: value.truncated }),
    }
  }

  if (
    value.type === 'error' &&
    typeof value.id === 'string' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  ) {
    return { type: 'error', id: value.id, code: value.code, message: value.message }
  }

  throw new Error('Invalid client message')
}

export function createSearchMessage(
  id: string,
  query: string,
  maxResults: number,
): SearchMessage {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) throw new Error('Search query is empty')
  if (normalizedQuery.length > MAX_QUERY_LENGTH) throw new Error('Search query is too long')
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20) {
    throw new Error('maxResults must be an integer between 1 and 20')
  }
  return { type: 'search', id, query: normalizedQuery, maxResults }
}

export function normalizeSources(
  sources: readonly SearchSource[],
  maxResults: number,
): SearchSource[] {
  const normalized: SearchSource[] = []
  const seen = new Set<string>()

  for (const source of sources) {
    let url: URL
    try {
      url = new URL(source.url)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    url.hash = ''
    const canonicalUrl = url.toString()
    if (seen.has(canonicalUrl)) continue
    seen.add(canonicalUrl)

    const title = source.title?.trim().slice(0, MAX_TITLE_LENGTH)
    const snippet = source.snippet?.trim().slice(0, MAX_SNIPPET_LENGTH)
    normalized.push({
      url: canonicalUrl,
      ...(title ? { title } : {}),
      ...(snippet ? { snippet } : {}),
    })
    if (normalized.length >= maxResults) break
  }

  return normalized
}
