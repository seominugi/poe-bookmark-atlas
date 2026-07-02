// 작업3 — 영문 PoB(Path of Building) import 텍스트 조립 핵심 로직.
// KR 거래소 아이템의 mod(stat id + KR 설명)를 번들 EN 맵(pobStatMap.json)으로 영문화한다.
//   1) stat id로 EN 템플릿(#-패턴) 조회 — 다중변형(Area/Map 등)은 KR 설명을 숫자 정규화해 택1
//   2) KR 설명에서 실제 값 추출 → 템플릿의 #를 순서대로 치환
// 한계(MVP): 필터 텍스트에 #가 없는 mod(예 "an additional Chest")는 값 손실 — 주로 비-gear(지도/서판)라 PoB 무관.
//   KR/EN 값 순서가 다른 하이브리드 mod는 순서 그대로 치환(대부분 동일). 미매핑 id는 en=null.

// [Key|표시텍스트] / [텍스트] 게임 마크업 제거 → 표시 텍스트만
export function stripTags(s) {
  return String(s).replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1')
}

// 숫자(음수·소수 포함)를 #로 — 다중변형 매칭 시 값 차이를 무시하기 위함
export function digitsToHash(s) {
  return String(s).replace(/-?\d+(?:\.\d+)?/g, '#')
}

// 값 추출(등장 순서 유지)
export function extractValues(s) {
  return String(s).match(/-?\d+(?:\.\d+)?/g) || []
}

// EN 템플릿의 #를 값으로 순서대로 치환(값이 모자라면 #를 남김)
export function fillValues(template, values) {
  let i = 0
  return String(template).replace(/#/g, () => (i < values.length ? values[i++] : '#'))
}

// stat id → EN 템플릿. 다중변형이면 KR 설명(숫자 정규화)으로 ko를 매칭해 택1(불일치 시 첫 변형).
export function pickTemplate(id, koDesc, map) {
  const e = map[id]
  if (e == null) return null
  if (typeof e === 'string') return e
  const key = digitsToHash(stripTags(koDesc)).trim()
  const hit = e.find((v) => v.ko && digitsToHash(v.ko).trim() === key)
  return (hit || e[0]).en
}

// mod(stat id + KR 설명) → { en, ko }. en=null이면 미매핑(조립기가 폴백 결정).
export function translateMod(id, koDesc, map) {
  const tpl = pickTemplate(id, koDesc, map)
  if (tpl == null) return { en: null, ko: koDesc }
  return { en: fillValues(tpl, extractValues(stripTags(koDesc))), ko: koDesc }
}
