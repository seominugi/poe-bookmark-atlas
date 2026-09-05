// content-main.js (ISOLATED world)
// page-bridge가 가로챈 search·fetch 이벤트를 받아 기록을 만들고 저장한다.
import { parseSearchQuery, searchIdentity } from '../lib/searchParser.js'
import { buildStatMap, buildStatIdIndex } from '../lib/statMap.js'
import { buildFilterMap } from '../lib/filterMap.js'
import { buildLeagueMap } from '../lib/leagueMap.js'
import { enFetchPath, isSafeListingId, pickItem } from '../lib/enListing.js'
import { nextDelay } from '../lib/tradeRate.js'
import { buildItemMap } from '../lib/itemMap.js'
import { priceSnapshot } from '../lib/priceSnapshot.js'
import { topIcon } from '../lib/topIcon.js'
import { parseExaltedPerDivine, baseFromPrice, divineFromPrice, baseCurrencyOf, fmtCurAmount } from '../lib/currencyRates.js'
import { searchApiPath, searchResultPath, isSafeSearchId, sanitizeQuery, searchHashFromUrl, isAllowedTradeUrl } from '../lib/tradeSearch.js'
import { mergeConditionSet, SET_FAIL } from '../lib/conditionSet.js'
import { renderSetsBar } from '../lib/pageSets.js'
import { addHistory, markUsedByUrl, ensureSchema, backfillQuery, isWatched, addWatch, removeWatch, listWatched, listConditionSets, WATCH_CAP } from '../store/store.js'
import { mountPanel } from './panel/panel.js'
import { initFuzzyPrefix } from './fuzzyPrefix.js'
import { buildPobText } from '../lib/pobExport.js'
import { attachTierChips, rowStatText } from './tier-chip.js'
import { classFromQuery } from '../lib/itemClass.js'
import { normalizeTradeText } from '../lib/statTextNorm.js'

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

// 거래소 데이터는 **사용자가 보고 있는 호스트**에서 받아야 한다 — items 의 type 이 로컬라이즈된 이름이라
// 호스트를 고정하면 유형 이름이 통째로 어긋난다(lib/tradeSearch.js tradeApiOrigin 주석 참조).
const send = (m) => new Promise((res) => chrome.runtime.sendMessage({ origin: location.origin, ...m }, res))

// ── 확장 컨텍스트 무효화 대응 ──
// 확장을 리로드·업데이트하면 **이미 열려 있던 탭**의 콘텐츠 스크립트는 고아가 된다 —
// 이후 모든 chrome.* 호출이 "Extension context invalidated"로 던진다. 브라우저 동작상 정상이지만
// 잡지 않으면 uncaught (in promise)로 콘솔을 채우고(사용자 제보 2026-08-06), 정작 사용자는
// 패널이 왜 죽었는지 모른 채 남는다. 잡아서 **1회만** 안내하고 새로고침 경로를 준다.
const isCtxInvalidated = (e) => /context invalidated|Extension context/i.test(String((e && e.message) || e))
let ctxDeadNotified = false
function noteExtensionDead() {
  if (ctxDeadNotified) return
  ctxDeadNotified = true
  LOG('확장 컨텍스트 무효화 — 이 탭의 스크립트는 더 이상 동작하지 않는다(새로고침 필요)')
  try {
    if (document.getElementById('ba-ctx-dead')) return
    const box = document.createElement('div')
    box.id = 'ba-ctx-dead'
    box.style.cssText = 'position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);'
      + 'display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100vw - 32px));padding:11px 14px;'
      + 'border-radius:12px;background:#1a1430;color:#e6e3f5;border:1px solid #6d5bd0;'
      + 'box-shadow:0 10px 30px rgba(0,0,0,.45);font:13px/1.5 system-ui,-apple-system,sans-serif;word-break:keep-all'
    const t = document.createElement('span')
    t.textContent = '확장 프로그램이 업데이트돼서 이 탭의 북마크 패널이 멈췄어요. 새로고침하면 다시 쓸 수 있어요.'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = '새로고침'
    btn.style.cssText = 'flex:none;font:inherit;font-weight:700;padding:5px 11px;border-radius:8px;cursor:pointer;'
      + 'color:#ddd6fe;background:rgba(167,139,250,.18);border:1px solid rgba(167,139,250,.5)'
    btn.addEventListener('click', () => location.reload())
    box.append(t, btn)
    ;(document.body || document.documentElement).appendChild(box)
  } catch (_) {}
}
// 떠 있는 프라미스를 삼켜 콘솔을 더럽히지 않게 한다. 컨텍스트 무효화면 안내, 그 외는 로그만.
const guard = (p) => Promise.resolve(p).catch((err) => {
  if (isCtxInvalidated(err)) noteExtensionDead()
  else LOG('처리되지 않은 오류', String(err))
})
// 전역 안전망 — panel.js·renderList.js 의 async 클릭 리스너가 10곳 넘고 전부 chrome.storage 를 만진다.
// 각각을 감싸는 대신 여기서 한 번에 잡는다(앞으로 추가될 리스너까지 자동으로 덮인다).
// 컨텍스트 무효화만 삼키고 나머지는 그대로 흘려보낸다 — 진짜 버그를 숨기면 안 된다.
//
// ⚠ **이 리스너는 아직 실동작으로 검증되지 않았다**(2026-08-06). 재현하려면 거래소 탭을 살려둔 채
//   확장만 무효화해야 하는데(비활성화가 확실), 시도 3회 모두 탭이 새로 뜨면서 컨텍스트가 살아 있었다.
//   **신고된 오류 4건은 이 리스너가 아니라 위의 guard() 두 곳(ensureSchema·bridge 핸들러)에서 나온 것**이라
//   그쪽은 일반 Promise .catch 라 확실하다. 이 전역 net 은 "사용자가 무효화 이후 패널 버튼을 누른" 더 좁은
//   경우를 위한 보강이다. 만약 무효화 상황에서 renderList 클릭이 여전히 uncaught 로 샌다면,
//   이 net 대신 renderList.js 의 async 리스너 15곳을 직접 감싸는 방식으로 바꿔야 한다.
window.addEventListener('unhandledrejection', (ev) => {
  if (!isCtxInvalidated(ev && ev.reason)) return
  ev.preventDefault()
  noteExtensionDead()
})

