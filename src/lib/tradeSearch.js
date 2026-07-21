// src/lib/tradeSearch.js
// 저장된 검색 조건(raw query)을 거래소의 "새 검색"으로 다시 만들기 위한 순수 헬퍼.
//
// 왜 필터 UI 자동 채움이 아닌가:
//   거래소는 Vue SPA라 필터 UI에 값을 써넣으려면 클릭·타이핑·이벤트 디스패치를 흉내내야 하고,
//   GGG가 화면 구조를 바꿀 때마다 깨진다. 반면 검색 생성은 사이트 자신이 쓰는 공식 엔드포인트가 있고
//   (POST /api/trade2/search/poe2/<리그>) 반환된 id로 이동하면 거래소가 필터 UI까지 조건대로 채워 렌더한다.
//   즉 같은 결과를 공개 API 계약만 의존해 얻는다. 같은 방식을 이미 cross-site-receiver.js(영문 거래소 전환)가 쓴다.
//
// 북마크는 저장 시점 리그의 검색 해시 링크라 리그가 바뀌면 조건이 사라진다. 조건 자체(query)를 들고 있으면
// 언제든 현재 리그로 다시 만들 수 있다 = 리그 이관.

const encLeague = (league) => encodeURIComponent(String(league || 'Standard'))
const isPoe2 = (game) => game === 'poe2'

/** 검색 생성(POST) API 경로 — same-origin 상대 경로 */
export function searchApiPath(game, league) {
  return isPoe2(game) ? `/api/trade2/search/poe2/${encLeague(league)}` : `/api/trade/search/${encLeague(league)}`
}

/** 생성된 검색의 결과 페이지 경로 */
export function searchResultPath(game, league, id) {
  return isPoe2(game) ? `/trade2/search/poe2/${encLeague(league)}/${id}` : `/trade/search/${encLeague(league)}/${id}`
}

// 응답 id를 그대로 URL에 이어 붙이므로, 경로·쿼리·프로토콜로 탈출할 수 있는 문자는 전부 배제한다.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
export function isSafeSearchId(id) {
  return typeof id === 'string' && SAFE_ID.test(id)
}

/**
 * 검색 바디 정규화 — 거래소 API로 보내기 전 항상 통과시킨다.
 * 가져오기(JSON import)로 들어온 북마크의 query는 남이 만든 데이터이므로,
 * ① 최상위 키를 query·sort로 화이트리스트 ② 직렬화 크기 상한 ③ JSON 왕복으로 비직렬화 값 제거.
 * (내부 구조는 GGG가 계속 확장하므로 깊은 화이트리스트는 두지 않는다 — 정상 검색이 깨진다.)
 * @returns {{ok: true, query: object} | {ok: false, reason: 'shape'|'size'}}
 */
export function sanitizeQuery(raw, maxBytes = 20000) {
  const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
  if (!isPlainObject(raw) || !isPlainObject(raw.query)) return { ok: false, reason: 'shape' }
  const picked = { query: raw.query }
  if (isPlainObject(raw.sort)) picked.sort = raw.sort
  let text
  try { text = JSON.stringify(picked) } catch (_) { return { ok: false, reason: 'shape' } } // 순환 참조 등
  if (!text) return { ok: false, reason: 'shape' }
  if (text.length > maxBytes) return { ok: false, reason: 'size' }
  try { return { ok: true, query: JSON.parse(text) } } catch (_) { return { ok: false, reason: 'shape' } }
}
