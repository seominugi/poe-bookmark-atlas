import { parseQueryFilters } from './filterMap.js'

// 스탯 그룹 타입 → 한글 라벨 (POE2 거래소 능력치 필터 그룹)
const GROUP_LABEL = { and: '및', not: '제외', count: '숫자', weight: '가중 합계', weight2: '가중치 합계', if: '조건' }

// 능력치 필터 입력값 → 표시 토큰. min만 'N+', 범위 'a~b', max만 '≤b', 없으면 ''.
function fmtStatValue(v) {
  if (!v) return ''
  const { min, max } = v
  if (min != null && max != null) return `${min}~${max}`
  if (min != null) return `≥${min}`
  if (max != null) return `≤${max}`
  return ''
}

// 능력치 텍스트(#포함)에 입력 수치 결합. '#'를 값으로 치환, 없으면 뒤에 덧붙임. 구 레코드(문자열 filters)는 그대로.
export function formatStatText(f) {
  if (!f) return ''
  if (typeof f === 'string') return f
  const { text, value } = f
  if (!value) return text || ''
  return String(text).includes('#') ? String(text).replace('#', value) : `${text} ${value}`
}

/**
 * @param {any} payload 캡처한 검색 요청 바디
 * @param {Record<string,string>} statMap stat id → 텍스트
 */
export function parseSearchQuery(payload, statMap = {}, filterMeta = { label: {}, options: {} }) {
  const q = payload?.query ?? {}
  const name = q.name || null
  // 유형: q.type(베이스 타입) 우선, 없으면 type_filters.category 옵션의 한글 라벨
  const catOpt = q.filters?.type_filters?.filters?.category?.option
  const itemType = q.type || (catOpt != null ? ((filterMeta.options?.category || {})[String(catOpt)] || String(catOpt)) : null)
  const title = name || itemType || '검색'

  // stats: 전체 평탄화(개수·요약·구 레코드 호환) / statGroups: 그룹 타입별 구조(툴팁 상세)
  const stats = []
  const statGroups = []
  for (const group of q.stats ?? []) {
    const filters = []
    for (const f of group.filters ?? []) {
      if (!f?.id || f.disabled) continue // disabled = 거래소에서 비활성화한 능력치(검색 미적용)
      const text = statMap[f.id] || f.id.replace(/^explicit\./, '')
      filters.push({ text, value: fmtStatValue(f.value) })
      stats.push(text) // 평탄 stats는 값 없이 — 구조 동일성·검색·개수용
    }
    if (!filters.length) continue
    const type = group.type || 'and'
    let label = GROUP_LABEL[type] || type
    const gmin = group.value?.min
    if ((type === 'count' || type === 'weight' || type === 'weight2') && gmin != null) label += ` ≥${gmin}`
    statGroups.push({ type, label, filters })
  }

  const priceRaw = q.filters?.trade_filters?.filters?.price
  const priceFilter = priceRaw
    ? { min: priceRaw.min ?? null, max: priceRaw.max ?? null, currency: priceRaw.option ?? null }
    : null

  const sortIsPriceAsc = payload?.sort?.price === 'asc'
  const otherFilters = parseQueryFilters(q, filterMeta) // 입력된 모든 필터(유형·희귀도·레벨·가격 등) 한글 라벨:값

  return { title, itemType, name, stats, statGroups, priceFilter, otherFilters, sortIsPriceAsc }
}

// 검색 조건이 아닌 거래 메타(상태·정렬·계정) + 별도 처리하는 가격은 동일성 키에서 제외.
// (filterMap.js의 SKIP과 같은 메타 목록 + price — price는 searchIdentity의 p: 파트에서 따로 반영)
const IDENTITY_SKIP = new Set(['status', 'collapse', 'indexed', 'sale_type', 'account', 'fee', 'price'])

