// /api/trade(2)/data/items 응답 → 아이템 유형(type) → 표시 이름(text) 맵
//
// 왜 필요한가 (제보 2026-08-16: 북마크 이름이 "NonEleBowRangerPhys - 능력치 필터"로 생성됨):
// 대부분의 항목은 type 자체가 사람이 읽는 이름이다 — { "type": "앗조아틀의 연대기" }.
// 그런데 일부 계열(용병 소환장 등)은 **type 이 내부 영문 id 이고 표시 이름은 text 에 따로** 있다:
//   { "type": "NonEleBowRangerPhys", "text": "용병 소환장 (저격수)", "disc": "mercenary_warrant" }
// 거래소 화면은 text 를 보여주므로 사용자는 그 이름만 안다. 우리가 type 을 그대로 쓰면
// 사용자가 본 적도 없는 내부 id 가 북마크 이름·조건 요약에 튀어나온다.
//
// 유니크 아이템(name 이 따로 있는 항목)은 담지 않는다 — 그쪽은 name 이 우선이라 이 맵이 필요 없고,
// text 가 "유니크명 + 베이스명"이라 유형 자리에 넣으면 오히려 길고 틀린 이름이 된다.
export function buildItemMap(payload) {
  const byType = {} // 'type' 또는 'type|disc' → 표시 이름
  const groups = Array.isArray(payload?.result) ? payload.result : []
  for (const g of groups) {
    for (const e of g?.entries ?? []) {
      if (!e || typeof e.type !== 'string' || typeof e.text !== 'string') continue
      if (e.name) continue // 유니크 — name 이 우선이라 유형 맵의 대상이 아니다
      if (e.text === e.type) continue // 대부분은 type 이 곧 이름 — 담을 이유가 없다
      // 같은 type 에 disc 만 다른 항목이 있을 수 있어 정밀 키를 먼저 둔다.
      if (typeof e.disc === 'string' && e.disc) byType[`${e.type}|${e.disc}`] = e.text
      if (!(e.type in byType)) byType[e.type] = e.text
    }
  }
  return byType
}

/**
 * 검색 query.type 을 사용자가 보는 이름으로 바꾼다. 맵에 없으면 원래 값을 그대로 돌려준다 —
 * 맵이 아직 안 왔거나(비동기) 새 아이템이라도 화면이 비지 않아야 한다.
 * @param {string|{option?:string, discriminator?:string}} type 검색 바디의 query.type
 * @param {Record<string,string>} map buildItemMap 결과
 */
export function itemTypeText(type, map) {
  if (!type) return type
  const opt = typeof type === 'string' ? type : type.option
  if (typeof opt !== 'string' || !opt) return typeof type === 'string' ? type : ''
  const disc = typeof type === 'object' ? type.discriminator : null
  const m = map || {}
  return (disc && m[`${opt}|${disc}`]) || m[opt] || opt
}
