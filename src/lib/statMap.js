import { normalizeTradeText } from './statTextNorm.js'

/** @param {any} payload /api/trade(2)/data/stats 응답 @returns {Record<string,string>} */
export function buildStatMap(payload) {
  const map = {}
  const groups = Array.isArray(payload?.result) ? payload.result : []
  for (const g of groups) {
    for (const e of g?.entries ?? []) {
      if (e?.id && typeof e.text === 'string') map[e.id] = e.text
    }
  }
  return map
}

/**
 * 문구 → stat id 역방향 색인. 거래소 화면의 능력치 행에는 id 가 없어서, 보이는 이름으로 되찾는다.
 * 같은 문구가 둘 이상인 경우(PoE2 기준 3,074개 중 23개)는 먼저 온 것을 쓴다 — 거래소 목록 자체가
 * 구분되지 않는 항목이라 어느 쪽을 골라도 사용자가 보는 문구는 같다.
 * @param {Record<string,string>} statMap id → text
 * @returns {Map<string,string>} 정규화 문구 → id
 */
export function buildStatIdIndex(statMap) {
  const index = new Map()
  for (const [id, text] of Object.entries(statMap ?? {})) {
    if (typeof text !== 'string') continue
    const key = normalizeTradeText(text)
    if (!index.has(key)) index.set(key, id)
  }
  return index
}
