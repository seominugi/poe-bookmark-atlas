// content-main.js (ISOLATED world)
// page-bridge가 가로챈 search·fetch 이벤트를 받아 기록을 만들고 저장한다.
import { parseSearchQuery, searchIdentity } from '../lib/searchParser.js'
import { buildStatMap } from '../lib/statMap.js'
import { buildFilterMap } from '../lib/filterMap.js'
import { buildLeagueMap } from '../lib/leagueMap.js'
import { priceSnapshot } from '../lib/priceSnapshot.js'
import { topIcon } from '../lib/topIcon.js'
import { parseExaltedPerDivine, baseFromPrice, divineFromPrice, baseCurrencyOf, fmtCurAmount } from '../lib/currencyRates.js'
import { searchApiPath, searchResultPath, isSafeSearchId, sanitizeQuery, searchHashFromUrl, isAllowedTradeUrl } from '../lib/tradeSearch.js'
import { mergeConditionSet } from '../lib/conditionSet.js'
import { addHistory, markUsedByUrl, ensureSchema, backfillQuery } from '../store/store.js'
import { mountPanel } from './panel/panel.js'
import { initFuzzyPrefix } from './fuzzyPrefix.js'
import { buildPobText, buildReportText } from '../lib/pobExport.js'

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
let lastRates = null // BE 원본 응답({exchange_rates, items}) — 검색마다 스냅샷 fetch에서 갱신. items엔 큐레이션 4종 밖 60여 화폐(쥬얼러·색채 등) 시세
let pobMaps = null // { statMap, baseMap } — 클릭 시 1회 lazy 로드(~775KB JSON, 초기 번들 무영향)

function pobCopyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t)
  return new Promise((res, rej) => { // 폴백: 포커스 제약 등으로 clipboard API 실패 시
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); res() } catch (err) { rej(err) } finally { ta.remove() }
  })
}
// title/sub — 기본 버튼과 같은 <b>+<span> 2줄 구조로 교체해 텍스트 길이와 무관하게 크기가 그대로 유지되게 한다
// (예전엔 textContent 단일 줄로 바꿔서 2줄→1줄로 버튼이 줄어드는 문제가 있었다). 값은 전부 하드코딩 한국어 리터럴이라 안전.
function pobFlash(btn, title, sub) {
  const t = btn.innerHTML
  btn.innerHTML = `<b>${title}</b><span>${sub}</span>`
  btn.disabled = true
  btn.classList.add('ba-pob-flash') // 살짝 강조 팝(box-shadow·밝기 — transform은 위치 계산에 쓰여 애니메이션에서 제외)
  setTimeout(() => btn.classList.remove('ba-pob-flash'), 500)
  setTimeout(() => { btn.innerHTML = t; btn.disabled = false }, 1600)
}
async function ensurePobMaps() {
  if (!pobMaps) {
    const [s, b, u] = await Promise.all(game === 'poe1'
      ? [import('../lib/pobStatMap.poe1.json'), import('../lib/pobBaseMap.poe1.json'), import('../lib/pobUniqueMap.poe1.json')]
      : [import('../lib/pobStatMap.json'), import('../lib/pobBaseMap.json'), import('../lib/pobUniqueMap.json')])
    pobMaps = { statMap: s.default, baseMap: b.default, uniqueMap: u.default }
  }
  return pobMaps
}
async function pobCopy(item, btn) {
  try {
    const maps = await ensurePobMaps()
    const { text, missing } = buildPobText(item, maps.statMap, maps.baseMap, maps.uniqueMap)
    await pobCopyText(text)
    pobFlash(btn, '복사됨', missing.length ? `미변환 ${missing.length}` : '✓')
    if (missing.length) LOG('PoB 미변환 항목:', missing)
  } catch (err) { LOG('PoB 복사 실패', String(err)); pobFlash(btn, '복사 실패', '다시 시도') }
}
// Shift+클릭 — 미변환 mod를 수동으로 제보(웹훅 없이: 클라이언트에 Discord 웹훅 시크릿을 두면 추출·악용 위험이 있어
// 제보 텍스트를 클립보드에 복사 + 기존 공개 초대 링크로 Discord를 열어 사용자가 직접 붙여넣게 한다).
const DISCORD_URL = 'https://discord.gg/kEm2G2qcZQ'
async function reportMissing(item, btn) {
  try {
    const maps = await ensurePobMaps()
    const { missing } = buildPobText(item, maps.statMap, maps.baseMap, maps.uniqueMap)
    const report = buildReportText(item, missing, game)
    if (!report) { pobFlash(btn, '제보할 내용 없음', '번역 정상 ✓'); return }
    await pobCopyText(report)
    window.open(DISCORD_URL, '_blank', 'noopener')
    pobFlash(btn, '제보 정보 복사됨', 'Discord에 붙여넣기')
  } catch (err) { LOG('제보 준비 실패', String(err)); pobFlash(btn, '제보 실패', '다시 시도') }
}
// 페이지 표면(비-shadow) 버튼 스타일 1회 주입 — 패널과 동일한 바이올렛 글래스모피즘(:hover 포함)
function pobEnsureStyle() {
  if (document.getElementById('ba-pob-style')) return
  const st = document.createElement('style')
  st.id = 'ba-pob-style'
  st.textContent = `
  .ba-pob-wrap { display: block; text-align: center; margin-top: 6px; }
  .ba-pob-btn { box-sizing: border-box; position: relative;
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
  /* 페이지 표면 커스텀 툴팁(#ba-page-tip, JS 렌더) — 패널 조건 칩 툴팁(.ba-tip)과 디자인 토큰 통일.
     CSS ::after의 content:attr()는 순수 텍스트만 가능해 부분 강조색을 못 넣어서(리그 텍스트처럼 강조 요청) JS로 전환.
     《...》 마커는 패널 툴팁과 동일 관례로 강조색(시안) span 치환. */
  #ba-page-tip { position: fixed; z-index: 2147483600; max-width: 250px;
    background: rgba(6, 9, 15, 0.98); color: #e6e3f5;
    border: 1px solid rgba(167, 139, 250, 0.4); border-radius: 8px;
    padding: 8px 12px; font-size: 11px; line-height: 1.6; font-family: inherit;
    white-space: pre-line; text-align: left;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55); pointer-events: none;
    opacity: 0; transition: opacity .15s; }
  #ba-page-tip.show { opacity: 1; }
  #ba-page-tip .ba-tip-accent { color: #3ed8e6; font-weight: 700; }
  @keyframes ba-pob-pop { 0% { box-shadow: 0 4px 16px rgba(0,0,0,.35), 0 0 14px rgba(167,139,250,.22), inset 0 1px 0 rgba(255,255,255,.12); filter: brightness(1); }
    40% { box-shadow: 0 4px 22px rgba(0,0,0,.45), 0 0 32px rgba(167,139,250,.75), inset 0 1px 0 rgba(255,255,255,.2); filter: brightness(1.25); }
    100% { box-shadow: 0 4px 16px rgba(0,0,0,.35), 0 0 14px rgba(167,139,250,.22), inset 0 1px 0 rgba(255,255,255,.12); filter: brightness(1); } }
  .ba-pob-btn.ba-pob-flash { animation: ba-pob-pop .5s ease; }
  .ba-exr-chip { display: inline-flex; align-items: center; gap: 4px; vertical-align: middle; margin-left: 7px;
    position: relative; padding: 2px 8px; white-space: nowrap; cursor: help;
    font-family: inherit; font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: -0.01em; color: #ddd6fe;
    background: rgba(167, 139, 250, 0.13); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(167, 139, 250, 0.4); border-radius: 999px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1); }
  .ba-exr-chip img { width: 15px !important; height: 15px !important; object-fit: contain !important; display: block; max-width: none !important; }
  /* 가이드 투어 예시 카드 — 실제 결과 행이 없을 때만 잠깐 놓는 모형.
     실제 결과로 오인하지 않도록 점선 테두리 + '예시' 배지를 달고, 클릭도 받지 않는다(pointer-events:none).
     진입은 opacity만 — transform으로 키우면 투어가 삽입 직후 동기로 재는 rect가 어긋나 스포트라이트가 밀린다. */
  .ba-demo-card { box-sizing: border-box; position: fixed; top: 50%; transform: translateY(-50%); z-index: 2147483500;
    width: 260px; padding: 12px 14px 14px; text-align: center; pointer-events: none;
    font-family: inherit; color: #ddd6fe; letter-spacing: -0.01em;
    background: rgba(14, 11, 26, 0.92); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
    border: 1.5px dashed rgba(167, 139, 250, 0.55); border-radius: 14px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
    opacity: 0; transition: opacity .16s cubic-bezier(0.23, 1, 0.32, 1); }
  .ba-demo-card.show { opacity: 1; }
  .ba-demo-badge { font-size: 10.5px; font-weight: 700; color: #a5f3fc; margin-bottom: 9px; }
  .ba-demo-name { font-size: 13px; font-weight: 800; color: #fde68a; }
  .ba-demo-price { display: flex; align-items: center; justify-content: center; gap: 2px;
    margin-top: 6px; font-size: 11.5px; font-weight: 600; color: #cbc5e8; }
  @media (prefers-reduced-motion: reduce) { .ba-demo-card { transition-duration: .001ms; } }
  .ba-exr-chip::after { content: attr(data-tip); position: absolute; right: 0; bottom: calc(100% + 7px);
    padding: 7px 10px; font-size: 11px; font-weight: 600; letter-spacing: -0.01em; color: #e6e0ff; white-space: nowrap;
    background: rgba(20, 17, 34, 0.97); border: 1px solid rgba(167, 139, 250, 0.5); border-radius: 9px;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5), 0 0 14px rgba(167, 139, 250, 0.2);
    opacity: 0; pointer-events: none; transform: translateY(3px); transition: opacity .15s, transform .15s; z-index: 60; }
  .ba-exr-chip:hover::after { opacity: 1; transform: translateY(0); }`
  document.head.appendChild(st)
}
// 페이지 표면 커스텀 툴팁 — data-tip의 《...》를 강조색(시안) span으로 치환(패널 .ba-tip과 동일 관례).
// 버튼 오른쪽에 배치(좁은 좌측 컬럼의 아이템 이미지를 안 가리도록) + 뷰포트 밖으로 안 나가게 클램프.
let pageTip = null
function ensurePageTip() {
  if (pageTip) return pageTip
  pageTip = document.createElement('div')
  pageTip.id = 'ba-page-tip'
  document.body.appendChild(pageTip)
  return pageTip
}
function bindPageTip(el) {
  el.addEventListener('mouseenter', () => {
    const raw = el.getAttribute('data-tip'); if (!raw) return
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const tip = ensurePageTip()
    tip.innerHTML = esc(raw).replace(/《([^》]*)》/g, '<span class="ba-tip-accent">$1</span>')
    tip.classList.add('show')
    const r = el.getBoundingClientRect()
    const left = Math.min(window.innerWidth - tip.offsetWidth - 8, r.right + 10)
    const top = Math.max(8, Math.min(window.innerHeight - tip.offsetHeight - 8, r.top + r.height / 2 - tip.offsetHeight / 2))
    tip.style.left = left + 'px'; tip.style.top = top + 'px'
  })
  el.addEventListener('mouseleave', () => { if (pageTip) pageTip.classList.remove('show') })
}
// 거래소 static API에서 화폐 정보 1회 로드 — 두 가지에 쓴다.
//  ① 기본 화폐(엑잘/카오스) 아이콘: 확장 내부 URL은 페이지 CSP·dynamic URL 제약으로 깨질 수 있어
//     GGG 공식 CDN 이미지(사이트 자체가 쓰는 것과 동일)를 쓴다.
//  ② 화폐 id → 한글명 맵: 경제 API의 items가 Metadata 경로를 키로 쓰므로, 한글명이 두 데이터를 잇는
//     유일한 공통 키다(lib/currencyRates.js indexItemsByName 참조). 이게 있어야 색채의 오브처럼
//     큐레이션 밖 화폐도 환산된다.
let curIcon = null // 기본 화폐(카오스/엑잘) CDN 이미지 URL — 로드 전엔 칩이 텍스트 단위로 폴백
let divIcon = null // 신성한 오브 CDN 이미지 URL — 역방향 환산 칩용
let curNames = null // { 화폐id: 한글명 } — 로드 전엔 큐레이션 4종만 환산
let curStaticTried = false
function ensureCurrencyStatic() {
  if (curStaticTried) return
  curStaticTried = true
  const path = game === 'poe2' ? 'trade2' : 'trade'
  fetch(`https://poe.kakaogames.com/api/${path}/data/static`) // 콘텐츠 스크립트 = 동일 출처
    .then((r) => r.json())
    .then((s) => {
      const cur = (s.result || []).find((g) => g.id === 'Currency')
      const entries = cur?.entries || []
      const names = {}
      for (const e of entries) if (e && e.id && typeof e.text === 'string' && e.text) names[e.id] = e.text
      if (Object.keys(names).length) curNames = names
      const entry = entries.find((e) => e.id === baseCurrencyOf(game))
      if (entry?.image) curIcon = 'https://web.poecdn.com' + entry.image
      const div = entries.find((e) => e.id === 'divine')
      if (div?.image) divIcon = 'https://web.poecdn.com' + div.image
      LOG('화폐 static —', Object.keys(names).length, '종, 아이콘', !!curIcon, '신성한', !!divIcon)
      injectPobButtons() // 도착 즉시 칩 패스(이름 맵이 생겨 새로 환산되는 행이 있다)
    })
    .catch((err) => LOG('화폐 static 로드 실패(큐레이션 4종만 환산)', String(err)))
}

