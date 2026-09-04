// src/lib/statTiers.js
// 티어 표 조회. DOM 을 모르고 네트워크를 타지 않는다.
//
// 왜 실패를 한 종류로 뭉치지 않나: 부르는 쪽이 다르게 대응해야 한다.
//   no-class  → 부위를 물어본다
//   no-stat   → 아무것도 안 띄운다 (그 부위에 없는 옵션)
//   multi-slot→ 아무것도 안 띄운다 (거래소가 무엇으로 거르는지 미확인 — 설계 문서 §7 ②)
//   none      → 아이템 레벨 상한이 너무 낮다고 알린다

export const CHIP_COUNT = 3

/**
 * @param {object} args
 * @param {Record<string, Record<string, Array<{t:number,l:number,v:number[][]}>>>} args.table statTiers.<game>.json
 * @param {string|null} args.itemClass modifiers 파일명 (예: 'Ring')
 * @param {string} args.statId 거래소 stat id
 * @param {number|null} [args.ilvlMax] 거래소 유형 필터의 아이템 레벨 상한
 * @returns {{status:'ok'|'no-class'|'no-stat'|'multi-slot'|'none', tiers:Array<{t:number,l:number,min:number,max:number}>}}
 */
export function tiersFor({ table, itemClass, statId, ilvlMax = null }) {
  const empty = (status) => ({ status, tiers: [] })
  if (!itemClass || !table || !table[itemClass]) return empty('no-class')
  const rows = table[itemClass][statId]
  if (!rows || !rows.length) return empty('no-stat')
  if (rows.some((r) => (r.v ?? []).length !== 1)) return empty('multi-slot')

  const reachable = ilvlMax == null ? rows : rows.filter((r) => r.l <= ilvlMax)
  if (!reachable.length) return empty('none')

  return {
    status: 'ok',
    tiers: reachable.slice(0, CHIP_COUNT).map((r) => ({ t: r.t, l: r.l, min: r.v[0][0], max: r.v[0][1] })),
  }
}
