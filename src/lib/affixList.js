// src/lib/affixList.js
// 속성 목록 — 지금 아이템 유형에 붙을 수 있는 접두어·접미어. DOM 을 모르고 네트워크를 타지 않는다.
//
// 목록은 **티어 표에 실린 능력치만** 담는다. 표에 없는 것(거래소 문구와 못 이은 것 · 표시 배율이 없는 것)은
// 넣어도 칩이 안 뜨고, 일부는 거래소에 필터 자체가 없다. 없는 걸 흐리게 늘어놓기보다 뺀다.

import { tiersFor, filterBounds } from './statTiers.js'

const own = (obj, key) => (obj && Object.hasOwn(obj, key) ? obj[key] : null)

/**
 * @param {object} args
 * @param {Record<string, Record<string, Array<{t:number,l:number,v:number[][]}>>>} args.table statTiers.<game>.json
 * @param {Record<string, {p:string[], s:string[], c?:Record<string,string>}>} args.affixes statAffixes.<game>.json (c = id → 종류 키)
 * @param {string|null} args.itemClass modifiers 파일명
 * @param {Record<string,string>} args.statMap 거래소 stat id → 문구 (화면에 보이는 이름)
 * @param {number|null} [args.ilvlMax] 아이템 레벨 상한
 * @param {Iterable<string>} [args.existingIds] 넣을 그룹에 이미 있는 stat id
 * @returns {{status:'ok'|'no-class', prefix:AffixItem[], suffix:AffixItem[], corrupted:AffixItem[]}}
 *
 * @typedef {{t:number,l:number,min:number,max:number,range:string}} AffixChoice
 * @typedef {{id:string, text:string, source:'prefix'|'suffix'|'corrupted', category:string, tiers:number, topLevel:number, have:boolean,
 *            single:boolean, fill:'min'|'max', choices:AffixChoice[]}} AffixItem
 *   `tiers` — 아이템 레벨 상한 안에서 닿는 티어 수(상한이 없으면 전체). 0 이면 이 상한으로는 안 붙는다.
 *   `topLevel` — 닿는 티어 중 가장 높은 것의 필요 아이템 레벨(닿는 게 없으면 T1 의 필요 레벨).
 *   `single` — 티어가 하나뿐인 능력치(주얼 등). 값이 정해진 범위 하나라 고를 티어가 없다.
 *   `choices` — 칩과 같은 상위 티어 값(statTiers.tiersFor). 넣을 값은 `affixFilterValue` 가 정한다.
 */
export function affixListFor({ table, affixes, itemClass, statMap, ilvlMax = null, existingIds = [] }) {
  const byStat = itemClass ? own(table, itemClass) : null
  const lists = itemClass ? own(affixes, itemClass) : null
  if (!byStat || !lists) return { status: 'no-class', prefix: [], suffix: [], corrupted: [] }
  const have = new Set(existingIds)
  const build = (ids, source) => {
    const out = []
    for (const id of ids ?? []) {
      const rows = own(byStat, id)
      const text = own(statMap, id)
      if (!Array.isArray(rows) || !rows.length || typeof text !== 'string') continue
      const reach = ilvlMax == null ? rows : rows.filter((r) => r.l <= ilvlMax)
      const tiers = tiersFor({ table, itemClass, statId: id, ilvlMax })
      out.push({
        id, text, source,
        category: own(lists.c, id) ?? 'other',
        tiers: reach.length,
        topLevel: (reach[0] ?? rows[0]).l,
        have: have.has(id),
        single: rows.length === 1,
        fill: tiers.fill,
        choices: tiers.status === 'ok' ? tiers.tiers : [],
      })
    }
    return out
  }
  // 타락 속성 — 거래소 인챈트 id. 티어가 없고 값 범위 하나라 늘 single 이다(최소·최대를 함께 넣는다).
  const corrupted = []
  for (const [id, entry] of Object.entries(lists.x ?? {})) {
    const text = own(statMap, id)
    if (typeof text !== 'string' || !Array.isArray(entry?.v) || !entry.v.length) continue
    const bounds = filterBounds(entry.v)
    const negative = entry.v.every((slot) => slot.every((n) => n < 0))
    corrupted.push({
      id, text, source: 'corrupted', category: entry.c ?? 'other',
      tiers: 1, topLevel: 1, have: have.has(id), single: true,
      fill: negative ? 'max' : 'min',
      choices: [{ t: 1, l: 1, ...bounds }],
    })
  }
  return { status: 'ok', prefix: build(lists.p, 'prefix'), suffix: build(lists.s, 'suffix'), corrupted }
}

/**
 * 고른 것 → 거래소 필터 값. 없으면 null(빈칸으로 넣는다).
 *
 * - 티어가 하나뿐인 능력치: **최소·최대 모두** 그 범위로 채운다(사용자 요청 2026-09-15). 더 좋은 티어가 없으니
 *   최대를 채워도 빠지는 아이템이 없고, 사용자는 그 속성이 어느 범위까지 굴러가는지 칸에서 바로 본다.
 * - 티어가 여럿인 능력치: 칩과 같다 — **넣는 칸 하나만**(보통 최소, 음수 능력치는 최대). 최대까지 채우면
 *   고른 티어보다 좋은 티어가 검색에서 빠진다.
 * @param {AffixItem} item
 * @param {number} choiceIndex item.choices 의 인덱스. 음수면 빈칸.
 * @returns {{min?:number, max?:number}|null}
 */
export function affixFilterValue(item, choiceIndex) {
  const choice = choiceIndex >= 0 ? item?.choices?.[choiceIndex] : null
  if (!choice) return null
  if (item.single) return { min: choice.min, max: choice.max }
  return { [item.fill]: choice[item.fill] }
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
