import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'

import type { ChromeSearchBridge } from './bridge.js'

export class GoogleChromeSearchProvider implements WebSearchProvider {
  readonly id = 'google-chrome'

  constructor(private readonly bridge: ChromeSearchBridge) {}

  available(): boolean {
    return this.bridge.available()
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    return await this.bridge.search(request.query, request.maxResults ?? 10, signal)
  }
}