// 데이터 스키마 버전 보장 — 향후 구조 변경 시 마이그레이션 진입점 (현재 v1: 버전 마킹만)
guard(ensureSchema()) // 확장 리로드 직후엔 여기서 바로 던진다 — 잡지 않으면 uncaught

// ── 거래소 데이터는 **콘텐츠 스크립트에서 직접** 받는다 (2026-08-16) ──────────
// 예전엔 서비스 워커가 대신 받았는데, 그러면 호스트마다 host_permissions 가 필요하다.
// 그래서 영문 거래소(pathofexile)는 사용자가 optional 권한을 켜야만 동작했고, 켜는 방법을
// 알 길이 없던 GGG 계정 사용자는 "패널이 안 뜬다"만 겪었다(제보 2026-08-16).
//
// 그런데 이 데이터(stats·filters·items·leagues·static)는 전부 **거래소 페이지와 같은 출처**다.
// 콘텐츠 스크립트에서 상대 경로로 부르면 권한이 아예 필요 없고, 어느 거래소에 있든 그 호스트의
// 데이터를 받는다 — 언어·항목이 자동으로 맞는다(items 의 type 은 로컬라이즈된 이름이라 이게 중요하다).
// 서비스 워커는 **진짜 cross-origin 인 환율(seominugi)만** 대행한다.
const tradeData = (name) => fetch(`/api/${game === 'poe2' ? 'trade2' : 'trade'}/data/${name}`, { credentials: 'same-origin' })
  .then((r) => { if (!r.ok) throw new Error(`${name} ${r.status}`); return r.json() })

// statMap은 검색 흐름과 독립적으로 1회 로드(레이스 방지)
let statMap = {}
let statMapLoading = null
function ensureStatMap() {
  if (Object.keys(statMap).length) return Promise.resolve()
  if (!statMapLoading) {
    statMapLoading = tradeData('stats')
      .then((d) => { statMap = buildStatMap(d); LOG('statMap', Object.keys(statMap).length, '항목') })
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
    filterMapLoading = tradeData('filters')
      .then((d) => { filterMap = buildFilterMap(d); LOG('filterMap', Object.keys(filterMap.label).length, '필터') })
      .catch((e) => LOG('filterMap 오류', String(e)))
  }
  return filterMapLoading
}
ensureFilterMap()

// 아이템 유형 이름 맵 — 용병 소환장처럼 type 이 내부 영문 id 인 계열의 표시 이름을 얻는다.
// 없으면 그 id 가 그대로 북마크 이름·조건 요약에 나온다(제보 2026-08-16 "NonEleBowRangerPhys").
let itemMap = {}
let itemMapLoading = null
function ensureItemMap() {
  if (Object.keys(itemMap).length) return Promise.resolve()
  if (!itemMapLoading) {
    itemMapLoading = tradeData('items')
      .then((d) => { itemMap = buildItemMap(d); LOG('itemMap', Object.keys(itemMap).length, '유형') })
      .catch((e) => LOG('itemMap 오류', String(e)))
  }
  return itemMapLoading
}
ensureItemMap()

// 리그명 맵도 1회 로드 — 리그 섹션 헤더에 한글 리그명(스탠다드 등) 표시. 로드되면 재렌더 트리거.
let leagueMap = {}
let leagueMapLoading = null
function ensureLeagueMap() {
  if (Object.keys(leagueMap).length) return Promise.resolve()
  if (!leagueMapLoading) {
    leagueMapLoading = tradeData('leagues')
      .then((d) => { leagueMap = buildLeagueMap(d); document.dispatchEvent(new CustomEvent('ba:records-changed')); LOG('leagueMap', Object.keys(leagueMap).length) })
      .catch((e) => LOG('leagueMap 오류', String(e)))
  }
  return leagueMapLoading
}
ensureLeagueMap()

let pending = null // { queryId, query, league, url, done }
let lastQuery = null // 최근 검색 raw query (한↔영 전환용)
let lastQueryLeague = null
const queryIdFromUrl = (url) => { const m = /[?&]query=([^&]+)/.exec(url); return m ? m[1] : null }
// ⚠ 리그가 키에 들어가야 한다. 조건이 같아도 리그가 다르면 **다른 검색**이다 —
// 하드코어 올플레임과 올플레임은 매물도 시세도 완전히 별개다(제보 2026-08-16:
// .../Hardcore%20Allflame/G6GzlQW8Ub 과 .../Allflame/G6GzlQW8Ub 이 한 북마크로 뭉개졌다).
// 리그는 query 안이 아니라 URL 경로에 있어서 searchIdentity 가 볼 수 없다.
const dedupeKey = (query, league) => game + '|' + (league || '') + '|' + searchIdentity(query)

