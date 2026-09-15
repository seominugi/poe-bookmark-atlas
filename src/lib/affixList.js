// src/lib/affixList.js
// 속성 목록 — 지금 아이템 유형에 붙을 수 있는 접두어·접미어. DOM 을 모르고 네트워크를 타지 않는다.
//
// 목록은 **티어 표에 실린 능력치만** 담는다. 표에 없는 것(거래소 문구와 못 이은 것 · 표시 배율이 없는 것)은
// 넣어도 칩이 안 뜨고, 일부는 거래소에 필터 자체가 없다. 없는 걸 흐리게 늘어놓기보다 뺀다.

const own = (obj, key) => (obj && Object.hasOwn(obj, key) ? obj[key] : null)

/**
 * @param {object} args
 * @param {Record<string, Record<string, Array<{t:number,l:number}>>>} args.table statTiers.<game>.json
 * @param {Record<string, {p:string[], s:string[]}>} args.affixes statAffixes.<game>.json
 * @param {string|null} args.itemClass modifiers 파일명
 * @param {Record<string,string>} args.statMap 거래소 stat id → 문구 (화면에 보이는 이름)
 * @param {number|null} [args.ilvlMax] 아이템 레벨 상한
 * @param {Iterable<string>} [args.existingIds] 넣을 그룹에 이미 있는 stat id
 * @returns {{status:'ok'|'no-class', prefix:AffixItem[], suffix:AffixItem[]}}
 *
 * @typedef {{id:string, text:string, tiers:number, topLevel:number, have:boolean}} AffixItem
 *   `tiers` — 아이템 레벨 상한 안에서 닿는 티어 수(상한이 없으면 전체). 0 이면 이 상한으로는 안 붙는다.
 *   `topLevel` — 닿는 티어 중 가장 높은 것의 필요 아이템 레벨(닿는 게 없으면 T1 의 필요 레벨).
 */
export function affixListFor({ table, affixes, itemClass, statMap, ilvlMax = null, existingIds = [] }) {
  const byStat = itemClass ? own(table, itemClass) : null
  const lists = itemClass ? own(affixes, itemClass) : null
  if (!byStat || !lists) return { status: 'no-class', prefix: [], suffix: [] }
  const have = new Set(existingIds)
  const build = (ids) => {
    const out = []
    for (const id of ids ?? []) {
      const rows = own(byStat, id)
      const text = own(statMap, id)
      if (!Array.isArray(rows) || !rows.length || typeof text !== 'string') continue
      const reach = ilvlMax == null ? rows : rows.filter((r) => r.l <= ilvlMax)
      out.push({ id, text, tiers: reach.length, topLevel: (reach[0] ?? rows[0]).l, have: have.has(id) })
    }
    return out
  }
  return { status: 'ok', prefix: build(lists.p), suffix: build(lists.s) }
}

/**
 * 검색어로 거른다. 공백을 무시하고 부분 일치 — 거래소 드롭다운 검색과 같은 감각이다.
 * @param {AffixItem[]} items
 * @param {string} term
 */
export function filterAffixes(items, term) {
  const key = String(term ?? '').replace(/\s+/g, '').toLowerCase()
  if (!key) return items
  return items.filter((it) => it.text.replace(/\s+/g, '').toLowerCase().includes(key))
}
