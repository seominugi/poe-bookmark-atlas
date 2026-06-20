/**
 * @param {any} payload 캡처한 검색 요청 바디
 * @param {Record<string,string>} statMap stat id → 텍스트
 */
export function parseSearchQuery(payload, statMap = {}) {
  const q = payload?.query ?? {}
  const name = q.name || null
  const itemType = q.type || null
  const title = name || itemType || '검색'

  const stats = []
  for (const group of q.stats ?? []) {
    for (const f of group.filters ?? []) {
      if (!f?.id) continue
      stats.push(statMap[f.id] || f.id.replace(/^explicit\./, ''))
    }
  }

  const priceRaw = q.filters?.trade_filters?.filters?.price
  const priceFilter = priceRaw
    ? { min: priceRaw.min ?? null, max: priceRaw.max ?? null, currency: priceRaw.option ?? null }
    : null

  const sortIsPriceAsc = payload?.sort?.price === 'asc'

  return { title, itemType, name, stats, priceFilter, sortIsPriceAsc }
}
