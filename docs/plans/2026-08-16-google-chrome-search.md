# Google Chrome Search Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and install a DSH `ctx.web` provider that searches Google through the user's existing Chrome session and returns normalized sources to the local Qwen model.

**Architecture:** A DSH plugin hosts an authenticated loopback WebSocket bridge. A Manifest V3 Chrome extension connects to it, controls one dedicated Google Search tab, parses organic results, and returns bounded structured data.

**Tech Stack:** TypeScript, Node.js 22, Vitest, `ws`, DeepSeek Harness `@deepseek-ai/dsh-web` and Cordis APIs, Chrome Manifest V3.

### Task 1: Package scaffold and protocol tests

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/protocol.ts`
- Test: `tests/protocol.test.ts`

1. Write failing tests for valid hello/result messages, malformed input rejection, bounded query length, and safe result URL validation.
2. Run `npm test -- tests/protocol.test.ts` and verify failures are caused by missing protocol implementation.
3. Implement the minimum protocol parser and message types.
4. Re-run the focused test and verify it passes.
5. Commit the red/green cycle.

### Task 2: Loopback bridge and provider

**Files:**
- Create: `src/bridge.ts`
- Create: `src/provider.ts`
- Create: `src/index.ts`
- Test: `tests/bridge.test.ts`
- Test: `tests/provider.test.ts`

1. Write failing tests using a real loopback WebSocket fake extension client.
2. Verify authentication, availability, one search round trip, timeout, cancellation, and extension disconnect failures.
3. Implement the bridge and `WebSearchProvider` with id `google-chrome`.
4. Register it through `ctx.web.registerSearchProvider` and define Schemastery config.
5. Run focused and full tests; commit.

### Task 3: Google result parser

**Files:**
- Create: `extension/google-parser.js`
- Create: `tests/google-parser.test.ts`
- Create: `tests/fixtures/google-results.html`
- Create: `tests/fixtures/google-captcha.html`

1. Write failing fixture tests for organic results, redirect URL unwrapping, duplicate removal, missing snippets, and CAPTCHA detection.
2. Run the focused test and verify expected failures.
3. Implement a DOM-independent parser core that can be invoked by the extension content script.
4. Re-run tests and commit.

### Task 4: Chrome extension

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/service-worker.js`
- Create: `extension/content-script.js`
- Create: `extension/options.html`
- Create: `extension/options.js`
- Create: `extension/README.md`

1. Write failing tests for extension request state transitions and error mapping.
2. Implement loopback WebSocket reconnect, authenticated hello, dedicated-tab reuse, Google navigation, result collection, timeout, and CAPTCHA errors.
3. Add an options page for bridge port and shared token.
4. Validate the manifest JSON and run all tests; commit.

### Task 5: Build, documentation, and DSH installation

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Modify: `/Users/sindoyang/.dsh/profiles/web/package.json`
- Modify: `/Users/sindoyang/.dsh/profiles/web/cordis.patch.yml`

1. Build the package and run the entire test suite.
2. Install the local package into the DSH web profile.
3. Add the provider plugin entry and pin `searchProvider: google-chrome`.
4. Restart `com.deepseek.dsh` and verify it remains healthy.
5. Ask for action-time confirmation, then load the unpacked Chrome extension.
6. Pair the extension and perform a real Google search through DSH.
7. Run final verification and document start, stop, troubleshooting, and removal steps.
