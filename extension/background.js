import { buildGoogleSearchUrl, normalizeExtensionSettings } from './background-core.js'

const DEFAULT_PORT = 32145
const RECONNECT_DELAY_MS = 3000
const PAGE_TIMEOUT_MS = 20000

let socket
let keepAliveTimer
let reconnectTimer
let currentSettings
let status = { state: 'unconfigured', message: '请配置配对口令' }
let searchQueue = Promise.resolve()

function setStatus(state, message) {
  status = { state, message }
  chrome.runtime.sendMessage({ type: 'status-changed', status }).catch(() => {})
}

async function loadSettings() {
  let localDefaults = {}
  try {
    localDefaults = await import('./local-config.js')
  } catch {
    // Public installs configure the token from the popup. A gitignored local
    // config keeps development installations connected without publishing it.
  }
  const saved = await chrome.storage.local.get(['port', 'token'])
  return normalizeExtensionSettings({
    port: saved.port ?? localDefaults.DEFAULT_PORT ?? DEFAULT_PORT,
    token: saved.token ?? localDefaults.DEFAULT_TOKEN ?? '',
  })
}

function disconnect() {
  clearTimeout(reconnectTimer)
  clearInterval(keepAliveTimer)
  reconnectTimer = undefined
  keepAliveTimer = undefined
  if (socket) {
    socket.onclose = null
    socket.close()
    socket = undefined
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    connect().catch(() => {})
  }, RECONNECT_DELAY_MS)
}

async function connect() {
  disconnect()
  try {
    currentSettings = await loadSettings()
  } catch (error) {
    setStatus('unconfigured', error.message)
    return
  }

  setStatus('connecting', `正在连接 ${currentSettings.bridgeUrl}`)
  const nextSocket = new WebSocket(currentSettings.bridgeUrl)
  socket = nextSocket
  nextSocket.onopen = () => {
    nextSocket.send(JSON.stringify({ type: 'hello', token: currentSettings.token }))
    setStatus('connected', '已连接到本机 DSH')
    keepAliveTimer = setInterval(() => {
      if (nextSocket.readyState === WebSocket.OPEN) {
        nextSocket.send(JSON.stringify({ type: 'hello', token: currentSettings.token }))
      }
    }, 20000)
  }
  nextSocket.onmessage = (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (message?.type !== 'search') return
    searchQueue = searchQueue
      .then(() => handleSearch(message))
      .catch((error) => sendError(message.id, error.code ?? 'GOOGLE_SEARCH_FAILED', error.message))
  }
  nextSocket.onerror = () => setStatus('error', '无法连接本机 DSH')
  nextSocket.onclose = () => {
    clearInterval(keepAliveTimer)
    keepAliveTimer = undefined
    if (socket === nextSocket) socket = undefined
    setStatus('disconnected', '与本机 DSH 的连接已断开，正在重试')
    scheduleReconnect()
  }
}

function send(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(message))
}

function sendError(id, code, message) {
  send({ type: 'error', id, code, message })
}

async function ensureSearchTab() {
  const { searchTabId } = await chrome.storage.local.get('searchTabId')
  if (Number.isInteger(searchTabId)) {
    try {
      return await chrome.tabs.get(searchTabId)
    } catch {
      await chrome.storage.local.remove('searchTabId')
    }
  }
  const tab = await chrome.tabs.create({ url: 'https://www.google.com/', active: false })
  if (!Number.isInteger(tab.id)) throw new Error('Chrome did not create a search tab')
  await chrome.storage.local.set({ searchTabId: tab.id })
  return tab
}

async function navigateAndWait(tabId, url) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      const error = new Error('Google results page timed out')
      error.code = 'GOOGLE_PAGE_TIMEOUT'
      reject(error)
    }, PAGE_TIMEOUT_MS)
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(listener)
    chrome.tabs.update(tabId, { url, active: false }).catch((error) => {
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      reject(error)
    })
  })
}

async function handleSearch(message) {
  const tab = await ensureSearchTab()
  await navigateAndWait(tab.id, buildGoogleSearchUrl(message.query))
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'collect-google-results',
    maxResults: message.maxResults,
  })
  if (response?.error) {
    sendError(message.id, response.error.code, response.error.message)
    return
  }
  const sources = Array.isArray(response?.sources) ? response.sources : []
  if (sources.length === 0) {
    sendError(message.id, 'GOOGLE_NO_RESULTS', 'Google returned no readable organic results')
    return
  }
  send({ type: 'result', id: message.id, sources, truncated: false })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-status') {
    sendResponse(status)
    return false
  }
  if (message?.type === 'settings-updated') {
    connect().then(() => sendResponse({ ok: true }))
    return true
  }
  return false
})

chrome.runtime.onInstalled.addListener(() => connect().catch(() => {}))
chrome.runtime.onStartup.addListener(() => connect().catch(() => {}))
connect().catch(() => {})
