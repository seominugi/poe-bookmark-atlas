// src/lib/statTiers.js
// 티어 표 조회. DOM 을 모르고 네트워크를 타지 않는다.
//
// 왜 실패를 한 종류로 뭉치지 않나: 부르는 쪽이 다르게 대응해야 한다.
//   no-class  → 부위를 물어본다
//   no-stat   → 아무것도 안 띄운다 (그 부위에 없는 옵션)
//   multi-slot→ 아무것도 안 띄운다 (슬롯이 셋 이상 — 표에 아직 없고 거래소 동작도 모른다)
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
 * @returns {{status:'ok'|'no-class'|'no-stat'|'multi-slot'|'none', fill:'min'|'max',
 *            tiers:Array<{t:number,l:number,min:number,max:number,range:string}>}}
 *   `fill` 은 **어느 입력칸에 값을 넣어야 하는가**다. 아래 주석 참조.
 *   `min`·`max` 는 **거래소 입력칸에 들어갈 값**이고, `range` 는 사람이 읽을 원래 범위다.
 */
export function tiersFor({ table, itemClass, statId, ilvlMax = null }) {
  const empty = (status) => ({ status, fill: 'min', tiers: [] })
  const byStat = itemClass ? own(table, itemClass) : null
  if (!byStat) return empty('no-class')
  const rows = own(byStat, statId)
  if (!Array.isArray(rows) || !rows.length) return empty('no-stat')
  if (rows.some((r) => ![1, 2].includes((r.v ?? []).length))) return empty('multi-slot')

  const reachable = ilvlMax == null ? rows : rows.filter((r) => r.l <= ilvlMax)
  if (!reachable.length) return empty('none')

  return {
    status: 'ok',
    fill: fillSideOf(rows),
    tiers: reachable.slice(0, CHIP_COUNT).map((r) => ({ t: r.t, l: r.l, ...filterBounds(r.v) })),
  }
}

/**
 * 슬롯이 둘인 능력치(`공격 시 화염 피해 #~# 추가`)는 거래소가 **두 값의 평균**으로 거른다.
 * 2026-09-15 거래소 API 실측(장갑 · `explicit.stat_1573130764`):
 *   최소 30        → `24~36`(평균 30, 앞 값 24 < 30)이 걸린다 — 앞 값으로 거르지 않는다
 *   최대 10        → `8~10`(평균 9)이 걸린다                   — 뒤 값으로 거르지 않는다
 *   최소·최대 30   → `24~36` 만 나온다                          — 평균이다
 *
 * 그래서 티어의 입력값은 **가장 낮게 굴린 평균 ~ 가장 높게 굴린 평균**이다.
 * T1 `[[25,29],[37,45]]` → (25+37)/2=31 ~ (29+45)/2=37.
 * 평균이 .5 로 떨어지면 최소는 내리고 최대는 올린다 — 그 티어에서 가장 낮게 굴린 아이템도 걸려야 한다.
 * @param {number[][]} v
 * @returns {{min:number,max:number,range:string}}
 */
function filterBounds(v) {
  if (v.length === 1) return { min: v[0][0], max: v[0][1], range: `${v[0][0]}~${v[0][1]}` }
  const [[loA, hiA], [loB, hiB]] = v
  return {
    min: Math.floor((loA + loB) / 2),
    max: Math.ceil((hiA + hiB) / 2),
    range: `(${loA}~${hiA})~(${loB}~${hiB}) 평균`,
  }
}

/**
 * 값이 전부 음수인 능력치는 거래소에서 **작을수록 좋다** — 최대칸에 넣어야 한다.
 * 최소칸에 -25 를 넣으면 "-25 이상"이라 더 나쁜 아이템도, 부호가 뒤집힌 아이템도 다 걸린다.
 *
 * 부호는 값 안에 이미 있으므로 표 스키마에 표식을 더하지 않는다.
 * `reachable` 이 아니라 **모든 티어**를 본다 — 아이템 레벨 상한을 움직였다고 넣는 칸이
 * 바뀌면 사용자가 같은 칩에서 다른 동작을 보게 된다.
 *
 * 부호가 섞이면(`[-5,3]`) 작을수록 좋다고 단정할 수 없으므로 기존 동작(최소칸)을 지킨다.
 * @param {Array<{v:number[][]}>} rows
 * @returns {'min'|'max'}
 */
function fillSideOf(rows) {
  const allNegative = rows.every((r) => r.v.length > 0 && r.v.every((slot) => slot.length > 0 && slot.every((n) => n < 0)))
  return allNegative ? 'max' : 'min'
}
