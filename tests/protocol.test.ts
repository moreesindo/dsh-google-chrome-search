import { describe, expect, it } from 'vitest'

import {
  createSearchMessage,
  normalizeSources,
  parseClientMessage,
} from '../src/protocol.js'

describe('bridge protocol', () => {
  it('parses a valid authenticated hello message', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'hello', token: 'secret' }))).toEqual({
      type: 'hello',
      token: 'secret',
    })
  })

  it.each([
    'not json',
    JSON.stringify({ type: 'hello' }),
    JSON.stringify({ type: 'unknown' }),
    JSON.stringify({ type: 'result', id: '1', sources: 'wrong' }),
  ])('rejects malformed extension messages: %s', (raw) => {
    expect(() => parseClientMessage(raw)).toThrow()
  })

  it('creates a bounded search request', () => {
    expect(createSearchMessage('request-1', 'qwen 3.8', 5)).toEqual({
      type: 'search',
      id: 'request-1',
      query: 'qwen 3.8',
      maxResults: 5,
    })
    expect(() => createSearchMessage('request-2', 'x'.repeat(2049), 5)).toThrow(
      /query is too long/i,
    )
  })
})

describe('search source normalization', () => {
  it('keeps safe Google results, removes duplicates, and trims fields', () => {
    const sources = normalizeSources(
      [
        { url: 'https://example.com/a', title: '  Result A  ', snippet: ' first result ' },
        { url: 'https://example.com/a#fragment', title: 'Duplicate' },
        { url: 'javascript:alert(1)', title: 'Unsafe' },
        { url: 'http://example.org/b', title: 'B', snippet: 'x'.repeat(600) },
      ],
      10,
    )

    expect(sources).toHaveLength(2)
    expect(sources[0]).toEqual({
      url: 'https://example.com/a',
      title: 'Result A',
      snippet: 'first result',
    })
    expect(sources[1]?.snippet).toHaveLength(500)
  })
})
