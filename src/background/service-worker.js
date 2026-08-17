// service-worker.js (MV3 background)
// content script 가 못 하는 **진짜 cross-origin** 작업만 대행한다 — 환율(seominugi)·탭 열기·한↔영 전환.
// 거래소 데이터(stats·filters·items·leagues·static)는 거래소 페이지와 같은 출처라
// 콘텐츠 스크립트가 직접 받는다. 여기로 되돌리면 호스트마다 host_permissions 가 필요해져
// 영문 거래소(pathofexile)가 다시 권한 없이는 동작하지 않게 된다(2026-08-16).
import { isAllowedTradeUrl } from '../lib/tradeSearch.js'
import { EN_ORIGIN, enFetchPath, isSafeListingId } from '../lib/enListing.js'

const RATES_BASE = 'https://seominugi.com' // 환율 API 베이스 (2026-06-20 라이브 확인됨)

async function fetchRates(game, league) {
  // 백엔드 리그명은 공백 대신 언더스코어 (예: "Runes of Aldur" → "Runes_of_Aldur")
  const realmName = String(league).replace(/ /g, '_')
  const url = `${RATES_BASE}/api/${game}/currency-exchange?realmName=${encodeURIComponent(realmName)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('rates ' + res.status)
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

// 영문 거래소에서 같은 매물을 받아 PoB 복사에 쓴다(lib/enListing.js 주석 참조).
// 카카오 페이지에서는 cross-origin 이라 콘텐츠 스크립트가 직접 못 받는다 — 여기서 대행한다.
// **optional 권한이라 허용 전에는 실패한다**: 그때는 reason 을 돌려 호출부가 기존 번역으로 폴백한다.
async function handleFetchEn(msg) {
  if (!isSafeListingId(msg && msg.id)) return { ok: false, reason: 'bad-id' }
  const origins = [`${EN_ORIGIN}/*`]
  try { if (!(await chrome.permissions.contains({ origins }))) return { ok: false, reason: 'no-permission' } } catch (_) { return { ok: false, reason: 'no-permission' } }
  let res
  try { res = await fetch(EN_ORIGIN + enFetchPath(msg.game, msg.id), { headers: { Accept: 'application/json' } }) } catch (_) { return { ok: false, reason: 'network' } }
  if (res.status === 429) return { ok: false, reason: 'rate' }
  if (!res.ok) return { ok: false, reason: 'http' }
  try { return { ok: true, data: await res.json() } } catch (_) { return { ok: false, reason: 'parse' } }
}

// 새 탭으로 열기 — 콘텐츠 스크립트의 window.open 대신 여기서 연다.
// window.open 은 **사용자 제스처 창 안에서만** 허용돼, 대화상자·네트워크 응답을 기다린 뒤
// (예: 지난 리그 팝오버의 '그대로 열기', 리그 이관 성공 후) 부르면 팝업 차단으로 조용히 실패한다.
// 서비스 워커의 tabs.create 는 제스처와 무관하므로 모든 경로가 같은 방식으로 열린다.
// URL 은 여기서 **다시** 검증한다 — 호출부가 검증했더라도 이 핸들러는 독립적으로 안전해야 한다.
async function handleOpenTab(msg) {
  if (!isAllowedTradeUrl(msg && msg.url)) return { ok: false, reason: 'bad-url' }
  await chrome.tabs.create({ url: msg.url })
  return { ok: true }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg && msg.type === 'fetchRates') sendResponse({ ok: true, data: await fetchRates(msg.game, msg.league) })
      else if (msg && msg.type === 'ba-convert') sendResponse(await handleConvert(msg))
      else if (msg && msg.type === 'ba-open-tab') sendResponse(await handleOpenTab(msg))
      else if (msg && msg.type === 'ba-fetch-en') sendResponse(await handleFetchEn(msg))
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
