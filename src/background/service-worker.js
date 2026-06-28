// service-worker.js (MV3 background)
// content script의 cross-origin fetch(환율·stats)를 host_permissions로 대행한다.
const RATES_BASE = 'https://seominugi.com' // 환율 API 베이스 (2026-06-20 라이브 확인됨)

async function fetchRates(game, league) {
  // 백엔드 리그명은 공백 대신 언더스코어 (예: "Runes of Aldur" → "Runes_of_Aldur")
  const realmName = String(league).replace(/ /g, '_')
  const url = `${RATES_BASE}/api/${game}/currency-exchange?realmName=${encodeURIComponent(realmName)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('rates ' + res.status)
  return res.json()
}

async function fetchStats(game) {
  const path = game === 'poe2' ? 'trade2' : 'trade'
  const res = await fetch(`https://poe.kakaogames.com/api/${path}/data/stats`)
  if (!res.ok) throw new Error('stats ' + res.status)
  return res.json()
}

async function fetchFilters(game) {
  const path = game === 'poe2' ? 'trade2' : 'trade'
  const res = await fetch(`https://poe.kakaogames.com/api/${path}/data/filters`)
  if (!res.ok) throw new Error('filters ' + res.status)
  return res.json()
}

// 한↔영 거래소 전환 — 현재 검색 조건을 영문 거래소(pathofexile)에서 재생성하도록 핸드오프.
// optional 권한 허용 시에만 동작. 실제 재생성은 타겟의 cross-site-receiver.js가 same-origin으로 수행.
// PoE1(/trade/)만 한국에서 접근 가능 — 패널 버튼이 poe1에서만 노출되므로 사실상 poe1만 옴(game-aware 유지).
async function handleConvert(msg) {
  const origins = ['https://www.pathofexile.com/*']
  const granted = await chrome.permissions.contains({ origins })
  if (!granted) return { ok: false, reason: 'no-permission' }
  await chrome.storage.local.set({ baCrossSite: { target: 'pathofexile', game: msg.game, query: msg.query, league: msg.league, ts: Date.now() } })
  const lg = encodeURIComponent(msg.league)
  const url = msg.game === 'poe2'
    ? `https://www.pathofexile.com/trade2/search/poe2/${lg}`
    : `https://www.pathofexile.com/trade/search/${lg}`
  await chrome.tabs.create({ url })
  return { ok: true }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg && msg.type === 'fetchRates') sendResponse({ ok: true, data: await fetchRates(msg.game, msg.league) })
      else if (msg && msg.type === 'fetchStats') sendResponse({ ok: true, data: await fetchStats(msg.game) })
      else if (msg && msg.type === 'fetchFilters') sendResponse({ ok: true, data: await fetchFilters(msg.game) })
      else if (msg && msg.type === 'ba-convert') sendResponse(await handleConvert(msg))
      else sendResponse({ ok: false, error: 'unknown message' })
    } catch (e) {
      sendResponse({ ok: false, error: String(e) })
    }
  })()
  return true // async 응답 유지
})

// ── 키보드 단축키 (manifest commands) ──
const isTrade = (url) => /(poe\.kakaogames\.com|www\.pathofexile\.com)\/trade2?\//i.test(url || '')

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel' && command !== 'save-search') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !isTrade(tab.url)) return
  chrome.tabs.sendMessage(tab.id, { type: 'ba-command', cmd: command === 'toggle-panel' ? 'toggle' : 'save' }).catch(() => {})
})