// '제시 가격'(협상가)·'정가'(고정가) 라벨을 포함한 리프 요소의 부모(가격 블록) — 클래스명 추측 대신 텍스트 앵커
function findPriceHost(row) {
  for (const el of row.querySelectorAll('div,span,p,strong,em')) {
    if (el.childElementCount === 0 && /제시\s*가격|정가/.test(el.textContent)) return el.parentElement
  }
  return null
}
// 칩 종류 — 'base'는 다른 화폐 → 기본 화폐(카오스/엑잘), 'divine'은 기본 화폐 → 신성한 오브(역방향).
// 한 목록에 두 표기가 섞여도 어느 쪽이든 상대 축 값이 보이게 하는 게 목적이다.
const chipKindOf = (kind) => (kind === 'divine'
  ? { icon: divIcon, label: '신성한 오브', short: '신성한' }
  : { icon: curIcon, label: game === 'poe1' ? '카오스 오브' : '엑잘티드 오브', short: game === 'poe1' ? '카오스' : '엑잘' })

// 칩 내용 렌더 — 제시 가격 줄의 화폐 아이콘 크기를 실측해 칩 아이콘·글자를 그에 맞춘다(작아서 안 보이는 문제).
// 사이트 전역 img 규칙을 이기도록 인라인 !important. 아이콘 로드 전엔 텍스트 단위 폴백.
function renderChipContent(chip, host) {
  const { icon: curIconOf, label, short } = chipKindOf(chip.dataset.kind)
  const v = chip.dataset.v // fmtCurAmount 결과(숫자 문자열) — 안전
  if (!curIconOf) { chip.textContent = `≈ ${v} ${short}`; return }
  const priceImg = [...host.querySelectorAll('img')].find((im) => !im.closest('.ba-exr-chip') && im.getBoundingClientRect().height >= 14)
  const h = priceImg ? Math.min(40, Math.max(15, Math.round(priceImg.getBoundingClientRect().height))) : 15
  chip.innerHTML = `≈ ${v} <img src="${curIconOf}" alt="${label}">`
  const im = chip.querySelector('img')
  im.style.setProperty('width', h + 'px', 'important')
  im.style.setProperty('height', h + 'px', 'important')
  chip.style.fontSize = Math.max(11, Math.round(h * 0.42)) + 'px'
}
// 기본 화폐 가격에 신성한 오브 환산을 붙이는 최소 기준. 이보다 잘면(예: 20카오스 = 0.06신성한)
// "≈ 0.1 신성한"처럼 정보가 되지 않고 칩만 늘어난다 — 비교가 필요한 큰 가격에서만 붙인다.
const MIN_DIVINE_CHIP = 0.5

