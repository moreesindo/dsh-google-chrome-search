import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'

import { ChromeSearchBridge } from '../src/bridge.js'
import { GoogleChromeSearchProvider } from '../src/provider.js'

const bridges: ChromeSearchBridge[] = []

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()))
})

async function createBridge(timeoutMs = 500): Promise<ChromeSearchBridge> {
  const bridge = new ChromeSearchBridge({ token: 'test-token', port: 0, timeoutMs })
  bridges.push(bridge)
  await bridge.start()
  return bridge
}

async function connectExtension(bridge: ChromeSearchBridge): Promise<WebSocket> {
  const socket = new WebSocket(bridge.url)
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  socket.send(JSON.stringify({ type: 'hello', token: 'test-token' }))
  await bridge.waitUntilAvailable()
  return socket
}

describe('ChromeSearchBridge', () => {
  it('is unavailable until an authenticated extension connects', async () => {
    const bridge = await createBridge()
    const provider = new GoogleChromeSearchProvider(bridge)

    expect(provider.available()).toBe(false)
    await expect(provider.search({ query: 'qwen' })).rejects.toThrow(/extension is not connected/i)
  })

  it('rejects an extension with the wrong token', async () => {
    const bridge = await createBridge()
    const socket = new WebSocket(bridge.url)
    await new Promise<void>((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ type: 'hello', token: 'wrong-token' }))
    await new Promise<void>((resolve) => socket.once('close', () => resolve()))

    expect(bridge.available()).toBe(false)
  })

  it('returns normalized search results from the extension', async () => {
    const bridge = await createBridge()
    const socket = await connectExtension(bridge)
    socket.on('message', (data) => {
      const request = JSON.parse(data.toString()) as { type: string; id: string }
      if (request.type !== 'search') return
      socket.send(
        JSON.stringify({
          type: 'result',
          id: request.id,
          sources: [
            { url: 'https://example.com/a', title: ' A ', snippet: ' result ' },
            { url: 'javascript:alert(1)', title: 'unsafe' },
          ],
          truncated: false,
        }),
      )
    })

    const provider = new GoogleChromeSearchProvider(bridge)
    await expect(provider.search({ query: 'qwen', maxResults: 5 })).resolves.toEqual({
      sources: [{ url: 'https://example.com/a', title: 'A', snippet: 'result' }],
      truncated: false,
    })
  })

  it('surfaces CAPTCHA errors without attempting to bypass them', async () => {
    const bridge = await createBridge()
    const socket = await connectExtension(bridge)
    socket.on('message', (data) => {
      const request = JSON.parse(data.toString()) as { type: string; id: string }
      if (request.type === 'search') {
        socket.send(
          JSON.stringify({
            type: 'error',
            id: request.id,
            code: 'GOOGLE_CAPTCHA',
            message: 'Google requires human verification',
          }),
        )
      }
    })

    const provider = new GoogleChromeSearchProvider(bridge)
    await expect(provider.search({ query: 'qwen' })).rejects.toMatchObject({
      code: 'GOOGLE_CAPTCHA',
    })
  })

  it('times out when the extension does not answer', async () => {
    const bridge = await createBridge(30)
    await connectExtension(bridge)

    const provider = new GoogleChromeSearchProvider(bridge)
    await expect(provider.search({ query: 'qwen' })).rejects.toMatchObject({
      code: 'CHROME_SEARCH_TIMEOUT',
    })
  })
})
