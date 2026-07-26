// src/lib/conditionSet.js
// 조건 묶음 — 자주 쓰는 검색 조건 뭉치를 저장해두고, 현재 검색에 통째로 얹는다.
//
// 왜 "조건 1개씩"이 아니라 묶음인가:
//   거래소에서 조건 하나를 넣으려면 드롭다운 열기 → 스탯명 타이핑 → 목록에서 선택 → 수치 입력이라,
//   조건 수만큼 반복된다(조건 7개면 상호작용 30회 이상). 우리는 검색 바디를 직접 만들어 POST할 수
//   있으므로(lib/tradeSearch.js) 묶음을 통째로 얹어 클릭 1회로 끝낼 수 있다. 필터 UI를 조작하는
//   방식으로는 "조건 1개 추가"가 상한이다.
//
// 북마크와의 경계:
//   북마크 = 완성된 검색을 그대로 다시 열기. 묶음 = 다른 검색 위에 얹는 부품.
//   그래서 묶음은 가격 같은 상황 의존 필터를 담지 않는다(예산은 매번 다르다).

/**
 * 저장된 레코드(북마크·히스토리)의 raw query에서 조건 묶음을 뽑는다.
 * 검색에 실제로 적용되던 것만 담는다 — 비활성(disabled) 조건·그룹은 제외.
 * @param {any} rec query를 가진 레코드
 * @param {Record<string,string>} statMap stat id → 한글 텍스트(표시용). 없으면 id를 그대로 쓴다.
 * @returns {{stats: Array<{id:string,text:string,value?:{min?:number,max?:number}}>, itemType: string|null}|null}
 */
export function extractConditionSet(rec, statMap = {}) {
  const q = rec && rec.query && rec.query.query
  if (!q || typeof q !== 'object' || Array.isArray(q)) return null
  const stats = []
  for (const group of q.stats ?? []) {
    if (!group || group.disabled) continue
    for (const f of group.filters ?? []) {
      if (!f || !f.id || f.disabled) continue
      const entry = { id: f.id, text: statMap[f.id] || f.id }
      const v = {}
      if (f.value && f.value.min != null) v.min = f.value.min
      if (f.value && f.value.max != null) v.max = f.value.max
      if (Object.keys(v).length) entry.value = v
      stats.push(entry)
    }
  }
  const itemType = typeof q.type === 'string' && q.type ? q.type : null
  if (!stats.length && !itemType) return null
  return { stats, itemType }
}

// 현재 검색이 없을 때 쓸 최소 골격. status online은 거래소 기본값과 같다.
const emptyBody = () => ({ query: { status: { option: 'online' }, stats: [{ type: 'and', filters: [] }] } })

/**
 * 현재 검색 바디에 조건 묶음을 얹는다.
 * - 관계없는 설정(가격·정렬·상태 등)은 그대로 둔다 — 얹기지 덮어쓰기가 아니다.
 * - 같은 조건이 이미 있으면 묶음 값으로 갱신한다(중복 행 방지).
 * - 활성 'and' 그룹에만 얹는다. 개수·가중치 그룹은 의미가 달라 건드리지 않는다.
 * - base는 변형하지 않는다(되돌리기·취소 대비).
 * @param {any} base 현재 검색 바디({query,sort}) 또는 null
 * @param {any} set 조건 묶음
 * @returns {any|null} 새 검색 바디
 */
export function mergeConditionSet(base, set) {
  const stats = (set && Array.isArray(set.stats) ? set.stats : []).filter((s) => s && s.id)
  if (!set || (!stats.length && !set.itemType)) return null
  const src = base && typeof base === 'object' && base.query && typeof base.query === 'object' ? base : null
  const body = src ? JSON.parse(JSON.stringify(src)) : emptyBody()
  const q = body.query
  if (set.itemType) q.type = set.itemType
  if (!Array.isArray(q.stats)) q.stats = []
  let group = q.stats.find((g) => g && !g.disabled && (g.type || 'and') === 'and')
  if (!group) { group = { type: 'and', filters: [] }; q.stats.push(group) }
  if (!Array.isArray(group.filters)) group.filters = []
  for (const s of stats) {
    const entry = { id: s.id }
    if (s.value && (s.value.min != null || s.value.max != null)) entry.value = { ...s.value }
    const idx = group.filters.findIndex((f) => f && f.id === s.id)
    if (idx >= 0) group.filters[idx] = entry
    else group.filters.push(entry)
  }
  return body
}

/** 칩 아래·툴팁에 쓸 한 줄 요약 — "목걸이 · 조건 2개" */
export function conditionSetSummary(set) {
  if (!set) return ''
  const n = Array.isArray(set.stats) ? set.stats.length : 0
  const parts = []
  if (set.itemType) parts.push(set.itemType)
  if (n) parts.push(`조건 ${n}개`)
  return parts.join(' · ')
}
