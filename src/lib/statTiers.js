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
 * 표는 JSON 에서 온 평범한 객체라 `obj[key]` 가 프로토타입 속성까지 집는다.
 * `표['constructor']` 는 함수를 돌려주고, 그걸 배열로 다루면 그 자리에서 터진다.
 * (`src/lib/itemClass.js` 가 같은 이유로 같은 모양의 헬퍼를 쓴다 — 세 번째 소비처가 생기면 공용화한다)
 */
function own(obj, key) {
  return obj && Object.hasOwn(obj, key) ? obj[key] : null
}

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
  const byStat = itemClass ? own(table, itemClass) : null
  if (!byStat) return empty('no-class')
  const rows = own(byStat, statId)
  if (!Array.isArray(rows) || !rows.length) return empty('no-stat')
  if (rows.some((r) => (r.v ?? []).length !== 1)) return empty('multi-slot')

  const reachable = ilvlMax == null ? rows : rows.filter((r) => r.l <= ilvlMax)
  if (!reachable.length) return empty('none')

  return {
    status: 'ok',
    tiers: reachable.slice(0, CHIP_COUNT).map((r) => ({ t: r.t, l: r.l, min: r.v[0][0], max: r.v[0][1] })),
  }
}
