const parserPromise = import(chrome.runtime.getURL('parser.js'))

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'collect-google-results') return false
  parserPromise
    .then(({ detectGoogleBlock, parseGoogleResults }) => {
      const error = detectGoogleBlock(document)
      if (error) {
        sendResponse({ error })
        return
      }
      sendResponse({ sources: parseGoogleResults(document, message.maxResults) })
    })
    .catch((error) => {
      sendResponse({
        error: { code: 'GOOGLE_PARSE_FAILED', message: error?.message ?? 'Failed to parse Google' },
      })
    })
  return true
})