function injectExrChip(row, id) {
  if (!lastRates) return false
  const existing = row.querySelector('.ba-exr-chip')
  if (existing) {
    // 아이콘보다 칩이 먼저 주입돼 텍스트 폴백으로 굳는 문제 — 아이콘 도착 후 패스에서 업그레이드
    const { icon: ic } = chipKindOf(existing.dataset.kind)
    if (ic && !existing.querySelector('img') && existing.dataset.v && existing.parentElement) renderChipContent(existing, existing.parentElement)
    return false
  }
  const price = pobPrices.get(id)
  let v = baseFromPrice(price, lastRates, game, curNames)
  let kind = 'base'
  if (v == null) {
    // 이미 기본 화폐로 매겨진 가격 — 반대 방향으로 환산해, 신성한 오브로 표기된 매물과 같은 축에서 비교하게 한다.
    const d = divineFromPrice(price, lastRates, game)
    if (d != null && d >= MIN_DIVINE_CHIP) { v = d; kind = 'divine' }
  }
  if (v == null) return false
  const host = findPriceHost(row)
  if (!host) return false
  const chip = document.createElement('div')
  chip.className = 'ba-exr-chip'
  chip.dataset.v = fmtCurAmount(v)
  chip.dataset.kind = kind
  chip.setAttribute('data-tip', `${chipKindOf(kind).label} 환산 — 서미누기 환율 API 기준`) // 테마 툴팁(::after) — 네이티브 title 미사용
  host.appendChild(chip) // host에 먼저 붙여야 renderChipContent가 가격 아이콘 크기를 실측 가능
  renderChipContent(chip, host)
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
    // 네이티브 title 대신 커스텀 툴팁(#ba-page-tip) — "Discord로 제보"를 별도 줄+강조색으로 눈에 띄게
    btn.setAttribute('data-tip', '이 아이템을 영문 텍스트로 복사\nPoB(Path of Building)에 Ctrl+V\n\nShift+클릭 → 번역 안 되는 부분\n《Discord로 제보》')
    bindPageTip(btn)
    btn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation()
      if (ev.shiftKey) reportMissing(item, btn); else pobCopy(item, btn)
    })
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
  ensureCurrencyStatic() // 화폐 아이콘·한글명 맵을 첫 fetch 시점에 미리 로드(환율 도착 전에 준비)
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
      if (rr && rr.ok && rr.data && rr.data.exchange_rates) { lastRates = rr.data; injectPobButtons() } // 환율 도착 즉시 엑잘 칩 패스
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
      otherFilters: parsed.otherFilters, priceFilter: parsed.priceFilter, dedupeKey: key, query: pending.query || undefined,
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
      query: pending.query || undefined, // 리그 이관용 raw 조건 — 북마크로 저장·승격될 때 함께 넘어간다
    })
    // query 도입 전에 저장한 북마크는 조건이 없어 이관이 불가능하다 → 같은 조건을 다시 검색하는 이 순간 채워 넣는다.
    if (pending.query) await backfillQuery(key, game, pending.query)
    LOG('히스토리 저장됨:', rec && rec.id, parsed.title)
    document.dispatchEvent(new CustomEvent('ba:records-changed'))
  }
})

