// src/lib/enListing.js
// 영문 거래소에서 **같은 매물**을 받아온다 — PoB 복사를 우리 번역이 아니라 원본 영문으로 만들기 위함.
//
// 왜 되는가 (2026-08-17 실측): PoE 는 단일 서버라 카카오에서 만든 매물 id 를
// www.pathofexile.com 의 fetch API 에 그대로 넣으면 **인증 없이 200** 이 오고,
// 스탯·베이스 타입·유니크 이름이 전부 영문으로 온다. `?query=` 파라미터도 필요 없다.
//   카카오 "1초마다 생명력 13.8 재생"  →  GGG "Regenerate 13.8 Life per second"
//   카카오 "보병 브리간딘"             →  GGG "Infantry Brigandine"
//   카카오 "종말의 발"(유니크)         →  GGG "Apocalypse Span"
// PoE2(/api/trade2/)도 동일하게 동작한다.
//
// 이게 성립하면 번역 맵(약 2.5MB)과 번역 로직이 필요 없어진다. 다만 **폴백은 남긴다** —
// 권한 미허용·오프라인·매물 판매됨이면 조회가 비고, 그때 PoB 가 통째로 죽으면 안 된다.

export const EN_ORIGIN = 'https://www.pathofexile.com'

/** 매물 id 는 거래소가 주는 64자 hex — 그 외는 URL 에 넣지 않는다. */
export function isSafeListingId(id) {
  return typeof id === 'string' && /^[0-9a-f]{16,128}$/i.test(id)
}

/** 영문 거래소의 fetch 경로. game 별로 trade/trade2 가 갈린다. */
export function enFetchPath(game, id) {
  return `/api/${game === 'poe2' ? 'trade2' : 'trade'}/fetch/${id}`
}

/**
 * 응답에서 첫 아이템을 꺼낸다. 매물이 팔렸으면 result 가 비어 온다 — 그때 null.
 * @returns {object|null}
 */
export function pickItem(payload) {
  const r = (payload && payload.result) || []
  const first = r.find((x) => x && x.item)
  return first ? first.item : null
}
