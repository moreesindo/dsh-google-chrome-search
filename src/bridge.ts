import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'

import WebSocket, { WebSocketServer } from 'ws'

import { ChromeSearchError } from './errors.js'
import {
  createSearchMessage,
  normalizeSources,
  parseClientMessage,
  type ClientMessage,
  type SearchSource,
} from './protocol.js'

export type ChromeSearchBridgeOptions = {
  token: string
  port: number
  timeoutMs: number
  host?: string
}

export type BridgeSearchResult = {
  content?: string
  sources: SearchSource[]
  truncated: boolean
}

type PendingRequest = {
  maxResults: number
  resolve: (result: BridgeSearchResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  removeAbortListener: () => void
}

export class ChromeSearchBridge {
  private readonly host: string
  private readonly port: number
  private readonly token: string
  private readonly timeoutMs: number
  private server?: WebSocketServer
  private extension?: WebSocket
  private actualPort?: number
  private readonly pending = new Map<string, PendingRequest>()
  private readonly availabilityWaiters = new Set<() => void>()

  constructor(options: ChromeSearchBridgeOptions) {
    if (!options.token) throw new Error('Bridge token is required')
    this.host = options.host ?? '127.0.0.1'
    if (this.host !== '127.0.0.1' && this.host !== 'localhost' && this.host !== '::1') {
      throw new Error('Chrome search bridge must bind to a loopback address')
    }
    this.port = options.port
    this.token = options.token
    this.timeoutMs = options.timeoutMs
  }

  get url(): string {
    if (this.actualPort === undefined) throw new Error('Bridge is not started')
    const host = this.host === '::1' ? '[::1]' : this.host
    return `ws://${host}:${this.actualPort}`
  }

  async start(): Promise<void> {
    if (this.server) return
    const server = new WebSocketServer({ host: this.host, port: this.port })
    this.server = server
    server.on('connection', (socket) => this.handleConnection(socket))
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    this.actualPort = (server.address() as AddressInfo).port
  }

  async stop(): Promise<void> {
    this.rejectAll(new ChromeSearchError('CHROME_SEARCH_STOPPED', 'Chrome search bridge stopped'))
    this.extension?.terminate()
    this.extension = undefined
    const server = this.server
    this.server = undefined
    this.actualPort = undefined
    if (!server) return
    for (const client of server.clients) client.terminate()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  available(): boolean {
    return this.extension?.readyState === WebSocket.OPEN
  }

  async waitUntilAvailable(): Promise<void> {
    if (this.available()) return
    await new Promise<void>((resolve) => this.availabilityWaiters.add(resolve))
  }

  async search(query: string, maxResults = 10, signal?: AbortSignal): Promise<BridgeSearchResult> {
    const extension = this.extension
    if (!extension || extension.readyState !== WebSocket.OPEN) {
      throw new ChromeSearchError(
        'CHROME_EXTENSION_DISCONNECTED',
        'Chrome search extension is not connected',
      )
    }
    if (signal?.aborted) throw new ChromeSearchError('CHROME_SEARCH_ABORTED', 'Search was aborted')

    const id = randomUUID()
    const message = createSearchMessage(id, query, Math.min(maxResults, 20))
    return await new Promise<BridgeSearchResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id)
        this.pending.delete(id)
        pending?.removeAbortListener()
        reject(new ChromeSearchError('CHROME_SEARCH_TIMEOUT', 'Chrome search timed out'))
      }, this.timeoutMs)
      const onAbort = () => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        clearTimeout(pending.timer)
        reject(new ChromeSearchError('CHROME_SEARCH_ABORTED', 'Search was aborted'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        maxResults: message.maxResults,
        resolve,
        reject,
        timer,
        removeAbortListener: () => signal?.removeEventListener('abort', onAbort),
      })
      extension.send(JSON.stringify(message), (error) => {
        if (!error) return
        this.settleWithError(id, new ChromeSearchError('CHROME_SEARCH_SEND_FAILED', error.message))
      })
    })
  }

  private handleConnection(socket: WebSocket): void {
    let authenticated = false
    const authenticationTimer = setTimeout(() => socket.close(4001, 'Authentication required'), 5000)

    socket.on('message', (data) => {
      let message: ClientMessage
      try {
        message = parseClientMessage(data.toString())
      } catch {
        socket.close(4002, 'Invalid message')
        return
      }

      if (!authenticated) {
        if (message.type !== 'hello' || !this.tokensMatch(message.token)) {
          socket.close(4003, 'Authentication failed')
          return
        }
        authenticated = true
        clearTimeout(authenticationTimer)
        this.extension?.close(4000, 'Replaced by a new extension connection')
        this.extension = socket
        for (const resolve of this.availabilityWaiters) resolve()
        this.availabilityWaiters.clear()
        return
      }

      if (socket !== this.extension || message.type === 'hello') return
      this.handleResponse(message)
    })

    socket.on('close', () => {
      clearTimeout(authenticationTimer)
      if (socket !== this.extension) return
      this.extension = undefined
      this.rejectAll(
        new ChromeSearchError('CHROME_EXTENSION_DISCONNECTED', 'Chrome search extension disconnected'),
      )
    })
  }

  private handleResponse(message: Exclude<ClientMessage, { type: 'hello' }>): void {
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    pending.removeAbortListener()

    if (message.type === 'error') {
      pending.reject(new ChromeSearchError(message.code, message.message))
      return
    }

    const sources = normalizeSources(message.sources, pending.maxResults)
    pending.resolve({
      ...(message.content ? { content: message.content } : {}),
      sources,
      truncated: Boolean(message.truncated || message.sources.length > pending.maxResults),
    })
  }

  private settleWithError(id: string, error: Error): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    clearTimeout(pending.timer)
    pending.removeAbortListener()
    pending.reject(error)
  }

  private rejectAll(error: Error): void {
    for (const id of this.pending.keys()) this.settleWithError(id, error)
  }

  private tokensMatch(candidate: string): boolean {
    const expected = Buffer.from(this.token)
    const actual = Buffer.from(candidate)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }
}
