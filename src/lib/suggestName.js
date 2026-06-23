// 저장 다이얼로그 기본 이름 제안 — 유니크 아이템명 우선, 없으면 핵심 스탯 2개를 결합, 그것도 없으면 title.
export function suggestName(r) {
  if (r && r.name) return r.name
  const stats = (r && r.stats) || []
  if (stats.length) return stats.slice(0, 2).join(' · ')
  return (r && r.title) || '북마크'
}
