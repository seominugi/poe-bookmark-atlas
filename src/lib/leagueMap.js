// /api/trade(2)/data/leagues 응답 → { 리그id: 표시명 } 맵.
// 거래소 text가 영구 리그는 한글(스탠다드·하드코어), 챌린지 리그는 영문 → 거래소 표기 그대로 사용.
export function buildLeagueMap(payload) {
  const map = {}
  for (const l of payload?.result ?? []) {
    if (l?.id) map[l.id] = (typeof l.text === 'string' && l.text) || l.id
  }
  return map
}
