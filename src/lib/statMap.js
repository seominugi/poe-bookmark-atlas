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
