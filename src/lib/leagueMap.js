// /api/trade(2)/data/leagues 응답 → { 리그id: 표시명 } 맵.
// 거래소 text가 영구 리그는 한글(스탠다드·하드코어), 챌린지 리그는 영문 → 거래소 표기 그대로 사용.
export function buildLeagueMap(payload) {
  const map = {}
  for (const l of payload?.result ?? []) {
    if (l?.id) map[l.id] = (typeof l.text === 'string' && l.text) || l.id
  }
  return map
}

// 거래소는 영구 리그·챌린지 리그 "본명"만 한글로 주고, 하드코어·무자비 변형은 영문 그대로 준다
// (예: "Hardcore Allflame" · "HC Ruthless Allflame" · "Hardcore Ruthless"). id 앞의 변형 토큰만
// 한글로 바꾸고 뒤에 남은 베이스 리그는 거래소가 준 한글 표시명으로 채운다 — 베이스는 직접 번역하지 않는다.
const LEAGUE_MODIFIERS = [
  [/^HC Ruthless\b/, '하드코어 무자비'],
  [/^Hardcore Ruthless\b/, '하드코어 무자비'],
  [/^Hardcore\b/, '하드코어'],
  [/^HC\b/, '하드코어'],
  [/^Ruthless\b/, '무자비'],
]

/**
 * 리그 표시명 — 거래소 표기(text)가 이미 한글이면 그대로, 영문 변형이면 접두만 한글화.
 * 표시 전용이다: 리그 생존 판정·역변환은 거래소 원본 표기를 그대로 써야 한다(leagueInfo 참조).
 * @param {string} id 리그 id
 * @param {string} [text] 거래소 표시명
 * @param {Record<string,string>} [map] 리그 맵 — 베이스 리그의 한글명을 찾는 데 쓴다
 */
export function leagueDisplayName(id, text, map = {}) {
  if (!id) return text || ''
  if (/[가-힣]/.test(text || '')) return text
  for (const [re, ko] of LEAGUE_MODIFIERS) {
    const m = re.exec(id)
    if (!m) continue
    const base = id.slice(m[0].length).trim()
    return base ? `${ko} ${map[base] || base}` : ko
  }
  return text || id
}
