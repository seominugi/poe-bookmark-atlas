// src/lib/liveTypeFilters.js
// 화면에서 읽은 유형 필터로 검색 조건을 덮는다. DOM 을 모른다(읽기는 src/content/typeFilterDom.js).
//
// 왜 필요한가: 티어 칩은 부위·아이템 레벨을 `lastQuery`(마지막으로 **보낸** 검색 본문)에서 읽었다.
// 그래서 화면에서 유형을 바꿔도 검색을 한 번 누르기 전까지 칩이 옛 부위를 가리켰다 —
// 칩은 검색 **전에** 값을 채우는 기능이라 순서가 뒤집혀 있었다(제보 2026-09-13).

/**
 * 거래소 옵션의 표시 텍스트 → 옵션 id. 화면에 보이는 글자로 id 를 되찾는 데 쓴다.
 * 실측(poe2 `data/filters`, 2026-09-13): 유형 옵션 64개의 표시 텍스트 **중복 0** — 1:1 이라 되찾을 수 있다.
 * `buildFilterMap` 은 id 를 문자열로 저장하므로 '모두'(null)가 문자열 'null' 로 들어 있다. 진짜 null 로 되돌린다.
 * @param {{options?:Record<string,Record<string,string>>}|null} filterMap
 * @param {string} filterId 예: 'category'
 * @returns {Map<string, string|null>}
 */
export function optionIdByText(filterMap, filterId) {
  const out = new Map()
  const opts = filterMap?.options?.[filterId]
  if (!opts) return out
  for (const [id, text] of Object.entries(opts)) out.set(text, id === 'null' ? null : id)
  return out
}

/**
 * @typedef {{status:'ok', id:string|null} | {status:'none'|'ambiguous'}} LiveCategory
 * @typedef {{status:'ok', value:number|null} | {status:'none'|'ambiguous'}} LiveIlvlMax
 */

/**
 * 화면에서 **확정한** 값만 검색 조건에 덮어쓴 새 객체를 돌려준다.
 * 확정 못 한 값(none·ambiguous)은 손대지 않는다 — 그러면 종전 동작(마지막 검색 조건)과 똑같다.
 * 화면 읽기가 실패해도 지금보다 나빠지지 않게 하는 장치가 이것이다.
 *
 * 원본을 바꾸지 않는다 — 같은 `lastQuery` 를 검색 조건 툴팁·북마크 저장이 함께 쓴다.
 * 검색창의 베이스 이름(`type`)은 읽지 않으므로 그대로 둔다.
 * @param {object|null} query
 * @param {{category?:LiveCategory, ilvlMax?:LiveIlvlMax}} live
 * @returns {object|null}
 */
export function applyLiveTypeFilters(query, live) {
  const cat = live?.category
  const ilvl = live?.ilvlMax
  if (cat?.status !== 'ok' && ilvl?.status !== 'ok') return query

  const next = query ? structuredClone(query) : {}
  next.filters ??= {}
  next.filters.type_filters ??= {}
  const tf = (next.filters.type_filters.filters ??= {})

  if (cat?.status === 'ok') {
    if (cat.id == null) delete tf.category
    else tf.category = { option: cat.id }
  }
  if (ilvl?.status === 'ok') {
    if (ilvl.value == null) { if (tf.ilvl) delete tf.ilvl.max }
    else tf.ilvl = { ...(tf.ilvl ?? {}), max: ilvl.value }
  }
  return next
}
