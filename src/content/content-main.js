// content-main.js (ISOLATED world)
// page-bridge가 가로챈 search·fetch 이벤트를 받아 기록을 만들고 저장한다.
import { parseSearchQuery } from '../lib/searchParser.js'
import { buildStatMap } from '../lib/statMap.js'
import { priceSnapshot } from '../lib/priceSnapshot.js'
import { parseExaltedPerDivine } from '../lib/currencyRates.js'
import { addHistory } from '../store/store.js'
import { mountPanel } from './panel/panel.js'

const game = location.pathname.startsWith('/trade2') ? 'poe2' : 'poe1'

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

let statMap = {}
async function ensureStatMap() {
  if (Object.keys(statMap).length) return
  const r = await send({ type: 'fetchStats', game })
  if (r && r.ok) statMap = buildStatMap(r.data)
}

let pending = null // { queryId, query, league, url, done }
const queryIdFromUrl = (url) => { const m = /[?&]query=([^&]+)/.exec(url); return m ? m[1] : null }
const dedupeKey = (query) => game + '|' + JSON.stringify((query && query.query) || {})

window.addEventListener('message', async (e) => {
  if (e.origin !== location.origin) return
  const d = e.data
  if (!d || d.__baSource !== 'ba-bridge') return

  if (d.kind === 'search') {
    await ensureStatMap()
    pending = { queryId: (d.data && d.data.id) || null, query: d.query, league: leagueFromUrl(), url: location.href, done: false }
    return
  }

  if (d.kind === 'fetch' && pending && !pending.done) {
    const qid = queryIdFromUrl(d.url)
    if (pending.queryId && qid && qid !== pending.queryId) return // 다른 검색의 fetch
    pending.done = true

    const listings = ((d.data && d.data.result) || [])
      .map((r) => r && r.listing && r.listing.price)
      .filter(Boolean)
      .map((p) => ({ amount: p.amount, currency: p.currency }))

    let snapshot = null
    try {
      const rr = await send({ type: 'fetchRates', game, league: pending.league })
      const epd = rr && rr.ok ? parseExaltedPerDivine(rr.data) || 0 : 0
      snapshot = priceSnapshot(listings, { exaltedPerDivine: epd })
    } catch (_) {}

    const parsed = parseSearchQuery(pending.query, statMap)
    await addHistory({
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
    document.dispatchEvent(new CustomEvent('ba:records-changed'))
  }
})

mountPanel({ game })
