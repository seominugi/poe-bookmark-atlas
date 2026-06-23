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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg && msg.type === 'fetchRates') sendResponse({ ok: true, data: await fetchRates(msg.game, msg.league) })
      else if (msg && msg.type === 'fetchStats') sendResponse({ ok: true, data: await fetchStats(msg.game) })
      else sendResponse({ ok: false, error: 'unknown message' })
    } catch (e) {
      sendResponse({ ok: false, error: String(e) })
    }
  })()
  return true // async 응답 유지
})

// ── 키보드 단축키 (manifest commands) ──
const ECON = { poe1: 'https://seominugi.com/poe1/economy/items', poe2: 'https://seominugi.com/poe2/economy/items' }
const TREND = { poe1: 'https://seominugi.com/poe1/economy/trends', poe2: 'https://seominugi.com/poe2/economy/trends' }
const isTrade = (url) => /poe\.kakaogames\.com\/trade2?\//i.test(url || '')
const gameOf = (url) => (/\/trade2|poe2/i.test(url || '') ? 'poe2' : 'poe1')

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return
  const game = gameOf(tab.url)
  if (command === 'open-econ') chrome.tabs.create({ url: ECON[game] })
  else if (command === 'open-trend') chrome.tabs.create({ url: TREND[game] })
  else if ((command === 'toggle-panel' || command === 'save-search') && isTrade(tab.url)) {
    chrome.tabs.sendMessage(tab.id, { type: 'ba-command', cmd: command === 'toggle-panel' ? 'toggle' : 'save' }).catch(() => {})
  }
})