// ── 영문 PoB 복사 + 엑잘 환산 — 결과 아이템·가격 보관 + 행마다 'PoB' 버튼·'≈ 엑잘' 칩 주입 ──
const pobItems = new Map() // result.id → item. 스크롤 페이지네이션 fetch 누적, 새 검색 시 초기화
const pobPrices = new Map() // result.id → listing.price({amount, currency}) — 엑잘 환산 칩용
const pobSellers = new Map() // result.id → listing.account.name — 찜한 매물 표시용
let lastRates = null // BE 원본 응답({exchange_rates, items}) — 검색마다 스냅샷 fetch에서 갱신. items엔 큐레이션 4종 밖 60여 화폐(쥬얼러·색채 등) 시세
let pobMaps = null // { baseMap } — 클릭 시 1회 lazy 로드. 번역 맵 3종은 2026-08-23 에 뺐다(아래 ensurePobMaps 주석)

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
// ⚠ **baseMap 만 싣는다** (2026-08-23). 예전엔 statMap·uniqueMap·uniqueModMap 까지 4종(약 2.5MB)을
// 불러 KR→EN 번역을 했는데, 영문 원본 경로가 정본이 된 뒤로 그 번역은 **쓰이면 틀리는** 비상구였다
// (제보 아이템 실물 검증: `Radius: 변수`·3줄 mod 첫 줄 유실·`+-16%` 부호 겹침 — PoB 가 못 읽는다).
// baseMap 만 남긴 이유: 영문 응답에 **Item Class 가 없고**, 폴백에서도 베이스 타입을 영문으로
// 줘야 PoB 가 아이템을 식별한다. 나머지 2.2MB 와 번역 코드는 2026-08-24 에 저장소에서 지웠다.
async function ensurePobMaps() {
  if (!pobMaps) {
    const b = await (game === 'poe1' ? import('../lib/pobBaseMap.poe1.json') : import('../lib/pobBaseMap.json'))
    pobMaps = { baseMap: b.default }
  }
  return pobMaps
}
// ── 영문 원본 우선 ───────────────────────────────────────────────────────
// 같은 매물 id 를 영문 거래소에서 받아오면 번역이 아예 필요 없다(lib/enListing.js 주석).
// 우리가 번역하는 한 오늘 고친 855개 값 오류 같은 부류가 계속 나온다 — 원본을 쓰는 게 근본이다.
// 실패(권한 없음·오프라인·매물 판매됨)하면 **조용히 기존 번역으로 떨어진다.**
let enLastAt = 0
/** @returns {{item: object|null, reason: string|null}} reason 은 폴백 사유(사용자 안내 판단용) */
async function fetchEnItem(id) {
  if (!isSafeListingId(id)) return { item: null, reason: 'bad-id' }
  // 거래소 rate limit(trade-fetch: 4초당 12회)을 넘지 않게 최소 간격을 둔다 — 연타 대비.
  const gap = nextDelay(enLastAt, Date.now())
  if (gap > 0) await new Promise((r) => setTimeout(r, gap))
  enLastAt = Date.now()
  try {
    // 영문 거래소를 보고 있으면 same-origin 이라 권한 없이 바로 받는다.
    if (location.hostname === 'www.pathofexile.com') {
      const r = await fetch(enFetchPath(game, id), { headers: { Accept: 'application/json' } })
      if (!r.ok) return { item: null, reason: 'http' }
      return { item: pickItem(await r.json()), reason: null }
    }
    const res = await send({ type: 'ba-fetch-en', game, id })
    if (!res || !res.ok) return { item: null, reason: (res && res.reason) || 'network' }
    return { item: pickItem(res.data), reason: null }
  } catch (_) { return { item: null, reason: 'network' } }
}

// 영문 거래소는 기본 권한(host_permissions)이라 보통 여기 오지 않는다. 오는 경우는 사용자가
// 크롬에서 이 확장의 사이트 접근을 직접 내렸을 때다. 그때 **조용히** 한글로 떨어지면
// 사용자는 왜 결과가 나빠졌는지 영영 모른다(제보 2026-08-18) — 한 번은 알려야 한다.
// ⚠ 매번 띄우지 않는다. PoB 복사는 반복 동작이라 클릭마다 토스트가 뜨면 잔소리가 된다.
// ⚠ 여기서 권한을 직접 요청할 수 없다 — chrome.permissions 는 콘텐츠 스크립트에 없고,
//   permissions.request 는 확장 페이지의 사용자 제스처에서만 통한다. 그래서 팝업으로 안내한다.
let enPermNoticed = false
function noticeEnPermission() {
  if (enPermNoticed) return
  enPermNoticed = true
  panel.toast('이 확장의 영문 거래소(pathofexile) 접근이 꺼져 있어요. 확장 아이콘 → "접근 다시 켜기"를 누르면 PoB 복사가 영문 원본 그대로 나갑니다. 지금은 한글 원문으로 복사했어요.')
}

