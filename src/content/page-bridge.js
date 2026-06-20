// page-bridge.js (MAIN world)
// 페이지의 fetch/XHR를 후킹해 거래 검색(/search)·결과(/fetch) 요청을 가로채
// ISOLATED content script로 window.postMessage 전달한다.
(() => {
  console.log('[BA] page-bridge loaded (MAIN world)')
  const RE = /\/api\/trade2?\/(search|fetch)\//
  const ORIGIN = location.origin
  const kindOf = (url) => (/\/search\//.test(url) ? 'search' : 'fetch')
  const post = (msg) => {
    try {
      window.postMessage({ __baSource: 'ba-bridge', ...msg }, ORIGIN)
      console.log('[BA-bridge] captured', msg.kind, msg.url)
    } catch (_) {}
  }
  const parseMaybe = (b) => {
    if (typeof b === 'string') { try { return JSON.parse(b) } catch (_) { return b } }
    return b
  }

  // --- fetch hook ---
  const origFetch = window.fetch
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url
    const p = origFetch.apply(this, arguments)
    if (url && RE.test(url)) {
      const kind = kindOf(url)
      const query = kind === 'search' ? parseMaybe(init && init.body) : undefined
      p.then((r) => r.clone().json().catch(() => null))
        .then((data) => post({ kind, url, query, data }))
        .catch(() => {})
    }
    return p
  }

  // --- XHR hook ---
  const origOpen = XMLHttpRequest.prototype.open
  const origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ba = { method: String(method || 'GET').toUpperCase(), url: String(url || '') }
    return origOpen.apply(this, arguments)
  }
  XMLHttpRequest.prototype.send = function (body) {
    const meta = this.__ba
    if (meta && RE.test(meta.url)) {
      const kind = kindOf(meta.url)
      const query = kind === 'search' ? parseMaybe(body) : undefined
      this.addEventListener('load', () => {
        let data = null
        try { data = JSON.parse(this.responseText) } catch (_) {}
        post({ kind, url: meta.url, query, data })
      })
    }
    return origSend.apply(this, arguments)
  }
})()
