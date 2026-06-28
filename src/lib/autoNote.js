// 북마크 저장 시 메모 자동 채움 — 카드에 상시 보이는 '한 줄 맥락 요약'.
// 칩(능력치 태그)·툴팁(전체 상세)과 중복을 피하려고, 메모는 능력치 '상세'를 빼고
// 유형 · 비능력치 필터(아이템 레벨·가격 등) · 능력치 '개수'만 담는다(해상도 분리).
export function buildAutoNote(r) {
  if (!r) return ''
  const parts = []
  if (r.itemType) parts.push(String(r.itemType))
  // otherFilters에서 유형(category)은 itemType과 중복이라 제외, 나머지(레벨·가격 등)는 포함
  const others = Array.isArray(r.otherFilters) ? r.otherFilters.filter((f) => f && f.key !== 'category') : []
  for (const f of others) parts.push(`${f.label} ${f.value}`)
  const n = (r.stats || []).length
  if (n) parts.push(`능력치 ${n}개`)
  return parts.join(' · ')
}
