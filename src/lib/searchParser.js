import { parseQueryFilters } from './filterMap.js'

// 스탯 그룹 타입 → 한글 라벨 (POE2 거래소 능력치 필터 그룹)
const GROUP_LABEL = { and: '및', not: '제외', count: '숫자', weight: '가중 합계', weight2: '가중치 합계', if: '조건' }

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
      filters.push(text)
      stats.push(text)
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

/**
 * 검색 "조건 동일성" 키 — 구조(키 순서·필터 순서)에 무관하게 같은 조건이면 같은 문자열.
 * 히스토리 중복 제거(같은 조건 재검색 시 최신으로 갱신)용. 값(min/max)까지 반영.
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
  return [...parts, ...groups].join('|')
}
