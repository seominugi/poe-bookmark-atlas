// 스탯 그룹 타입 → 한글 라벨 (POE2 거래소 능력치 필터 그룹)
const GROUP_LABEL = { and: '및', not: '제외', count: '숫자', weight: '가중 합계', weight2: '가중치 합계', if: '조건' }

/**
 * @param {any} payload 캡처한 검색 요청 바디
 * @param {Record<string,string>} statMap stat id → 텍스트
 */
export function parseSearchQuery(payload, statMap = {}) {
  const q = payload?.query ?? {}
  const name = q.name || null
  const itemType = q.type || null
  const title = name || itemType || '검색'

  // stats: 전체 평탄화(개수·요약·구 레코드 호환) / statGroups: 그룹 타입별 구조(툴팁 상세)
  const stats = []
  const statGroups = []
  for (const group of q.stats ?? []) {
    const filters = []
    for (const f of group.filters ?? []) {
      if (!f?.id) continue
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

  return { title, itemType, name, stats, statGroups, priceFilter, sortIsPriceAsc }
}