// ── 리그 이관 — 저장된 검색을 목표 리그에서 다시 열 수 있게 만든다 ──
// 1순위: 저장된 URL의 리그 세그먼트만 교체. 검색 해시는 조건만 담고 리그는 경로가 정하므로(사용자 확인,
//   2026-07-22) 그 해시가 서버에 살아 있으면 이걸로 끝난다 — 조건을 저장하지 않은 옛 북마크까지 복구된다.
// 2순위: 해시가 만료됐으면 저장된 조건(raw query)으로 새 검색을 생성(공식 엔드포인트 POST,
//   cross-site-receiver.js와 동일 방식). 필터 UI를 프로그래밍으로 채우지 않는 이유는 lib/tradeSearch.js 헤더 참조.
// 사용자 클릭 1회 = 요청 1~2회. 일괄 이관은 제공하지 않는다 — GGG rate limit(429)에 걸리면 거래소 검색 자체가 막힌다.
async function migrateSearch(rec, league) {
  const resultUrl = (id) => {
    const url = location.origin + searchResultPath(game, league, id)
    return isAllowedTradeUrl(url) ? url : null
  }
  // 1순위 — 기존 해시를 목표 리그에서 조회해 보고, 살아 있으면 그 URL로 간다(새 검색을 만들지 않는다)
  const hash = searchHashFromUrl(rec && rec.url, game)
  if (hash) {
    try {
      const res = await fetch(`${searchApiPath(game, league)}/${hash}`, { headers: { Accept: 'application/json' } })
      if (res.status === 429) return { ok: false, reason: 'rate' }
      if (res.ok) {
        const url = resultUrl(hash)
        if (url) { LOG('리그 이관 — 기존 해시 재사용', hash); return { ok: true, url, via: 'url' } }
      } else LOG('리그 이관 — 해시 만료 추정, 조건 재생성으로 폴백', res.status)
    } catch (err) { LOG('리그 이관 — 해시 조회 실패, 폴백', String(err)) }
  }
  // 2순위 — 저장된 조건으로 새 검색 생성
  const s = sanitizeQuery(rec && rec.query)
  if (!s.ok) { LOG('리그 이관 — 조건 없음/형식 불량', s.reason); return { ok: false, reason: hash ? 'expired' : s.reason } }
  let res
  try {
    res = await fetch(searchApiPath(game, league), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(s.query),
    })
  } catch (err) { LOG('리그 이관 네트워크 오류', String(err)); return { ok: false, reason: 'network' } }
  if (res.status === 429) return { ok: false, reason: 'rate' } // 거래소 요청 제한 — 잠시 후 재시도 안내
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' }
  if (!res.ok) { LOG('리그 이관 실패 HTTP', res.status); return { ok: false, reason: 'http' } }
  let data = null
  try { data = await res.json() } catch (_) {}
  const id = data && data.id
  if (!isSafeSearchId(id)) { LOG('리그 이관 — 응답 id 이상'); return { ok: false, reason: 'bad-id' } }
  const url = resultUrl(id)
  if (!url) { LOG('리그 이관 — 허용되지 않은 URL'); return { ok: false, reason: 'bad-url' } }
  return { ok: true, url, total: (data && data.total) ?? null, via: 'query' }
}

