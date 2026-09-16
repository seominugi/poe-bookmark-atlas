// 검색·매물이 고유 아이템인지 비고유 아이템인지 — 북마크·히스토리·찜 카드의 이름 칩 테두리 색으로 보여 준다(사용자 요청 2026-09-16).
// 모르면 null 이다. 틀린 색보다 색이 없는 편이 낫다.

const UNIQUE_OPTIONS = new Set(['unique', 'uniquefoil'])
const NONUNIQUE_OPTIONS = new Set(['nonunique', 'normal', 'magic', 'rare'])

/**
 * 저장된 검색 조건의 희귀도.
 * - 희귀도 필터가 고유(또는 고유 포일)면 'unique', 모든 비고유·일반·마법·희귀면 'nonunique'
 * - 희귀도 필터가 없어도 이름(query.name)을 지정했으면 고유 아이템 검색이다 — 거래소에서 이름은 고유 아이템에만 있다
 * @param {any} saved 저장된 조건. 검색 바디({query}) 또는 query 자체 둘 다 받는다
 * @returns {'unique'|'nonunique'|null}
 */
export function rarityOfQuery(saved) {
  const q = saved && typeof saved === 'object' ? (saved.query && typeof saved.query === 'object' ? saved.query : saved) : null
  if (!q) return null
  const option = q.filters?.type_filters?.filters?.rarity?.option
  if (typeof option === 'string') {
    if (UNIQUE_OPTIONS.has(option)) return 'unique'
    if (NONUNIQUE_OPTIONS.has(option)) return 'nonunique'
  }
  const name = typeof q.name === 'string' ? q.name : q.name?.option
  if (typeof name === 'string' && name.trim()) return 'unique'
  return null
}

/**
 * 거래소 매물 아이템의 희귀도 — `item.rarity`(Unique · Rare · Magic · Normal).
 * @returns {'unique'|'nonunique'|null}
 */
export function rarityOfItem(item) {
  const r = typeof item?.rarity === 'string' ? item.rarity.toLowerCase() : ''
  if (!r) return null
  return r === 'unique' ? 'unique' : 'nonunique'
}
