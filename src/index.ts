import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import { ChromeSearchBridge } from './bridge.js'
import { GoogleChromeSearchProvider } from './provider.js'

export const name = 'web-search-google-chrome'
export const inject = ['web']

export interface Config {
  token: string
  port?: number
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  token: z.string().min(16).required(),
  port: z.number().step(1).min(1).max(65535).default(32145),
  timeoutMs: z.number().step(1).min(1000).max(120000).default(30000),
})

export function apply(ctx: Context, config: Config): void {
  const bridge = new ChromeSearchBridge({
    token: config.token,
    port: config.port ?? 32145,
    timeoutMs: config.timeoutMs ?? 30000,
  })

  ctx.effect(async () => {
    await bridge.start()
    const unregister = ctx.web.registerSearchProvider(new GoogleChromeSearchProvider(bridge))
    return async () => {
      unregister()
      await bridge.stop()
    }
  }, 'web-search-google-chrome bridge')
}

export { ChromeSearchBridge } from './bridge.js'
export { ChromeSearchError } from './errors.js'
export { GoogleChromeSearchProvider } from './provider.js'