// ── 조건 묶음 얹기 — 저장된 조건 뭉치를 지금 검색에 더해 새 검색을 만든다 ──
// 지금 화면의 '실행되지 않은' 입력은 우리가 알 수 없다(page-bridge는 실행된 검색만 캡처).
// 그래서 마지막으로 실행된 검색을 바탕으로 얹고, 무엇에 얹었는지 결과와 함께 알려 되돌릴 수 있게 한다.
async function applyConditionSet(set) {
  const league = leagueFromUrl()
  const merged = mergeConditionSet(lastQuery, set)
  if (!merged) return { ok: false, reason: 'empty' }
  const s = sanitizeQuery(merged)
  if (!s.ok) { LOG('조건 묶음 — 형식 불량', s.reason); return { ok: false, reason: s.reason } }
  let res
  try {
    res = await fetch(searchApiPath(game, league), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(s.query),
    })
  } catch (err) { LOG('조건 묶음 네트워크 오류', String(err)); return { ok: false, reason: 'network' } }
  if (res.status === 429) return { ok: false, reason: 'rate' }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' }
  if (!res.ok) { LOG('조건 묶음 실패 HTTP', res.status); return { ok: false, reason: 'http' } }
  let data = null
  try { data = await res.json() } catch (_) {}
  const id = data && data.id
  if (!isSafeSearchId(id)) { LOG('조건 묶음 — 응답 id 이상'); return { ok: false, reason: 'bad-id' } }
  const url = location.origin + searchResultPath(game, league, id)
  if (!isAllowedTradeUrl(url)) { LOG('조건 묶음 — 허용되지 않은 URL'); return { ok: false, reason: 'bad-url' } }
  // 얹기 전 화면으로 돌아갈 수 있게 현재 URL을 함께 준다(사후 확인 → 되돌리기)
  return { ok: true, url, base: lastQuery ? location.href : null, merged: !!lastQuery }
}

