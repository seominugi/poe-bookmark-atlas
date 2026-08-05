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

  // 후킹을 네이티브와 구분되지 않게 위장한다.
  // 왜: Cloudflare 등 봇 탐지가 `String(window.fetch)`가 "[native code]"인지 본다. 우리 후킹은
  // 관찰 전용이라 동작엔 영향이 없는데도 봇 점수를 올려, pathofexile.com에서 챌린지가 반복되며
  // 화면이 깜박이는 증상이 있었다(확장을 끄면 사라짐 — 사용자 A/B, 2026-08-05).
  // toString 자신도 네이티브로 보이게 한 겹 더 덮는다(얕은 탐지는 여기까지 본다).
  const fnToString = Function.prototype.toString
  const mask = (patched, orig, name) => {
    try {
      Object.defineProperty(patched, 'name', { value: name, configurable: true })
      Object.defineProperty(patched, 'length', { value: orig.length, configurable: true })
      patched.toString = function () { return fnToString.call(orig) }
      patched.toString.toString = function () { return fnToString.call(fnToString) }
    } catch (_) {}
    return patched
  }

  // --- fetch hook ---
  const origFetch = window.fetch
  window.fetch = mask(function (input, init) {
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
  }, origFetch, 'fetch')

  // --- XHR hook ---
  const origOpen = XMLHttpRequest.prototype.open
  const origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = mask(function (method, url) {
    this.__ba = { method: String(method || 'GET').toUpperCase(), url: String(url || '') }
    return origOpen.apply(this, arguments)
  }, origOpen, 'open')
  XMLHttpRequest.prototype.send = mask(function (body) {
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
  }, origSend, 'send')
})()
