// 저장 다이얼로그 기본 이름 제안.
// itemType은 거래소 유형(카테고리 한글 라벨 또는 베이스 타입)이 그대로 들어온다(searchParser가 거래소 filters 데이터로 변환).
// 우선순위: 유니크 아이템명(가장 구체적) → "{유형} - 능력치 필터" → 유형 → 핵심 스탯 2개 결합 → title.
export function suggestName(r) {
  if (r && r.name) return r.name // 유니크 아이템명 최우선
  const typeLabel = (r && r.itemType) || null
  const stats = (r && r.stats) || []
  const hasStats = !!((r && r.statGroups && r.statGroups.length) || stats.length)
  if (typeLabel && hasStats) return `${typeLabel} - 능력치 필터`
  if (typeLabel) return typeLabel
  if (stats.length) return stats.slice(0, 2).join(' · ')
  return (r && r.title) || '북마크'
}
