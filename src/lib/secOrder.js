// src/lib/secOrder.js
// 패널 목록의 **섹션 순서** — 저장 형식을 아는 곳을 한 군데로 모은다.
//
// renderList(그리는 쪽)와 설정 모달(바꾸는 쪽)이 둘 다 이 값을 다룬다. 양쪽이 각자
// 배열을 검사하면 반드시 갈라진다 — 폭 결합 4곳이 하드코딩돼 틈이 생겼던 그 사고와 같은 종류다.
//
// ⚠ 저장값을 **그대로 믿지 않는다.** 섹션이 늘거나 줄면(또는 다른 버전에서 넘어온 백업이면)
//   옛 배열에 모르는 키가 있거나 새 키가 빠져 있다. 빠진 키를 그냥 두면 그 섹션이 화면에서
//   통째로 사라지는데, 사용자에겐 '북마크가 없어졌다'로 보인다. 그래서 읽을 때마다 정규화한다.

/** 그리는 순서의 정본. 배열 순서가 곧 기본 순서다. */
export const SECTIONS = ['bookmarks', 'watch', 'history']

export const SECTION_LABEL = {
  bookmarks: '북마크',
  watch: '찜한 매물',
  history: '히스토리',
}

export const DEFAULT_SEC_ORDER = [...SECTIONS]

/**
 * 저장값 → 실제 그릴 순서.
 * 모르는 키·중복은 버리고, 빠진 키는 **정본 순서대로 뒤에 채운다**(새로 생긴 섹션이 맨 뒤에 붙는다).
 */
export function normalizeSecOrder(v) {
  const seen = new Set()
  const out = []
  if (Array.isArray(v)) {
    for (const k of v) {
      if (SECTIONS.includes(k) && !seen.has(k)) { seen.add(k); out.push(k) }
    }
  }
  for (const k of SECTIONS) if (!seen.has(k)) out.push(k)
  return out
}

/**
 * 섹션 하나를 위(-1)·아래(+1)로 한 칸 옮긴 **새 배열**을 돌려준다.
 * 끝을 넘어가면 원본을 그대로 돌려준다 — 순환시키지 않는다(▲▼ 버튼이 끝에서 비활성으로 보이는 것과 맞춘다).
 */
export function moveSection(order, key, dir) {
  const cur = normalizeSecOrder(order)
  const i = cur.indexOf(key)
  const j = i + (dir < 0 ? -1 : 1)
  if (i < 0 || j < 0 || j >= cur.length) return cur
  const out = [...cur]
  out[i] = cur[j]
  out[j] = cur[i]
  return out
}
