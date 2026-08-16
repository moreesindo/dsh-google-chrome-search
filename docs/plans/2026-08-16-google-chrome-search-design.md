# Google Chrome Search Provider Design

## Goal

Provide DeepSeek Harness with a `ctx.web` search provider that uses the user's existing Chrome browser and Google Search, so a local Qwen model can receive normalized web search results without invoking a paid search-model API.

## Architecture

The package contains three cooperating components:

1. A DSH plugin registers provider id `google-chrome` with `ctx.web`.
2. A loopback-only bridge listens on `127.0.0.1` and exchanges authenticated JSON messages with a Chrome extension over WebSocket.
3. A Manifest V3 extension maintains the bridge connection, reuses one dedicated Google Search tab, extracts organic result titles, URLs, and snippets, and returns them to the provider.

The bridge accepts only a small protocol: `hello`, `search`, `result`, and `error`. Each request has an id, a bounded query, a bounded result count, and a timeout. A random shared token configured in both components authenticates the extension. The server rejects non-loopback connections, malformed messages, duplicate extension sessions, and oversized payloads.

## Safety and privacy

The extension requests access only to Google Search pages and loopback communication. It never reads cookies, passwords, history, downloads, or unrelated tabs. Search queries are sent to Google because that is the requested search backend. Returned URLs must be HTTP(S), Google redirect wrappers are unwrapped, duplicate URLs are removed, and result text is length-limited.

CAPTCHA and unusual-traffic pages are detected and returned as `GOOGLE_CAPTCHA_REQUIRED`; the search tab remains visible for manual resolution. The implementation does not bypass CAPTCHA or browser security controls.

## Failure behavior

If Chrome is closed, the extension is disconnected, Google navigation times out, or the page layout yields no results, DSH receives a typed provider failure quickly. Cancellation from DSH cancels the pending bridge request. The provider reports availability only when the bridge has an authenticated extension connection.

## Testing

Unit tests cover message validation, result normalization, redirect unwrapping, CAPTCHA detection, timeout/cancellation, and provider registration. Integration tests use a fake WebSocket extension client and static Google-result fixtures. A final manual test loads the unpacked extension, performs a real Google query, and confirms DSH receives normalized sources.