// q.filters의 비-능력치 필터(유형·희귀도·레벨·경로석 확률·효율·등급·타락 등)를 값까지 정규화.
// 값(option / min~max)이 다르면 다른 검색 → 중복 저장 오판 방지. 그룹·키 순서에 무관하게 정렬.
function filterParts(query) {
  const groups = query?.filters
  if (!groups || typeof groups !== 'object') return []
  const out = []
  for (const group of Object.values(groups)) {
    if (group?.disabled) continue // 비활성 필터 그룹은 검색 미적용 → 동일성에서 제외
    const filters = group?.filters
    if (!filters || typeof filters !== 'object') continue
    for (const [fid, fval] of Object.entries(filters)) {
      if (IDENTITY_SKIP.has(fid) || !fval || typeof fval !== 'object') continue
      const segs = []
      if ('option' in fval && fval.option != null) segs.push(`o:${fval.option}`)
      if (fval.min != null || fval.max != null) segs.push(`r:${fval.min ?? ''}~${fval.max ?? ''}`)
      if (segs.length) out.push(`${fid}=${segs.join('/')}`)
    }
  }
  out.sort()
  return out
}

/**
 * 검색 "조건 동일성" 키 — 구조(키 순서·필터 순서)에 무관하게 같은 조건이면 같은 문자열.
 * 히스토리 중복 제거(같은 조건 재검색 시 최신으로 갱신)용. 능력치·가격뿐 아니라
 * 비-능력치 필터(유형·등급·경로석 확률·타락 등) 값까지 반영해 값이 다르면 다른 검색으로 구분.
 * @param {any} payload 검색 요청 바디
 */
export function searchIdentity(payload) {
  const q = payload?.query ?? {}
  const parts = [`t:${q.type || ''}`, `n:${q.name || ''}`]
  const p = q.filters?.trade_filters?.filters?.price
  if (p && (p.min != null || p.max != null)) parts.push(`p:${p.min ?? ''}/${p.max ?? ''}/${p.option ?? ''}`)
  const groups = []
  for (const g of q.stats ?? []) {
    const fs = (g.filters ?? [])
      .filter((f) => f?.id)
      .map((f) => `${f.id}=${f.value?.min ?? ''}~${f.value?.max ?? ''}`)
      .sort()
    if (fs.length) groups.push(`${g.type || 'and'}[${fs.join(',')}]`)
  }
  groups.sort()
  return [...parts, ...filterParts(q), ...groups].join('|')
}

/**
 * "구조 동일성" 키 — 값(min/max/option)을 제외하고 유형·아이템식별·능력치 종류·필터 종류만.
 * "수치만 다른" 검색을 같은 구조로 묶어(중복 저장 대신 덮어쓰기/새로 만들기 선택 유도) 판정한다.
 * searchIdentity(값 포함, exact)와 달리 저장된 레코드 필드에서 계산 → 기존 북마크에도 즉시 적용.
 * 아이템 식별은 title(= 유니크명 ‖ 유형)로 한다 — rec.name은 북마크 저장 시 사용자 표시명으로
 * 덮여 히스토리(아이템명)와 어긋나므로 구조 비교에 부적합. title은 히스토리·북마크 모두 보존된다.
 * @param {any} rec 검색 레코드(히스토리·북마크) — itemType·title·stats·otherFilters 사용
 */
export function structuralIdentity(rec) {
  const type = (rec && (rec.itemType || rec.type)) || ''
  const title = (rec && rec.title) || ''
  const stats = [...((rec && rec.stats) || [])].sort()
  const fkeys = (Array.isArray(rec && rec.otherFilters) ? rec.otherFilters.map((f) => f && f.key).filter(Boolean) : []).sort()
  return `t:${type}|n:${title}|S:${stats.join(',')}|F:${fkeys.join(',')}`
}

/**
 * latest(저장하려는 검색)와 구조는 같고 수치만 다른 기존 북마크를 찾는다(exact = 같은 dedupeKey는 제외).
 * 여러 개면 가장 최근 사용·갱신한 것을 반환. 없으면 null.
 * @param {any} latest 저장 대상 레코드
 * @param {any[]} bookmarks 북마크 목록
 */
export function findNearDuplicate(latest, bookmarks) {
  if (!latest || !Array.isArray(bookmarks)) return null
  const sid = structuralIdentity(latest)
  return (
    bookmarks
      .filter((b) => b && b.kind === 'bookmark' && b.dedupeKey !== latest.dedupeKey && structuralIdentity(b) === sid)
      .sort((a, b) => (b.lastUsedAt || b.updatedAt || 0) - (a.lastUsedAt || a.updatedAt || 0))[0] || null
  )
}
