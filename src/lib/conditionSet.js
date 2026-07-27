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

// 조건 하나(스탯 id + 값)를 저장용 형태로. weight 그룹은 value.weight 를 쓰므로 함께 보존한다.
function toEntry(f, statMap) {
  const entry = { id: f.id, text: statMap[f.id] || f.id }
  const v = {}
  if (f.value && f.value.min != null) v.min = f.value.min
  if (f.value && f.value.max != null) v.max = f.value.max
  if (f.value && f.value.weight != null) v.weight = f.value.weight
  if (Object.keys(v).length) entry.value = v
  return entry
}

/**
 * 저장된 레코드(북마크·히스토리)의 raw query에서 조건 묶음을 뽑는다.
 * 검색에 실제로 적용되던 것만 담는다 — 비활성(disabled) 조건·그룹은 제외.
 *
 * ⚠ 능력치 '그룹'을 반드시 보존한다. 그룹 타입은 검색 의미 그 자체다 —
 *   count(숫자 N) 그룹은 "이 중 N개만 만족하면 됨"이라, 평탄화해 and 로 합치면
 *   전부 만족해야 하는 완전히 다른(훨씬 좁은) 검색이 된다(사용자 제보로 발견).
 *   stats(평탄)는 칩 개수 표시·구 버전 호환을 위해 함께 둔다.
 * @param {any} rec query를 가진 레코드
 * @param {Record<string,string>} statMap stat id → 한글 텍스트(표시용). 없으면 id를 그대로 쓴다.
 * @returns {{stats: Array<object>, groups: Array<object>, itemType: string|null}|null}
 */
export function extractConditionSet(rec, statMap = {}) {
  const q = rec && rec.query && rec.query.query
  if (!q || typeof q !== 'object' || Array.isArray(q)) return null
  const stats = []
  const groups = []
  for (const group of q.stats ?? []) {
    if (!group || group.disabled) continue
    const filters = []
    for (const f of group.filters ?? []) {
      if (!f || !f.id || f.disabled) continue
      const entry = toEntry(f, statMap)
      filters.push(entry)
      stats.push(entry)
    }
    if (!filters.length) continue
    const g = { type: group.type || 'and', filters }
    const gv = {}
    if (group.value && group.value.min != null) gv.min = group.value.min
    if (group.value && group.value.max != null) gv.max = group.value.max
    if (Object.keys(gv).length) g.value = gv
    groups.push(g)
  }
  const itemType = typeof q.type === 'string' && q.type ? q.type : null
  if (!stats.length && !itemType) return null
  return { stats, groups, itemType }
}

// 저장된 묶음 → 얹을 그룹 목록. groups가 있으면 그것이 정본이고,
// 없으면(그룹 보존 이전에 만든 묶음) 평탄 stats를 and 그룹 하나로 취급한다.
function groupsOf(set) {
  if (set && Array.isArray(set.groups) && set.groups.length) {
    return set.groups.filter((g) => g && Array.isArray(g.filters) && g.filters.some((f) => f && f.id))
  }
  const stats = (set && Array.isArray(set.stats) ? set.stats : []).filter((s) => s && s.id)
  return stats.length ? [{ type: 'and', filters: stats }] : []
}

// 그룹 동일성 키 — 타입·그룹 값·조건(순서 무관)이 모두 같으면 같은 그룹으로 본다.
function groupKey(g) {
  const type = (g && g.type) || 'and'
  const v = g && g.value ? `${g.value.min ?? ''}~${g.value.max ?? ''}` : ''
  const fs = (g && Array.isArray(g.filters) ? g.filters : [])
    .filter((f) => f && f.id)
    .map((f) => `${f.id}=${f.value ? `${f.value.min ?? ''}~${f.value.max ?? ''}~${f.value.weight ?? ''}` : ''}`)
    .sort()
  return `${type}|${v}|${fs.join(',')}`
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
  const groups = groupsOf(set)
  if (!set || (!groups.length && !set.itemType)) return null
  const src = base && typeof base === 'object' && base.query && typeof base.query === 'object' ? base : null
  const body = src ? JSON.parse(JSON.stringify(src)) : emptyBody()
  const q = body.query
  if (set.itemType) q.type = set.itemType
  if (!Array.isArray(q.stats)) q.stats = []
  // 저장용 항목(text 포함) → 검색 바디 항목(id·value만)
  const toFilter = (s) => {
    const f = { id: s.id }
    if (s.value && Object.keys(s.value).length) f.value = { ...s.value }
    return f
  }
  for (const g of groups) {
    const filters = g.filters.filter((f) => f && f.id).map(toFilter)
    if (!filters.length) continue
    if ((g.type || 'and') === 'and') {
      // and 는 "전부 만족"이라 현재 검색의 and 그룹에 합쳐도 의미가 같다 → 얹기(중복 id는 갱신)
      let target = q.stats.find((x) => x && !x.disabled && (x.type || 'and') === 'and')
      if (!target) { target = { type: 'and', filters: [] }; q.stats.push(target) }
      if (!Array.isArray(target.filters)) target.filters = []
      for (const f of filters) {
        const idx = target.filters.findIndex((x) => x && x.id === f.id)
        if (idx >= 0) target.filters[idx] = f
        else target.filters.push(f)
      }
    } else {
      // count·weight 등은 그룹 자체가 하나의 조건(예: "이 중 1개")이라 합치면 의미가 깨진다 → 통째로 추가.
      // 단 똑같은 그룹이 이미 있으면 건너뛴다 — 없으면 같은 검색에 얹을 때마다 동일 그룹이 쌓인다(라이브에서 발견).
      const ng = { type: g.type, filters }
      if (g.value && Object.keys(g.value).length) ng.value = { ...g.value }
      const key = groupKey(ng)
      if (!q.stats.some((x) => x && !x.disabled && groupKey(x) === key)) q.stats.push(ng)
    }
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
