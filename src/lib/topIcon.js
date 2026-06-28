// 검색 결과 아이템 이미지 중 '동일 이미지가 가장 많은(최빈)' 아이콘 URL을 반환.
// 동률이면 먼저 나온 것. 유니크 검색은 전부 같은 이미지라 정확히, 능력치 검색은 가장 흔한 베이스가 대표.
export function topIcon(icons) {
  const count = {}
  let best = null
  let bestN = 0
  for (const u of icons || []) {
    if (!u) continue
    count[u] = (count[u] || 0) + 1
    if (count[u] > bestN) { bestN = count[u]; best = u }
  }
  return best
}
