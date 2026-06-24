// content-main.js (ISOLATED world)
// page-bridge가 가로챈 search·fetch 이벤트를 받아 기록을 만들고 저장한다.
import { parseSearchQuery, searchIdentity } from '../lib/searchParser.js'
import { buildStatMap } from '../lib/statMap.js'
import { priceSnapshot } from '../lib/priceSnapshot.js'
import { parseExaltedPerDivine } from '../lib/currencyRates.js'
import { addHistory, markUsedByUrl } from '../store/store.js'
import { mountPanel } from './panel/panel.js'
import { initFuzzyPrefix } from './fuzzyPrefix.js'

const LOG = (...a) => console.log('[BA]', ...a)
const game = location.pathname.startsWith('/trade2') ? 'poe2' : 'poe1'
LOG('content-main loaded', { game, url: location.href })

function leagueFromUrl() {
  // /trade2/search/poe2/<League>/<hash?>  또는  /trade/search/<League>/<hash?>
  const parts = location.pathname.split('/').filter(Boolean)
  const i = parts.indexOf('search')
  if (i < 0) return 'Standard'
  let rest = parts.slice(i + 1)
  if (game === 'poe2' && rest[0] === 'poe2') rest = rest.slice(1)
  return decodeURIComponent(rest[0] || 'Standard')
}

const send = (m) => new Promise((res) => chrome.runtime.sendMessage(m, res))

// statMap은 검색 흐름과 독립적으로 1회 로드(레이스 방지)
let statMap = {}
let statMapLoading = null
function ensureStatMap() {
  if (Object.keys(statMap).length) return Promise.resolve()
  if (!statMapLoading) {
    statMapLoading = send({ type: 'fetchStats', game })
      .then((r) => { if (r && r.ok) statMap = buildStatMap(r.data); LOG('statMap', Object.keys(statMap).length, '항목') })
      .catch((e) => LOG('statMap 오류', String(e)))
  }
  return statMapLoading
}
ensureStatMap()

let pending = null // { queryId, query, league, url, done }
const queryIdFromUrl = (url) => { const m = /[?&]query=([^&]+)/.exec(url); return m ? m[1] : null }
const dedupeKey = (query) => game + '|' + searchIdentity(query)

window.addEventListener('message', async (e) => {
  if (e.origin !== location.origin) return
  const d = e.data
  if (!d || d.__baSource !== 'ba-bridge') return
  LOG('bridge msg:', d.kind)

  if (d.kind === 'search') {
    // pending을 동기적으로 먼저 설정 (await 전에) — fetch 메시지 레이스 방지
    pending = { queryId: (d.data && d.data.id) || null, query: d.query, league: leagueFromUrl(), url: location.href, done: false }
    LOG('pending 설정:', { queryId: pending.queryId, league: pending.league })
    return
  }

  if (d.kind === 'fetch' && pending && !pending.done) {
    const qid = queryIdFromUrl(d.url)
    if (pending.queryId && qid && qid !== pending.queryId) { LOG('fetch qid 불일치, 스킵', qid, pending.queryId); return }
    pending.done = true
    await ensureStatMap()

    const listings = ((d.data && d.data.result) || [])
      .map((r) => r && r.listing && r.listing.price)
      .filter(Boolean)
      .map((p) => ({ amount: p.amount, currency: p.currency }))

    let snapshot = null
    try {
      const rr = await send({ type: 'fetchRates', game, league: pending.league })
      const epd = rr && rr.ok ? parseExaltedPerDivine(rr.data) || 0 : 0
      snapshot = priceSnapshot(listings, { exaltedPerDivine: epd })
      LOG('snapshot:', snapshot, '| listings', listings.length, '| epd', epd)
    } catch (err) { LOG('환율/스냅샷 오류', String(err)) }

    // 저장된 북마크를 열어 결과가 실제로 뜨면(만료 안 됨) lastUsedAt + 가격 스냅샷 자동 갱신
    if (listings.length > 0) markUsedByUrl(location.href, snapshot || undefined)

    const parsed = parseSearchQuery(pending.query, statMap)
    const rec = await addHistory({
      game,
      league: pending.league,
      url: pending.url,
      title: parsed.title,
      itemType: parsed.itemType,
      name: parsed.name,
      stats: parsed.stats,
      statGroups: parsed.statGroups,
      priceFilter: parsed.priceFilter,
      snapshot: snapshot || undefined,
      dedupeKey: dedupeKey(pending.query),
    })
    LOG('히스토리 저장됨:', rec && rec.id, parsed.title)
    document.dispatchEvent(new CustomEvent('ba:records-changed'))
  }
})

initFuzzyPrefix()
const panel = mountPanel({ game, league: leagueFromUrl() })

// 팝업·단축키 명령 수신 (toggle/save/tour)
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'ba-command') return
  if (msg.cmd === 'toggle') panel.toggle()
  else if (msg.cmd === 'save') { panel.show(); panel.save() }
  else if (msg.cmd === 'tour') { panel.show(); panel.startTour() }
})

// [테스트 시드] localStorage.__baSeedStale='1' 후 새로고침 → 히스토리 2개로 오래된(stale) 북마크 생성(1회).
// 1개는 14일↑ 미사용(갱신 필요), 1개는 리그 불일치(이전 리그)까지. 검증용 — 필요 없으면 제거.
if (localStorage.getItem('__baSeedStale')) {
  localStorage.removeItem('__baSeedStale')
  ;(async () => {
    const KEY = 'records'
    const all = (await chrome.storage.local.get(KEY))[KEY] || []
    const hist = all.filter((r) => r.kind === 'history' && r.game === game).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2)
    if (!hist.length) { LOG('[테스트 시드] 히스토리가 없어 생성 못 함'); return }
    const old = Date.now() - 20 * 24 * 60 * 60 * 1000 // 20일 전 → stale(14일↑)
    const maxOrder = all.reduce((m, r) => (r.kind === 'bookmark' ? Math.max(m, r.order ?? 0) : m), 0)
    hist.forEach((h, i) => {
      all.push({
        ...h, id: 'seed_' + Date.now() + '_' + i, kind: 'bookmark',
        name: (h.name || h.title || '검색') + ' (테스트·오래됨)',
        folderId: null, order: maxOrder + 1 + i,
        dedupeKey: 'seedstale_' + i + '_' + (h.dedupeKey || ''),
        createdAt: old, updatedAt: old, lastUsedAt: old,
        league: i === 1 ? '난파선_테스트' : h.league, // 두 번째는 리그 불일치도 함께
      })
    })
    await chrome.storage.local.set({ [KEY]: all })
    document.dispatchEvent(new CustomEvent('ba:records-changed'))
    LOG('[테스트 시드] 오래된 북마크', hist.length, '개 생성됨')
  })()
}
