// content-main.js (ISOLATED world)
// page-bridge가 가로챈 search·fetch 이벤트를 받아 기록을 만들고 저장한다.
import { parseSearchQuery, searchIdentity } from '../lib/searchParser.js'
import { buildStatMap } from '../lib/statMap.js'
import { buildFilterMap } from '../lib/filterMap.js'
import { buildLeagueMap } from '../lib/leagueMap.js'
import { priceSnapshot } from '../lib/priceSnapshot.js'
import { topIcon } from '../lib/topIcon.js'
import { parseExaltedPerDivine, baseFromPrice, baseCurrencyOf, fmtCurAmount } from '../lib/currencyRates.js'
import { addHistory, markUsedByUrl, ensureSchema } from '../store/store.js'
import { mountPanel } from './panel/panel.js'
import { initFuzzyPrefix } from './fuzzyPrefix.js'
import { buildPobText } from '../lib/pobExport.js'

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

// 데이터 스키마 버전 보장 — 향후 구조 변경 시 마이그레이션 진입점 (현재 v1: 버전 마킹만)
ensureSchema()

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

// filterMap도 1회 로드 — 검색 조건 툴팁에 모든 필터(유형·희귀도·레벨·가격 등)를 한글로 표시
let filterMap = { label: {}, options: {} }
let filterMapLoading = null
function ensureFilterMap() {
  if (Object.keys(filterMap.label).length) return Promise.resolve()
  if (!filterMapLoading) {
    filterMapLoading = send({ type: 'fetchFilters', game })
      .then((r) => { if (r && r.ok) filterMap = buildFilterMap(r.data); LOG('filterMap', Object.keys(filterMap.label).length, '필터') })
      .catch((e) => LOG('filterMap 오류', String(e)))
  }
  return filterMapLoading
}
ensureFilterMap()

// 리그명 맵도 1회 로드 — 리그 섹션 헤더에 한글 리그명(스탠다드 등) 표시. 로드되면 재렌더 트리거.
let leagueMap = {}
let leagueMapLoading = null
function ensureLeagueMap() {
  if (Object.keys(leagueMap).length) return Promise.resolve()
  if (!leagueMapLoading) {
    leagueMapLoading = send({ type: 'fetchLeagues', game })
      .then((r) => { if (r && r.ok) { leagueMap = buildLeagueMap(r.data); document.dispatchEvent(new CustomEvent('ba:records-changed')) } LOG('leagueMap', Object.keys(leagueMap).length) })
      .catch((e) => LOG('leagueMap 오류', String(e)))
  }
  return leagueMapLoading
}
ensureLeagueMap()

let pending = null // { queryId, query, league, url, done }
let lastQuery = null // 최근 검색 raw query (한↔영 전환용)
let lastQueryLeague = null
const queryIdFromUrl = (url) => { const m = /[?&]query=([^&]+)/.exec(url); return m ? m[1] : null }
const dedupeKey = (query) => game + '|' + searchIdentity(query)

// ── 영문 PoB 복사 + 엑잘 환산 — 결과 아이템·가격 보관 + 행마다 'PoB' 버튼·'≈ 엑잘' 칩 주입 ──
const pobItems = new Map() // result.id → item. 스크롤 페이지네이션 fetch 누적, 새 검색 시 초기화
const pobPrices = new Map() // result.id → listing.price({amount, currency}) — 엑잘 환산 칩용
let lastRates = null // BE exchange_rates(카오스·디바인·미러→엑잘) — 검색마다 스냅샷 fetch에서 갱신
let pobMaps = null // { statMap, baseMap } — 클릭 시 1회 lazy 로드(~775KB JSON, 초기 번들 무영향)

function pobCopyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t)
  return new Promise((res, rej) => { // 폴백: 포커스 제약 등으로 clipboard API 실패 시
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); res() } catch (err) { rej(err) } finally { ta.remove() }
  })
}
function pobFlash(btn, msg) { const t = btn.innerHTML; btn.textContent = msg; btn.disabled = true; setTimeout(() => { btn.innerHTML = t; btn.disabled = false }, 1600) } // 2줄 라벨 복원 위해 innerHTML 저장
async function pobCopy(item, btn) {
  try {
    if (!pobMaps) {
      const [s, b, u] = await Promise.all(game === 'poe1'
        ? [import('../lib/pobStatMap.poe1.json'), import('../lib/pobBaseMap.poe1.json'), import('../lib/pobUniqueMap.poe1.json')]
        : [import('../lib/pobStatMap.json'), import('../lib/pobBaseMap.json'), import('../lib/pobUniqueMap.json')])
      pobMaps = { statMap: s.default, baseMap: b.default, uniqueMap: u.default }
    }
    const { text, missing } = buildPobText(item, pobMaps.statMap, pobMaps.baseMap, pobMaps.uniqueMap)
    await pobCopyText(text)
    pobFlash(btn, missing.length ? `복사됨 (미변환 ${missing.length})` : '복사됨 ✓')
    if (missing.length) LOG('PoB 미변환 항목:', missing)
  } catch (err) { LOG('PoB 복사 실패', String(err)); pobFlash(btn, '복사 실패') }
}
// 페이지 표면(비-shadow) 버튼 스타일 1회 주입 — 패널과 동일한 바이올렛 글래스모피즘(:hover 포함)
function pobEnsureStyle() {
  if (document.getElementById('ba-pob-style')) return
  const st = document.createElement('style')
  st.id = 'ba-pob-style'
  st.textContent = `
  .ba-pob-wrap { display: block; text-align: center; margin-top: 6px; }
  .ba-pob-btn { box-sizing: border-box;
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    padding: 6px 11px; cursor: pointer; white-space: nowrap;
    font-family: inherit; line-height: 1; letter-spacing: -0.01em; color: #ddd6fe;
    background: rgba(167, 139, 250, 0.14); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
    border: 1px solid rgba(167, 139, 250, 0.5); border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 14px rgba(167, 139, 250, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.12);
    transition: background .15s, box-shadow .15s, color .15s; z-index: 5; }
  .ba-pob-btn b { font-size: 13px; font-weight: 800; }
  .ba-pob-btn span { font-size: 10.5px; font-weight: 600; color: #b9adf1; }
  .ba-pob-btn:hover { background: rgba(167, 139, 250, 0.28); color: #fff; }
  .ba-pob-btn:hover span { color: #e6e0ff; }
  .ba-pob-btn:hover { box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4), 0 0 22px rgba(167, 139, 250, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.16); }
  .ba-pob-btn:disabled { opacity: .8; cursor: default; }
  .ba-exr-chip { display: inline-flex; align-items: center; gap: 4px; vertical-align: middle; margin-left: 7px;
    position: relative; padding: 2px 8px; white-space: nowrap; cursor: help;
    font-family: inherit; font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: -0.01em; color: #ddd6fe;
    background: rgba(167, 139, 250, 0.13); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(167, 139, 250, 0.4); border-radius: 999px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1); }
  .ba-exr-chip img { width: 15px !important; height: 15px !important; object-fit: contain !important; display: block; max-width: none !important; }
  .ba-exr-chip::after { content: attr(data-tip); position: absolute; right: 0; bottom: calc(100% + 7px);
    padding: 7px 10px; font-size: 11px; font-weight: 600; letter-spacing: -0.01em; color: #e6e0ff; white-space: nowrap;
    background: rgba(20, 17, 34, 0.97); border: 1px solid rgba(167, 139, 250, 0.5); border-radius: 9px;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5), 0 0 14px rgba(167, 139, 250, 0.2);
    opacity: 0; pointer-events: none; transform: translateY(3px); transition: opacity .15s, transform .15s; z-index: 60; }
  .ba-exr-chip:hover::after { opacity: 1; transform: translateY(0); }`
  document.head.appendChild(st)
}
// 기본 화폐(엑잘/카오스) 아이콘 — 확장 내부 URL은 페이지 CSP·dynamic URL 제약으로 깨질 수 있어
// GGG 공식 static API의 CDN 이미지(사이트 자체가 쓰는 것과 동일)를 1회 가져와 사용한다.
let curIcon = null // CDN 이미지 URL — 로드 전엔 칩이 텍스트 단위로 폴백
let curIconTried = false
function ensureCurIcon() {
  if (curIconTried) return
  curIconTried = true
  const path = game === 'poe2' ? 'trade2' : 'trade'
  fetch(`https://poe.kakaogames.com/api/${path}/data/static`) // 콘텐츠 스크립트 = 동일 출처
    .then((r) => r.json())
    .then((s) => {
      const cur = (s.result || []).find((g) => g.id === 'Currency')
      const entry = (cur?.entries || []).find((e) => e.id === baseCurrencyOf(game))
      if (entry?.image) { curIcon = 'https://web.poecdn.com' + entry.image; injectPobButtons() } // 도착 즉시 칩 패스
    })
    .catch((err) => LOG('기본 화폐 아이콘 로드 실패(텍스트 폴백)', String(err)))
}

