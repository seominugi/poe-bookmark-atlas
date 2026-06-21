// content-main.js (ISOLATED world)
// page-bridge가 가로챈 search·fetch 이벤트를 받아 기록을 만들고 저장한다.
import { parseSearchQuery } from '../lib/searchParser.js'
import { buildStatMap } from '../lib/statMap.js'
import { priceSnapshot } from '../lib/priceSnapshot.js'
import { parseExaltedPerDivine } from '../lib/currencyRates.js'
import { addHistory } from '../store/store.js'
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
const dedupeKey = (query) => game + '|' + JSON.stringify((query && query.query) || {})

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

    const parsed = parseSearchQuery(pending.query, statMap)
    const rec = await addHistory({
      game,
      league: pending.league,
      url: pending.url,
      title: parsed.title,
      itemType: parsed.itemType,
      name: parsed.name,
      stats: parsed.stats,
      priceFilter: parsed.priceFilter,
      snapshot: snapshot || undefined,
      dedupeKey: dedupeKey(pending.query),
    })
    LOG('히스토리 저장됨:', rec && rec.id, parsed.title)
    document.dispatchEvent(new CustomEvent('ba:records-changed'))
  }
})

initFuzzyPrefix()
mountPanel({ game })
