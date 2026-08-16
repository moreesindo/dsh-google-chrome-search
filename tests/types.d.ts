declare module '../extension/parser.js' {
  export type ParsedSource = { url: string; title?: string; snippet?: string }
  export function parseGoogleResults(document: Document, maxResults: number): ParsedSource[]
  export function detectGoogleBlock(
    document: Document,
  ): { code: string; message: string } | null
}

declare module '../extension/background-core.js' {
  export type ExtensionSettings = { port: number; token: string; bridgeUrl: string }
  export function buildGoogleSearchUrl(query: string): string
  export function normalizeExtensionSettings(value: unknown): ExtensionSettings
}