// '제시 가격'(협상가)·'정가'(고정가) 라벨을 포함한 리프 요소의 부모(가격 블록) — 클래스명 추측 대신 텍스트 앵커
function findPriceHost(row) {
  for (const el of row.querySelectorAll('div,span,p,strong,em')) {
    if (el.childElementCount === 0 && /제시\s*가격|정가/.test(el.textContent)) return el.parentElement
  }
  return null
}
// 칩 내용 렌더 — 제시 가격 줄의 화폐 아이콘 크기를 실측해 칩 아이콘·글자를 그에 맞춘다(작아서 안 보이는 문제).
// 사이트 전역 img 규칙을 이기도록 인라인 !important. 아이콘 로드 전엔 텍스트 단위 폴백.
function renderChipContent(chip, host, label) {
  const v = chip.dataset.v // fmtCurAmount 결과(숫자 문자열) — 안전
  if (!curIcon) { chip.textContent = `≈ ${v} ${game === 'poe1' ? '카오스' : '엑잘'}`; return }
  const priceImg = [...host.querySelectorAll('img')].find((im) => !im.closest('.ba-exr-chip') && im.getBoundingClientRect().height >= 14)
  const h = priceImg ? Math.min(40, Math.max(15, Math.round(priceImg.getBoundingClientRect().height))) : 15
  chip.innerHTML = `≈ ${v} <img src="${curIcon}" alt="${label}">`
  const im = chip.querySelector('img')
  im.style.setProperty('width', h + 'px', 'important')
  im.style.setProperty('height', h + 'px', 'important')
  chip.style.fontSize = Math.max(11, Math.round(h * 0.42)) + 'px'
}
function injectExrChip(row, id) {
  if (!lastRates) return false
  const label = game === 'poe1' ? '카오스 오브' : '엑잘티드 오브'
  const existing = row.querySelector('.ba-exr-chip')
  if (existing) {
    // 아이콘보다 칩이 먼저 주입돼 텍스트 폴백으로 굳는 문제 — 아이콘 도착 후 패스에서 업그레이드
    if (curIcon && !existing.querySelector('img') && existing.dataset.v && existing.parentElement) renderChipContent(existing, existing.parentElement, label)
    return false
  }
  const v = baseFromPrice(pobPrices.get(id), lastRates, game)
  if (v == null) return false
  const host = findPriceHost(row)
  if (!host) return false
  const chip = document.createElement('div')
  chip.className = 'ba-exr-chip'
  chip.dataset.v = fmtCurAmount(v)
  chip.setAttribute('data-tip', `${label} 환산 — 서미누기 환율 API 기준`) // 테마 툴팁(::after) — 네이티브 title 미사용
  host.appendChild(chip) // host에 먼저 붙여야 renderChipContent가 가격 아이콘 크기를 실측 가능
  renderChipContent(chip, host, label)
  return true
}
let pobMissLogged = false
function injectPobButtons() {
  pobEnsureStyle()
  // 거래소 결과 행은 .row[data-id] (공식 trade 앱 구조) — data-id가 fetch 응답 result.id와 일치
  const rows = document.querySelectorAll('.row[data-id]')
  let injected = 0, misses = 0, chips = 0
  for (const row of rows) {
    const id = row.getAttribute('data-id')
    const item = pobItems.get(id)
    if (!item) { misses++; continue }
    if (injectExrChip(row, id)) chips++ // 환산 칩은 버튼과 독립 주입(환율이 늦게 와도 다음 패스에서 붙음)
    if (row.querySelector('.ba-pob-btn')) continue
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'ba-pob-btn' // 바이올렛 글래스모피즘(pobEnsureStyle) — 사이트 버튼 룩 사용 안 함
    btn.innerHTML = '<b>PoB</b><span>영문 복사</span>' // 정적 문자열(사용자 데이터 없음)
    btn.title = '이 아이템을 영문 텍스트로 복사 — PoB(Path of Building)에 Ctrl+V로 붙여넣기'
    btn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); pobCopy(item, btn) })
    // 1순위: '인증 완료' 배지 아래(왼쪽 컬럼, 자연 흐름) — 텍스트 앵커라 이미지 로딩 타이밍과 무관하고,
    // poe1 세로로 긴 무기 이미지에서 버튼이 늘어지는 문제(높이 매칭)도 없다.
    const rr = row.getBoundingClientRect()
    const badge = [...row.querySelectorAll('div,span,p,em,strong')].find((el) =>
      el.childElementCount === 0 && /인증/.test(el.textContent) && el.getBoundingClientRect().left - rr.left < rr.width * 0.4)
    if (badge && badge.parentElement) {
      const wrap = document.createElement('div')
      wrap.className = 'ba-pob-wrap'
      wrap.appendChild(btn)
      badge.parentElement.insertBefore(wrap, badge.nextSibling)
    } else {
      // 2순위: 아이템 이미지 오른쪽(자연 높이) — 행 왼쪽 40% 안의 img 실측. 로딩 전(0폭)이면 다음 패스로.
      const leftImgs = [...row.querySelectorAll('img')].filter((im) => im.getBoundingClientRect().left - rr.left < rr.width * 0.4)
      const img = leftImgs.find((im) => im.getBoundingClientRect().width >= 40)
      if (!img && leftImgs.some((im) => !im.complete || im.getBoundingClientRect().width === 0)) continue
      if (img && rr.width) {
        // 인라인 지정 — 사이트의 인라인/고특이성 position에 안 지게(지면 버튼 기준이 뷰포트가 돼 엉뚱한 곳에 뜸)
        if (getComputedStyle(row).position === 'static') row.style.position = 'relative'
        const ir = img.getBoundingClientRect()
        btn.style.position = 'absolute'; btn.style.transform = 'translateY(-50%)'
        btn.style.left = Math.round(ir.right - rr.left + 10) + 'px'
        btn.style.top = Math.round(ir.top + ir.height / 2 - rr.top) + 'px'
        row.appendChild(btn)
      } else { // 3순위: 우측 버튼 줄 아래(구조 변경 대비)
        const btnRow = row.querySelector('.btns')
        if (btnRow && btnRow.parentElement) {
          const wrap = document.createElement('div')
          wrap.style.cssText = 'text-align:right;margin-top:5px'
          wrap.appendChild(btn)
          btnRow.parentElement.insertBefore(wrap, btnRow.nextSibling)
        } else { (row.querySelector('.details') || row).appendChild(btn) }
      }
    }
    injected++
  }
  if (injected || chips) LOG('행 주입 — PoB 버튼:', injected, '/ 엑잘 칩:', chips, '(행', rows.length, ', 보관', pobItems.size, ')')
  else if (misses && rows.length && !pobMissLogged) { pobMissLogged = true; LOG('PoB 주입 불가 — 행', rows.length, '중 아이템 미매칭', misses, '(보관', pobItems.size, ') data-id 예:', rows[0].getAttribute('data-id')?.slice(0, 16)) }
}
// 행은 fetch 후 아무 때나 생긴다(스크롤 로딩·정렬 재렌더·라이브 갱신·컨테이너 교체) —
// 특정 컨테이너 탐색·재부착에 의존하면 교체 시 죽은 노드를 감시하게 되므로,
// body 전역 감시(디바운스 100ms — 스캔은 querySelectorAll 1회라 저렴) + fetch마다 지연 재시도의 이중 안전망.
let pobKickPending = false
function pobKick() {
  if (pobKickPending) return
  pobKickPending = true
  setTimeout(() => { pobKickPending = false; injectPobButtons() }, 100)
}
let pobBodyObserver = null
function pobEnsureObserver() {
  if (pobBodyObserver) return
  pobBodyObserver = new MutationObserver(pobKick)
  pobBodyObserver.observe(document.body, { childList: true, subtree: true })
}
let pobTimers = []
function schedulePobInject() {
  ensureCurIcon() // 기본 화폐 아이콘을 첫 fetch 시점에 미리 로드(환율 도착 전에 준비 — 텍스트 폴백 최소화)
  try { pobEnsureObserver() } catch (err) { LOG('PoB 옵저버 실패', String(err)) }
  pobTimers.forEach(clearTimeout)
  pobTimers = [100, 400, 1000, 2500, 6000].map((ms) => setTimeout(injectPobButtons, ms))
}

