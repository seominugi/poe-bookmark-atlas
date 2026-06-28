// /api/trade(2)/data/filters 응답 → 필터 라벨·옵션 텍스트 맵 (거래소 언어 그대로 = 한글)
// 구조: { result: [ { id, title, filters: [ { id, text, option:{ options:[{id,text}] } } ] } ] }
export function buildFilterMap(payload) {
  const label = {} // filterId → 라벨 (예: ilvl → '아이템 레벨')
  const options = {} // filterId → { optionId → 텍스트 } (예: category → { 'accessory.ring':'반지' })
  const groups = Array.isArray(payload?.result) ? payload.result : []
  for (const g of groups) {
    for (const f of g?.filters ?? []) {
      if (!f?.id) continue
      if (typeof f.text === 'string') label[f.id] = f.text
      const opts = f.option?.options
      if (Array.isArray(opts)) {
        const m = {}
        for (const o of opts) if (o && o.id != null && typeof o.text === 'string') m[String(o.id)] = o.text
        options[f.id] = m
      }
    }
  }
  return { label, options }
}

// 검색 조건이 아닌 메타(거래 상태·정렬·계정 등)는 툴팁에서 제외
const SKIP = new Set(['status', 'collapse', 'indexed', 'sale_type', 'account', 'fee'])
const fmtRange = (v) => {
  const { min, max } = v || {}
  if (min != null && max != null) return `${min}~${max}`
  if (min != null) return `≥${min}`
  if (max != null) return `≤${max}`
  return null
}

/**
 * 검색 query.filters → 입력된 필터 목록 [{ key, label, value }] (사용자가 읽을 한글 형태).
 * @param {any} query payload.query
 * @param {{label:Record<string,string>, options:Record<string,Record<string,string>>}} meta buildFilterMap 결과
 */
export function parseQueryFilters(query, meta = { label: {}, options: {} }) {
  const out = []
  const groups = query?.filters
  if (!groups || typeof groups !== 'object') return out
  const optText = (fid, opt) => (meta.options[fid] && meta.options[fid][String(opt)]) || String(opt)
  for (const group of Object.values(groups)) {
    const filters = group?.filters
    if (!filters || typeof filters !== 'object') continue
    for (const [fid, fval] of Object.entries(filters)) {
      if (SKIP.has(fid) || !fval || typeof fval !== 'object') continue
      const label = meta.label[fid] || fid
      let value = null
      if (fid === 'price') {
        const range = fmtRange(fval)
        const cur = fval.option != null ? optText(fid, fval.option) : ''
        value = [range, cur].filter(Boolean).join(' ') || null
      } else if ('option' in fval) {
        if (fval.option == null) continue // "모두" = 무필터
        value = optText(fid, fval.option)
      } else {
        value = fmtRange(fval)
      }
      if (value == null || value === '') continue
      out.push({ key: fid, label, value })
    }
  }
  return out
}