// ── 가이드 투어용 예시 요소 ──
// PoB 버튼·환산 칩은 검색 결과 행에 주입되므로, 결과가 없는 화면(첫 방문·거래소 홈)에서 투어를 돌리면
// 그 스텝만 가리킬 대상이 없어 스포트라이트가 통째로 사라진다. 패널이 빈 화면에서 데모 데이터를 띄우는 것과
// 같은 방식으로(store.seedDemoData), 대상이 없을 때만 실제와 같은 클래스의 '예시' 요소를 페이지에 잠시 놓는다.
// 실제 클래스를 그대로 쓰므로 투어 셀렉터(.ba-pob-btn/.ba-exr-chip)를 바꿀 필요가 없다.
const TOUR_DEMO_ID = 'ba-tour-demo'
function showTourDemo(side) {
  if (document.getElementById(TOUR_DEMO_ID)) return
  pobEnsureStyle()
  const el = document.createElement('div')
  el.id = TOUR_DEMO_ID
  el.className = 'ba-demo-card'
  // 전부 정적 한국어 리터럴 — 사용자·외부 데이터 없음
  el.innerHTML = `
    <div class="ba-demo-badge">예시 · 검색 결과가 있을 때 이렇게 보여요</div>
    <div class="ba-demo-name">형상 없는 반지</div>
    <div class="ba-demo-price">제시 가격 12 <span class="ba-exr-chip">≈ 24 ${game === 'poe1' ? '카오스' : '엑잘'}</span></div>
    <div class="ba-pob-wrap"><button type="button" class="ba-pob-btn" tabindex="-1"><b>PoB</b><span>영문 복사</span></button></div>`
  document.body.appendChild(el)
  // 패널이 덮은 쪽을 피해 남은 영역 가운데에 놓는다(패널 = 폭 384 + 좌우 여백 14).
  const RESERVED = 412
  const w = el.offsetWidth || 260 // offsetWidth 읽기가 리플로우도 겸함 → 아래 .show 전환이 실제로 재생된다
  const freeStart = side === 'left' ? RESERVED : 0
  const freeEnd = side === 'left' ? window.innerWidth : window.innerWidth - RESERVED
  el.style.left = Math.max(16, Math.round((freeStart + freeEnd) / 2 - w / 2)) + 'px'
  el.classList.add('show')
}
function hideTourDemo() {
  const el = document.getElementById(TOUR_DEMO_ID)
  if (el) el.remove()
}

initFuzzyPrefix()
const panel = mountPanel({
  game,
  league: leagueFromUrl(),
  getLeagueMap: () => leagueMap,
  getCurrentSearch: () => (lastQuery ? { query: lastQuery, league: lastQueryLeague || leagueFromUrl() } : null),
  migrateSearch,
  applyConditionSet,
  getStatMap: () => statMap, // 조건 묶음 등록 시 스탯 id를 한글 표시명으로 바꾸는 데 쓴다
  tourDemo: { show: showTourDemo, hide: hideTourDemo },
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