window.addEventListener('message', async (e) => {
  if (e.origin !== location.origin) return
  const d = e.data
  if (!d || d.__baSource !== 'ba-bridge') return
  LOG('bridge msg:', d.kind)

  if (d.kind === 'fetch') { // 히스토리 저장(아래 pending 가드)과 별개로, 모든 fetch(스크롤 포함)에서 아이템·가격 보관
    for (const r of (d.data && d.data.result) || []) {
      if (!r || !r.id) continue
      if (r.item) pobItems.set(r.id, r.item)
      if (r.listing && r.listing.price) pobPrices.set(r.id, r.listing.price)
    }
    schedulePobInject()
  }

  if (d.kind === 'search') {
    pobItems.clear(); pobPrices.clear() // 새 검색 — 이전 결과 폐기
    // pending을 동기적으로 먼저 설정 (await 전에) — fetch 메시지 레이스 방지
    pending = { queryId: (d.data && d.data.id) || null, query: d.query, league: leagueFromUrl(), url: location.href, done: false }
    lastQuery = d.query; lastQueryLeague = pending.league // 전환 버튼용 최근 query 보관
    LOG('pending 설정:', { queryId: pending.queryId, league: pending.league })
    return
  }

  if (d.kind === 'fetch' && pending && !pending.done) {
    const qid = queryIdFromUrl(d.url)
    if (pending.queryId && qid && qid !== pending.queryId) { LOG('fetch qid 불일치, 스킵', qid, pending.queryId); return }
    pending.done = true
    await Promise.all([ensureStatMap(), ensureFilterMap()])

    const results = (d.data && d.data.result) || []
    const listings = results
      .map((r) => r && r.listing && r.listing.price)
      .filter(Boolean)
      .map((p) => ({ amount: p.amount, currency: p.currency }))
    // 결과 아이템 이미지 중 가장 많이 나온(최빈) 아이콘을 대표 썸네일로
    const icon = topIcon(results.map((r) => r && r.item && r.item.icon))

    let snapshot = null
    try {
      // BE는 EN 리그 id(예: Mirage)를 요구 — poe1 URL은 KR 표시명(허상)이라 leagueMap으로 역변환(못 찾으면 그대로)
      const leagueId = Object.keys(leagueMap).find((id) => leagueMap[id] === pending.league) || pending.league
      const rr = await send({ type: 'fetchRates', game, league: leagueId })
      if (rr && rr.ok && rr.data && rr.data.exchange_rates) { lastRates = rr.data.exchange_rates; injectPobButtons() } // 환율 도착 즉시 엑잘 칩 패스
      const epd = rr && rr.ok ? parseExaltedPerDivine(rr.data) || 0 : 0
      snapshot = priceSnapshot(listings, { exaltedPerDivine: epd })
      LOG('snapshot:', snapshot, '| listings', listings.length, '| epd', epd)
    } catch (err) { LOG('환율/스냅샷 오류', String(err)) }

    const parsed = parseSearchQuery(pending.query, statMap, filterMap)
    const key = dedupeKey(pending.query)
    // 저장된 북마크를 열어 결과가 실제로 뜨면(만료 안 됨) lastUsedAt·스냅샷·아이콘 갱신 +
    // 검색 조건을 최신 파서 형식으로 재기록(구 북마크에 능력치 수치 등 반영 — 하위호환 업그레이드).
    if (listings.length > 0) await markUsedByUrl(location.href, snapshot || undefined, icon || undefined, {
      title: parsed.title, itemType: parsed.itemType, stats: parsed.stats, statGroups: parsed.statGroups,
      otherFilters: parsed.otherFilters, priceFilter: parsed.priceFilter, dedupeKey: key,
    })

    const rec = await addHistory({
      game,
      league: pending.league,
      url: pending.url,
      title: parsed.title,
      itemType: parsed.itemType,
      name: parsed.name,
      stats: parsed.stats,
      statGroups: parsed.statGroups,
      otherFilters: parsed.otherFilters,
      priceFilter: parsed.priceFilter,
      icon: icon || undefined,
      snapshot: snapshot || undefined,
      dedupeKey: key,
    })
    LOG('히스토리 저장됨:', rec && rec.id, parsed.title)
    document.dispatchEvent(new CustomEvent('ba:records-changed'))
  }
})

initFuzzyPrefix()
const panel = mountPanel({
  game,
  league: leagueFromUrl(),
  getLeagueMap: () => leagueMap,
  getCurrentSearch: () => (lastQuery ? { query: lastQuery, league: lastQueryLeague || leagueFromUrl() } : null),
})

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
