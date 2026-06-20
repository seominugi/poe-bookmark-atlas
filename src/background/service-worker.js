// service-worker.js (MV3 background)
// content script의 cross-origin fetch(환율·stats)를 host_permissions로 대행한다.
const RATES_BASE = 'https://seominugi.com' // 환율 API 베이스 (운영 배포 기준 확인 필요)

async function fetchRates(game, league) {
  const url = `${RATES_BASE}/api/${game}/currency-exchange?realmName=${encodeURIComponent(league)}`
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