async function pobCopy(item, btn, id) {
  try {
    const { item: enItem, reason } = await fetchEnItem(id)
    if (!enItem && reason === 'no-permission') noticeEnPermission()
    if (enItem) {
      // 영문 원본 — 번역이 없으니 미변환·의심 항목도 없다. Item Class 만 KR 아이템에서 구한다
      // (영문 JSON 에는 그 필드가 없다 — 2026-08-17 실측).
      const maps = await ensurePobMaps()
      const itemClass = (maps.baseMap[item.baseType] || [])[1] || null
      const { text } = buildPobText(enItem, {}, { en: true, itemClass })
      await pobCopyText(text)
      pobFlash(btn, '복사됨', '영문 원본 ✓')
      return
    }
    // ── 최소 폴백 — 영문 조회가 실패했을 때 ──────────────────────────────
    // **번역하지 않는다.** 번역 경로는 값을 맞히려다 PoB 가 못 읽는 텍스트를 만들었다
    // (제보 아이템 실물 검증 2026-08-23: `Radius: 변수`·3줄 mod 첫 줄 유실·`+-16%` 부호 겹침).
    // 틀린 영문보다 한글 원문이 정직하다 — 사용자가 "PoB 가 이상하다"가 아니라
    // "영문 조회가 안 됐구나"로 읽는다. 베이스 타입만 baseMap 으로 영문화해 PoB 가 아이템은 알아보게 한다.
    const maps = await ensurePobMaps()
    const { text } = buildPobText(item, maps.baseMap)
    await pobCopyText(text)
    pobFlash(btn, '복사됨', '한글 원문')
    LOG('PoB — 영문 조회 실패로 한글 원문 복사:', reason)
    // 조용히 떨어지면 사용자는 왜 한글인지 모른다. 권한 문제는 위에서 이미 안내했으므로 그 외만.
    if (reason !== 'no-permission') {
      panel.toast('영문 거래소에서 이 매물을 못 받아 한글 원문으로 복사했어요. 매물이 팔렸거나 연결이 끊긴 경우예요 — 잠시 뒤 다시 시도해 주세요.')
    }
  } catch (err) { LOG('PoB 복사 실패', String(err)); pobFlash(btn, '복사 실패', '다시 시도') }
}
// Shift+클릭 — PoB 결과가 이상할 때 제보(웹훅 없이: 클라이언트에 Discord 웹훅 시크릿을 두면 추출·악용 위험이 있어
// 제보 텍스트를 클립보드에 복사 + 기존 공개 초대 링크로 Discord를 열어 사용자가 직접 붙여넣게 한다).
//
// ⚠ 목적이 바뀌었다 (2026-08-23). 예전엔 '번역 미변환'을 모았는데, 번역을 걷어낸 지금은 모을 게 없다.
// 대신 **실제로 복사된 결과와 어느 경로였는지**를 담는다 — 영문 원본이 이상하다는 제보가 오면
// 그때 필요한 게 정확히 이것이다(어느 매물의 어떤 출력이었나).
const DISCORD_URL = 'https://discord.gg/kEm2G2qcZQ'
async function reportMissing(item, btn, id) {
  try {
    const maps = await ensurePobMaps()
    const { item: enItem, reason } = await fetchEnItem(id)
    const itemClass = (maps.baseMap[item.baseType] || [])[1] || null
    const { text } = enItem
      ? buildPobText(enItem, {}, { en: true, itemClass })
      : buildPobText(item, maps.baseMap)
    const report = [
      '[POE 북마크 아틀라스] PoB 복사 결과 제보',
      `게임: ${game} / 경로: ${enItem ? '영문 원본' : `한글 원문(영문 조회 실패: ${reason})`}`,
      `아이템: ${item.name || ''} ${item.baseType || ''}`.trim(),
      '무엇이 이상한지 한 줄로 적어 주세요: ',
      '────────',
      text,
    ].join('\n')
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
  /* PoB 버튼 + 찜(★)을 한 덩어리로 — 기존 배치 로직(3단 폴백)이 이 그룹 하나만 옮기면 되게 한다 */
  .ba-row-btns { display: inline-flex; align-items: center; gap: 6px; }
  .ba-watch-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; padding: 0; cursor: pointer; font-family: inherit; font-size: 14px; line-height: 1;
    color: #b9adf1; background: rgba(167, 139, 250, 0.10); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
    border: 1px solid rgba(167, 139, 250, 0.4); border-radius: 10px;
    transition: background .15s, color .15s, transform .16s cubic-bezier(0.23, 1, 0.32, 1); z-index: 5; }
  .ba-watch-btn:hover { background: rgba(167, 139, 250, 0.24); color: #fff; }
  .ba-watch-btn:active { transform: scale(0.95); } /* 작은 아이콘 버튼 = 0.95 (.ba-set-del과 같은 값) */
  /* 찜된 상태 — 앰버(패널의 즐겨찾기 색과 같은 언어) */
  .ba-watch-btn.on { color: #fbbf24; border-color: rgba(251, 191, 36, 0.55); background: rgba(251, 191, 36, 0.14); }
  .ba-watch-btn.on:hover { background: rgba(251, 191, 36, 0.26); }
  @media (prefers-reduced-motion: reduce) { .ba-watch-btn:active { transform: none; } }
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
  .ba-exr-chip:hover::after { opacity: 1; transform: translateY(0); }

  /* 거래소 화면에 얹는 '조건 묶음' 줄 — 능력치 필터 그룹 맨 위 */
  /* width: fit-content — 처음엔 필터 행과 같은 폭(740px)으로 늘렸는데 "벗어난 느낌"이라는 제보가 왔다.
     실측하니 칩이 448px 만 쓰고 **292px(39%)가 빈 꼬리**였다. 다른 필터 행은 테두리가 없어 폭이 안 보이는데
     우리만 상자라, 내용보다 큰 상자가 겉돌았다. 내용에 맞춰 감싸고 넘치면 max-width 에서 줄바꿈한다.
     높이도 41px → 37px 로 낮춰 행 리듬(30px)에 가깝게.
     좌우 들여쓰기(margin-left / max-width)는 pageSets.js 가 필터 행에서 재서 인라인으로 넣는다 —
     체크박스 열을 침범하지 않고 스탯 이름과 같은 선에 맞추기 위해서다. */
  .ba-page-sets { display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
    width: fit-content; max-width: 100%; margin: 0 0 6px; padding: 5px 8px;
    font-family: inherit; letter-spacing: -0.01em;
    background: rgba(167, 139, 250, 0.07); border: 1px solid rgba(167, 139, 250, 0.28); border-radius: 10px; }
  .ba-page-sets-lbl { display: inline-flex; align-items: center; gap: 4px; margin-right: 2px;
    font-size: 10.5px; font-weight: 700; color: #b9adf1; }
  .ba-page-set { box-sizing: border-box; display: inline-flex; align-items: center; max-width: 100%;
    padding: 4px 11px; font-family: inherit; font-size: 11.5px; font-weight: 600; line-height: 1.35;
    color: #ddd6fe; background: rgba(167, 139, 250, 0.13); border: 1px solid rgba(167, 139, 250, 0.4);
    border-radius: 999px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    transition: background .15s ease, border-color .15s ease, color .15s ease, transform .16s cubic-bezier(0.23, 1, 0.32, 1); }
  @media (hover: hover) and (pointer: fine) {
    .ba-page-set:hover { background: rgba(167, 139, 250, 0.26); border-color: rgba(167, 139, 250, 0.66); color: #fff; }
  }
  .ba-page-set:active { transform: scale(0.97); }
  .ba-page-set:focus-visible { outline: 2px solid #a78bfa; outline-offset: 1px; }
  .ba-page-set[disabled] { opacity: 0.55; cursor: default; }
  @media (prefers-reduced-motion: reduce) { .ba-page-set { transition-property: background, border-color, color; } .ba-page-set:active { transform: none; } }
  .ba-tier-chip, .ba-tier-ask {
    min-height: 28px; min-width: 34px; margin-left: 4px; padding: 3px 9px;
    border-radius: 8px; cursor: pointer; vertical-align: middle;
    border: 1px solid rgba(167, 139, 250, 0.45);
    background: rgba(43, 35, 64, 0.85); color: #ddd4f7;
    font: 600 12px/1.2 system-ui, -apple-system, sans-serif;
    transition: border-color .15s, background .15s; }
  .ba-tier-chip:hover, .ba-tier-ask:hover {
    border-color: rgba(167, 139, 250, 0.95); background: rgba(60, 48, 88, 0.95); }
  .ba-tier-chip:focus-visible, .ba-tier-ask:focus-visible {
    outline: 2px solid #a78bfa; outline-offset: 2px; }
  .ba-tier-ask { border-style: dashed; }`
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
  fetch(`/api/${path}/data/static`) // 콘텐츠 스크립트 = 동일 출처. 호스트 고정 금지(글로벌 거래소 지원)
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
      refreshTourDemoChip() // 투어 데모가 떠 있으면 텍스트 폴백 → 아이콘으로 바꿔 준다
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
// ── 찜(★) 버튼 — 결과 행에서 개별 매물을 담아 둔다 ──
// 매물 id는 거래소별(카카오/글로벌)로 공간이 달라 origin을 함께 저장한다. 안 그러면 나중에 재조회할 때
// 멀쩡한 매물이 null로 와서 "판매됨"으로 조용히 오판한다.
function makeWatchButton(id, item) {
  const star = document.createElement('button')
  star.type = 'button'
  star.className = 'ba-watch-btn'
  star.textContent = '★'
  const setState = (on) => {
    star.classList.toggle('on', on)
    star.setAttribute('data-tip', on
      ? '찜 해제\n패널의 《찜한 매물》에서 빼요'
      : '이 매물을 찜하기\n나중에 패널에서 《아직 있는지》 확인할 수 있어요')
  }
  setState(false)
  bindPageTip(star)
  isWatched(id, location.host).then(setState).catch(() => {})
  star.addEventListener('click', async (ev) => {
    ev.preventDefault(); ev.stopPropagation()
    try {
      if (await isWatched(id, location.host)) {
        const mine = (await listWatched(game)).find((w) => w.listingId === id && w.origin === location.host)
        if (mine) await removeWatch(mine.id)
        setState(false)
      } else {
        const r = await addWatch({
          listingId: id, origin: location.host, game, league: leagueFromUrl(),
          name: item.name || item.typeLine || '', baseType: item.baseType || item.typeLine || '',
          icon: item.icon || null, seller: pobSellers.get(id) || '', price: pobPrices.get(id) || null,
          sourceUrl: location.href, // 죽으면 이 검색을 다시 연다 — 아이템→조건 역추출을 만들지 않기 위함
        })
        if (r.ok) setState(true)
        else if (r.reason === 'cap') panel.toast(`찜은 최대 ${WATCH_CAP}개까지예요. 오래된 것을 지우고 다시 시도해 주세요.`)
        else setState(true) // dup — 이미 담겨 있음(상태만 맞춘다)
      }
      document.dispatchEvent(new CustomEvent('ba:records-changed'))
    } catch (e) { if (isCtxInvalidated(e)) noteExtensionDead(); else LOG('찜 토글 실패', String(e)) }
  })
  return star
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
    btn.setAttribute('data-tip', '이 아이템을 영문 텍스트로 복사\nPoB(Path of Building)에 Ctrl+V\n\nShift+클릭 → 결과가 이상할 때\n《Discord로 제보》')
    bindPageTip(btn)
    btn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation()
      if (ev.shiftKey) reportMissing(item, btn, id); else pobCopy(item, btn, id)
    })
    // 찜(★) — PoB 버튼과 한 그룹으로 묶어 아래 3단 배치 폴백이 그룹 하나만 옮기면 되게 한다
    const star = makeWatchButton(id, item)
    const group = document.createElement('div')
    group.className = 'ba-row-btns'
    group.append(star, btn) // ★ 를 PoB 앞에 — 사용자 요청(2026-08-06)
    // 1순위: 아이템 이미지 컬럼(.iconContainer) 맨 아래 — 자연 흐름이라 겹칠 일이 없고, 이미지 로딩
    // 타이밍과 무관하며, poe1 세로로 긴 무기 이미지에서 버튼이 늘어지는 문제(높이 매칭)도 없다.
    //
    // ⚠ 2026-08-25까지는 이 컬럼을 **상태 배지의 텍스트**(`/인증/`)로 찾았다. 그런데 그 배지
    //   (`.verifiedStatus`)는 매물 상태에 따라 **문구가 바뀐다** — '수요가 있는 아이템입니다'가 뜨는
    //   매물에서 앵커를 못 찾아 2순위(절대 위치)로 떨어졌고, 버튼이 아이템 스탯 **위에 겹쳐** 떴다
    //   (제보 2026-08-25 · 실제 거래소에서 그 문구로 바꿔 재현 확인).
    //   같은 이유로 영문 거래소('Verified')에서는 1순위가 **한 번도 잡힌 적이 없다.**
    //   컬럼을 클래스로 잡으면 문구·언어·인증 여부와 무관해진다.
    //
    // 실측 구조 (2026-08-25, 카카오 poe1·poe2 both · 각 10/10행):
    //   <div class="row" data-id=…>
    //     <div class="iconContainer">
    //       <div class="icon"><img …></div>
    //       <div class="verifiedStatus">인증 완료</div>   ← 문구가 바뀌는 자리
    //       <div class="ba-pob-wrap">…우리 버튼…</div>    ← 여기에 붙인다
    const rr = row.getBoundingClientRect()
    const iconCol = row.querySelector('.iconContainer')
    if (iconCol) {
      const wrap = document.createElement('div')
      wrap.className = 'ba-pob-wrap'
      wrap.appendChild(group)
      iconCol.appendChild(wrap)
    } else {
      // 2순위: 아이템 이미지 오른쪽(자연 높이) — 행 왼쪽 40% 안의 img 실측. 로딩 전(0폭)이면 다음 패스로.
      const leftImgs = [...row.querySelectorAll('img')].filter((im) => im.getBoundingClientRect().left - rr.left < rr.width * 0.4)
      const img = leftImgs.find((im) => im.getBoundingClientRect().width >= 40)
      if (!img && leftImgs.some((im) => !im.complete || im.getBoundingClientRect().width === 0)) continue
      if (img && rr.width) {
        // 인라인 지정 — 사이트의 인라인/고특이성 position에 안 지게(지면 버튼 기준이 뷰포트가 돼 엉뚱한 곳에 뜸)
        if (getComputedStyle(row).position === 'static') row.style.position = 'relative'
        const ir = img.getBoundingClientRect()
        group.style.position = 'absolute'; group.style.transform = 'translateY(-50%)'
        group.style.left = Math.round(ir.right - rr.left + 10) + 'px'
        group.style.top = Math.round(ir.top + ir.height / 2 - rr.top) + 'px'
        row.appendChild(group)
      } else { // 3순위: 우측 버튼 줄 아래(구조 변경 대비)
        const btnRow = row.querySelector('.btns')
        if (btnRow && btnRow.parentElement) {
          const wrap = document.createElement('div')
          wrap.style.cssText = 'text-align:right;margin-top:5px'
          wrap.appendChild(group)
          btnRow.parentElement.insertBefore(wrap, btnRow.nextSibling)
        } else { (row.querySelector('.details') || row).appendChild(group) }
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
  setTimeout(() => { pobKickPending = false; injectPobButtons(); renderPageSets(); renderTierChips() }, 100)
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
  pobTimers = [100, 400, 1000, 2500, 6000].map((ms) => setTimeout(() => { injectPobButtons(); renderPageSets(); renderTierChips() }, ms))
}

// ── 능력치 필터 티어 칩 ──
// 부위·아이템 레벨은 최근 검색 조건에서 읽는다. 한 번도 검색하지 않았으면 부위를 모르는 상태로
// 시작해 '부위?' 버튼이 뜬다. PoE1 은 티어 표가 아직 없으므로 건너뛴다.
let statIdIndex = null
let statIdIndexSize = -1
function ensureStatIdIndex() {
  const size = Object.keys(statMap).length
  if (statIdIndex && statIdIndexSize === size) return statIdIndex
  statIdIndex = buildStatIdIndex(statMap)
  statIdIndexSize = size
  return statIdIndex
}

// 부위 판정 — 유형 필터의 category 로 끝나면 베이스 이름표(260KB)를 아예 안 부른다.
// ⚠ pobBaseMap 을 정적 import 하면 안 된다: 2026-08-23 에 이 맵을 지연 로딩으로 돌린 결정이
// 무효가 되고, PoE1 페이지에서도 쓰지 않는 260KB 가 콘텐츠 스크립트에 실려 들어간다.
//
// 판정 자체는 classFromQuery 를 그대로 쓴다 — 여기서 다시 구현하면 그 함수의 테스트가
// 실제 배선 경로를 더 이상 지키지 못한다(변형 아이템의 {option} 형태 처리 등).
// classFromBaseName 이 baseMap === null 을 안전하게 다루므로, 이름표가 없으면 자연히 null 이 나온다.
let tierBaseMap = null
let tierBaseMapLoading = null
function tierItemClass(query) {
  const cls = classFromQuery(query, tierBaseMap)
  if (cls) return cls
  // 이름은 있는데 이름표가 아직 없다 → 그때 한 번 불러온다. 이번 회차는 부위 미상으로 두고
  // 다음 화면 감시에서 판정한다(statMap 을 기다리는 방식과 같다).
  // 실패하면 재시도하지 않는다 — 페이지를 새로 열면 복구된다. 매 회차 재시도는 낭비다.
  if (!tierBaseMap && !tierBaseMapLoading && query?.type) {
    tierBaseMapLoading = import('../lib/pobBaseMap.json')
      .then((m) => { tierBaseMap = m.default })
      .catch((err) => { LOG('베이스 이름표 로드 실패', String(err)) })
  }
  return null
}

// 티어 표(155KB)도 같은 이유로 지연 로딩한다 — PoE1 페이지에서는 한 번도 쓰지 않는다.
// 여기도 실패 시 재시도하지 않는다 — 페이지를 새로 열면 복구된다.
let tierTable = null
let tierTableLoading = null
function ensureTierTable() {
  if (tierTable) return tierTable
  if (!tierTableLoading) {
    tierTableLoading = import('../lib/statTiers.poe2.json')
      .then((m) => { tierTable = m.default })
      .catch((err) => { LOG('티어 표 로드 실패', String(err)) })
  }
  return null
}

let lastTierLog = ''
function renderTierChips() {
  if (game !== 'poe2') return
  if (!Object.keys(statMap).length) return // statMap 도착 전 — 다음 kick 에서 다시 시도한다
  const table = ensureTierTable()
  if (!table) return // 표 도착 전 — 다음 kick 에서 다시 시도한다
  try {
    const index = ensureStatIdIndex()
    const ilvl = lastQuery?.filters?.type_filters?.filters?.ilvl
    const seen = attachTierChips(document, {
      table,
      itemClass: tierItemClass(lastQuery),
      ilvlMax: ilvl?.max ?? null,
      statIdOf: (row) => {
        const text = rowStatText(row)
        return text ? index.get(normalizeTradeText(text)) || null : null
      },
      onAskClass: () => panel.toast('아이템 종류를 먼저 고르면 T1 수치를 넣어 드려요.'),
      onApply: (result) => {
        if (result === 'failed') panel.toast('거래소가 값을 받지 않았어요. 수치를 직접 넣어 주세요.')
      },
    })
    // 같은 상태를 반복해 찍지 않는다 — 화면 감시가 자주 돈다.
    const line = JSON.stringify(seen)
    if (seen.minInputs && line !== lastTierLog) { lastTierLog = line; LOG('티어 칩', seen) }
  } catch (err) { LOG('티어 칩 실패', String(err)) }
}

// ── 거래소 화면의 '조건 묶음' 칩 줄 ──
// 왜 페이지에도 두나 · 앵커가 깨졌을 때의 계약: src/lib/pageSets.js 상단 주석.
// 여기서는 데이터(묶음 목록)와 실행(applyConditionSet)만 잇는다.
let pageSetBusy = false
function renderPageSets() {
  // 페이지 표면 스타일은 PoB 버튼과 같은 <style> 하나를 공유한다. 결과가 없는 화면에서도
  // 조건 줄은 뜰 수 있으므로(필터만 펼친 상태) 여기서도 보장해둔다.
  pobEnsureStyle()
  listConditionSets(game)
    .then((sets) => renderSetsBar(document, sets.filter((s) => !s.__demo), runPageSet, bindPageTip))
    .catch((err) => { if (isCtxInvalidated(err)) noteExtensionDead(); else LOG('조건 묶음 줄 실패', String(err)) })
}
// 패널 칩과 같은 동작: 얹은 뒤 이동하고, 무엇에 얹었는지는 이동 후 패널이 토스트로 알린다.
// 연타는 막는다 — 요청이 몰리면 거래소 요청 제한(429)에 걸린다.
async function runPageSet(set, bar) {
  if (pageSetBusy) return
  pageSetBusy = true
  const btns = [...bar.querySelectorAll('.ba-page-set')]
  btns.forEach((b) => { b.disabled = true })
  try {
    const res = await applyConditionSet(set)
    if (!res || !res.ok) { panel.toast(SET_FAIL[res && res.reason] || '조건을 넣지 못했어요.'); return }
    try { await chrome.storage.local.set({ baSetApplied: { name: set.name, merged: res.merged, at: Date.now() } }) } catch (_) {}
    location.href = res.url
  } finally {
    pageSetBusy = false
    btns.forEach((b) => { b.disabled = false })
  }
}

// 검색이 실행된 **그 순간** 히스토리에 남긴다.
//
// 왜: 결과가 0건이면 거래소가 /api/trade/fetch 를 호출하지 않아 아래 fetch 분기가 영영 안 돈다.
// 그러면 그 검색은 히스토리에 없는데, 저장 버튼(panel.js doSave)은 **'히스토리 맨 위'** 를 집는다
// (`listByKind('history', game)[0]`). 결과가 이렇게 된다 — 사용자 제보 2026-08-13:
//   ① 매물 0건 검색을 처음 하면 → 히스토리가 비어 "먼저 거래소에서 검색을 실행하세요"
//   ② 그 뒤 다른 검색을 하고 저장하면 → **직전 검색이 대신 저장된다**
//   ③ 그렇게 저장된 북마크 둘이 실제로 같은 조건이 되어 "같은 조건으로 인식"처럼 보인다
// 시세·아이콘은 결과가 있어야 나오므로 fetch 가 오면 그때 얹는다. addHistory 는 dedupeKey 로
// **병합**하므로(있으면 {...기존, ...새것} 후 맨 위로) 두 번 불러도 항목이 늘지 않는다.
// 여기서는 icon·snapshot 키를 **아예 넣지 않는다** — undefined 로 넣으면 나중에 온 값이 아니라
// 먼저 있던 값을 덮어버릴 수 있다.
async function recordSearch() {
  if (!pending) return
  // query 를 못 얻었으면 기록하지 않는다 — dedupeKey 가 "t:|n:" 로 뭉개져
  // 서로 다른 검색이 한 항목으로 합쳐진다(위 pending 주석 참조). 안 남기는 편이 낫다.
  if (!pending.query) { LOG('검색 조건을 못 읽어 히스토리 선기록 생략'); return }
  await Promise.all([ensureStatMap(), ensureFilterMap(), ensureItemMap()])
  const parsed = parseSearchQuery(pending.query, statMap, filterMap, itemMap)
  const key = dedupeKey(pending.query, pending.league)
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
    dedupeKey: key,
    query: pending.query || undefined,
  })
  LOG('히스토리 선기록(검색 시점):', rec && rec.id, parsed.title)
  document.dispatchEvent(new CustomEvent('ba:records-changed'))
}

// 리스너를 async 로 두면 내부에서 던진 순간 unhandled rejection 이 된다(확장 리로드 시 addHistory·
// markUsedByUrl 이 chrome.storage 로 던진다). 본문을 함수로 빼고 guard 로 감싼다.
window.addEventListener('message', (e) => guard(handleBridgeMessage(e)))
async function handleBridgeMessage(e) {
  if (e.origin !== location.origin) return
  const d = e.data
  if (!d || d.__baSource !== 'ba-bridge') return
  LOG('bridge msg:', d.kind)

  if (d.kind === 'fetch') { // 히스토리 저장(아래 pending 가드)과 별개로, 모든 fetch(스크롤 포함)에서 아이템·가격 보관
    for (const r of (d.data && d.data.result) || []) {
      if (!r || !r.id) continue
      if (r.item) pobItems.set(r.id, r.item)
      if (r.listing && r.listing.price) pobPrices.set(r.id, r.listing.price)
      if (r.listing && r.listing.account) pobSellers.set(r.id, r.listing.account.name || '') // 찜한 매물 카드에 판매자 표시
    }
    schedulePobInject()
  }

  if (d.kind === 'search') {
    pobItems.clear(); pobPrices.clear(); pobSellers.clear() // 새 검색 — 이전 결과 폐기
    // pending을 동기적으로 먼저 설정 (await 전에) — fetch 메시지 레이스 방지
    // query 출처가 둘이다. 거래소에서 직접 검색하면 POST 본문(d.query)에 있지만,
    // **링크로 열면 앱이 GET /api/trade/search/<hash> 를 호출해 본문이 없다** → d.query 가 undefined.
    // 그러면 dedupeKey(undefined) 가 searchIdentity({}) = "t:|n:" 로 계산돼
    // **링크로 연 모든 검색이 같은 키가 되고 addHistory 가 한 항목으로 병합한다**
    // (서로 다른 두 링크가 "같은 조건"으로 보이던 원인 — 사용자 제보 2026-08-13).
    // 다행히 GET 응답 본문에 query 가 그대로 들어 있다({id, query}) → 그걸 폴백으로 쓴다.
    pending = { queryId: (d.data && d.data.id) || null, query: d.query || (d.data && d.data.query) || null, league: leagueFromUrl(), url: location.href, done: false }
    lastQuery = d.query; lastQueryLeague = pending.league // 전환 버튼용 최근 query 보관
    LOG('pending 설정:', { queryId: pending.queryId, league: pending.league })
    await recordSearch() // 결과가 0건이어도 이 검색이 히스토리에 남게 한다(저장 버튼이 집는 대상)
    return
  }

  if (d.kind === 'fetch' && pending && !pending.done) {
    const qid = queryIdFromUrl(d.url)
    if (pending.queryId && qid && qid !== pending.queryId) { LOG('fetch qid 불일치, 스킵', qid, pending.queryId); return }
    pending.done = true
    await Promise.all([ensureStatMap(), ensureFilterMap(), ensureItemMap()])

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

    const parsed = parseSearchQuery(pending.query, statMap, filterMap, itemMap)
    const key = dedupeKey(pending.query, pending.league)
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
}

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
  ensureCurrencyStatic() // 아직 안 받았으면 지금 받는다 — 도착하면 refreshTourDemoChip 이 아이콘으로 바꾼다
  // 문구는 정적 한국어 리터럴. 화폐 칩만 실제 칩과 같은 자산(GGG CDN 이미지)을 쓴다 — demoChipHtml 참조.
  el.innerHTML = `
    <div class="ba-demo-badge">예시 · 검색 결과가 있을 때 이렇게 보여요</div>
    <div class="ba-demo-name">형상 없는 반지</div>
    <div class="ba-demo-price">제시 가격 12 <span class="ba-exr-chip">${demoChipHtml()}</span></div>
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
/**
 * 투어 데모의 환산 칩 내용 — **실제 칩과 같은 자산**을 쓴다(chipKindOf).
 * 예전엔 '≈ 24 카오스' 텍스트를 하드코딩했는데, 그건 실제 칩의 **폴백 모습**이라
 * 투어가 사용자가 진짜로 보게 될 화면과 다른 것을 가르치고 있었다(제보 2026-08-18).
 * 아이콘이 아직 없으면 같은 폴백(텍스트)으로 두고, 도착하면 refreshTourDemoChip 이 바꾼다.
 */
function demoChipHtml() {
  const { icon: curIconOf, label, short } = chipKindOf('base')
  return curIconOf ? `≈ 24 <img src="${curIconOf}" alt="${label}">` : `≈ 24 ${short}`
}
function refreshTourDemoChip() {
  const demo = document.getElementById(TOUR_DEMO_ID)
  const chip = demo && demo.querySelector('.ba-exr-chip')
  if (chip) chip.innerHTML = demoChipHtml()
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

// ── 북마크를 '라이브로 열기' — 거래소의 네이티브 라이브 검색을 대신 켜 준다 ──
// 우리는 WebSocket 을 직접 열지 않는다. 거래소 화면엔 원래 '라이브 검색 활성화' 버튼이 있고,
// 인증·재연결·GGG 동시 연결 정책이 전부 거기 붙어 있다 — 우리가 다시 만들면 그걸 전부 떠안는다.
// 북마크에서 여기까지는 지금 3단계다(열기 → 로딩 대기 → 버튼 찾아 클릭). 그 세 번을 한 번으로 줄인다.
//
// 표식은 URL 해시로 싣는다(#ba-live). storage 를 쓰면 어느 탭이 자기 것인지 가리는 장치(만료·소비·
// 탭 추적)가 줄줄이 필요한데, 해시는 그 탭에만 있으므로 그 문제가 아예 생기지 않는다.
// 해시는 서버로 가지 않고 거래소 SPA 는 경로 기반이라 라우팅도 건드리지 않는다.
const LIVE_HASH = 'ba-live'
const LIVE_BTN = 'button.livesearch-btn'
const LIVE_OFF_LABEL = '라이브 검색 활성화' // 꺼져 있을 때의 라벨. 켜지면 Vue 가 이 문구를 바꾼다.
function autoStartLive() {
  if (!location.hash.includes(LIVE_HASH)) return
  // 표식은 **즉시** 지운다 — 남겨두면 새로고침·뒤로가기마다 다시 켜진다.
  try { history.replaceState(null, '', location.pathname + location.search) } catch (_) {}
  const started = Date.now()
  const tick = () => {
    if (Date.now() - started > 20000) { // 20초면 검색이 뜨고도 남는다. 못 찾으면 조용히 넘기지 않는다.
      panel.toast('라이브 검색 버튼을 찾지 못했어요. 거래소 화면에서 직접 켜 주세요.')
      return
    }
    const btn = document.querySelector(LIVE_BTN)
    // 버튼만 있고 검색이 아직 안 돌았으면 눌러도 무효다 — 결과 행이 하나라도 그려진 뒤에 누른다.
    const ready = btn && !btn.disabled && document.querySelector('.row[data-id]')
    if (!ready) { setTimeout(tick, 300); return }
    const label = (btn.textContent || '').trim()
    if (!label.includes(LIVE_OFF_LABEL)) { LOG('라이브 이미 켜져 있음 — 누르지 않는다'); return } // 누르면 꺼진다
    btn.click()
    // 눌렀다고 켜진 건 아니다. 라벨이 바뀌었는지로 확인하고, 안 바뀌었으면 사용자에게 알린다.
    setTimeout(() => {
      const now = (document.querySelector(LIVE_BTN)?.textContent || '').trim()
      if (now.includes(LIVE_OFF_LABEL)) panel.toast('라이브 검색을 켜지 못했어요. 거래소 화면에서 직접 켜 주세요.')
      else panel.toast('라이브 검색을 켰어요. 새 매물이 올라오면 이 탭에 바로 나타납니다.')
    }, 600)
  }
  tick()
}
try { autoStartLive() } catch (err) { LOG('라이브 자동 켜기 실패', String(err)) }

// 조건 묶음 줄은 검색 결과가 없어도(필터만 펼친 상태) 필요하다. 그래서 PoB 버튼처럼 첫 fetch 를
// 기다리지 않고 진입 직후부터 붙이고, 필터 UI 가 늦게 그려지는 경우는 body 감시가 따라잡는다.
try { pobEnsureObserver() } catch (err) { LOG('PoB 옵저버 실패', String(err)) }
;[200, 800, 2000].forEach((ms) => setTimeout(renderPageSets, ms))
// 패널에서 묶음을 만들거나 지우면 화면의 칩 줄도 바로 따라간다.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.conditionSets) renderPageSets()
  })
} catch (err) { LOG('storage 변경 구독 실패', String(err)) }

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
