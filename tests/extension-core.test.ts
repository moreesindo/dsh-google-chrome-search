import { describe, expect, it } from 'vitest'

import { buildGoogleSearchUrl, normalizeExtensionSettings } from '../extension/background-core.js'

describe('extension search helpers', () => {
  it('builds an encoded Google search URL without leaking extra parameters', () => {
    expect(buildGoogleSearchUrl('qwen 3.8 & local')).toBe(
      'https://www.google.com/search?q=qwen+3.8+%26+local',
    )
  })

  it('accepts a loopback bridge with a non-empty token', () => {
    expect(normalizeExtensionSettings({ port: 32145, token: '1234567890abcdef' })).toEqual({
      port: 32145,
      token: '1234567890abcdef',
      bridgeUrl: 'ws://127.0.0.1:32145',
    })
  })

  it('rejects invalid ports and short tokens', () => {
    expect(() => normalizeExtensionSettings({ port: 0, token: '1234567890abcdef' })).toThrow()
    expect(() => normalizeExtensionSettings({ port: 32145, token: 'short' })).toThrow()
  })
})
