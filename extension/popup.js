import { normalizeExtensionSettings } from './background-core.js'

const DEFAULT_PORT = 32145

const portInput = document.querySelector('#port')
const tokenInput = document.querySelector('#token')
const statusElement = document.querySelector('#status')
const saveButton = document.querySelector('#save')

function renderStatus(status) {
  statusElement.textContent = status?.message ?? '状态未知'
  statusElement.dataset.state = status?.state ?? 'unknown'
}

async function initialize() {
  let localDefaults = {}
  try {
    localDefaults = await import('./local-config.js')
  } catch {
    // Optional and gitignored; public installs enter their token in this popup.
  }
  const saved = await chrome.storage.local.get(['port', 'token'])
  portInput.value = String(saved.port ?? localDefaults.DEFAULT_PORT ?? DEFAULT_PORT)
  tokenInput.value = saved.token ?? localDefaults.DEFAULT_TOKEN ?? ''
  renderStatus(await chrome.runtime.sendMessage({ type: 'get-status' }))
}

saveButton.addEventListener('click', async () => {
  try {
    const settings = normalizeExtensionSettings({ port: portInput.value, token: tokenInput.value })
    await chrome.storage.local.set({ port: settings.port, token: settings.token })
    await chrome.runtime.sendMessage({ type: 'settings-updated' })
    renderStatus({ state: 'connecting', message: '配置已保存，正在连接…' })
  } catch (error) {
    renderStatus({ state: 'error', message: error.message })
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'status-changed') renderStatus(message.status)
})

initialize().catch((error) => renderStatus({ state: 'error', message: error.message }))
