import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { detectGoogleBlock, parseGoogleResults } from '../extension/parser.js'

function documentFor(html: string, url = 'https://www.google.com/search?q=qwen'): Document {
  return new JSDOM(html, { url }).window.document
}

describe('parseGoogleResults', () => {
  it('extracts organic titles, final URLs, and snippets in page order', () => {
    const document = documentFor(`
      <main id="search">
        <div class="MjjYud">
          <a href="/url?q=https%3A%2F%2Fexample.com%2Fqwen%3Fa%3D1&sa=U">
            <h3>Qwen model guide</h3>
          </a>
          <div class="VwiC3b">A practical Qwen guide.</div>
        </div>
        <div class="g">
          <a href="https://example.org/docs"><h3>Official docs</h3></a>
          <div data-sncf>Reference documentation.</div>
        </div>
      </main>
    `)

    expect(parseGoogleResults(document, 5)).toEqual([
      {
        url: 'https://example.com/qwen?a=1',
        title: 'Qwen model guide',
        snippet: 'A practical Qwen guide.',
      },
      {
        url: 'https://example.org/docs',
        title: 'Official docs',
        snippet: 'Reference documentation.',
      },
    ])
  })

  it('ignores ads, unsafe links, duplicate URLs, and content outside search results', () => {
    const document = documentFor(`
      <a href="https://outside.example"><h3>Outside</h3></a>
      <main id="search">
        <div data-text-ad><a href="https://ads.example"><h3>Advertisement</h3></a></div>
        <div class="g"><a href="javascript:alert(1)"><h3>Unsafe</h3></a></div>
        <div class="g"><a href="https://example.com/a"><h3>First</h3></a></div>
        <div class="g"><a href="https://example.com/a#section"><h3>Duplicate</h3></a></div>
      </main>
    `)

    expect(parseGoogleResults(document, 10)).toEqual([
      { url: 'https://example.com/a', title: 'First' },
    ])
  })

  it('honors the requested result limit', () => {
    const document = documentFor(`
      <main id="search">
        <div class="g"><a href="https://a.example"><h3>A</h3></a></div>
        <div class="g"><a href="https://b.example"><h3>B</h3></a></div>
      </main>
    `)

    expect(parseGoogleResults(document, 1)).toHaveLength(1)
  })
})

describe('detectGoogleBlock', () => {
  it('detects Google CAPTCHA pages', () => {
    const document = documentFor(`
      <html><head><title>Sorry...</title></head><body>
        <form action="/sorry/index"><div class="g-recaptcha"></div></form>
      </body></html>
    `, 'https://www.google.com/sorry/index')

    expect(detectGoogleBlock(document)).toEqual({
      code: 'GOOGLE_CAPTCHA',
      message: 'Google requires human verification',
    })
  })

  it('returns null for a normal result page', () => {
    const document = documentFor('<main id="search"></main>')
    expect(detectGoogleBlock(document)).toBeNull()
  })
})
