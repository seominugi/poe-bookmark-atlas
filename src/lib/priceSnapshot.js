const round4 = (n) => Math.round(n * 1e4) / 1e4

/** _linear_quantile (inclusive) */
function linearQuantile(sorted, q) {
  if (sorted.length === 1) return sorted[0]
  if (q <= 0) return sorted[0]
  if (q >= 1) return sorted[sorted.length - 1]
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** _quartiles 포팅: 내부 정렬 */
export function quartiles(values) {
  const s = [...values].sort((a, b) => a - b)
  if (s.length >= 4) return [linearQuantile(s, 0.25), linearQuantile(s, 0.5), linearQuantile(s, 0.75)]
  const mid = Math.floor(s.length / 2)
  const p50 = s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
  return [s[0], p50, s[s.length - 1]]
}

/** compute_sellable_price 포팅. */
export function computeSellable(prices) {
  const valid = prices.filter((p) => p > 0 && Number.isFinite(p)).sort((a, b) => a - b)
  if (valid.length === 0) return { lowestAsk: 0, sellable: 0, p25: 0, p50: 0, p75: 0, trimmedMean: 0, sampleN: 0 }
  let working = valid
  if (valid.length >= 4) working = valid.slice(Math.max(1, Math.floor(valid.length * 0.1)))
  if (working.length === 0) working = valid
  const [p25, p50, p75] = quartiles(working)
  const sellable = valid.length >= 4 ? p25 : p50
  const trimmedMean = working.reduce((a, b) => a + b, 0) / working.length
  return { lowestAsk: round4(valid[0]), sellable: round4(sellable), p25: round4(p25), p50: round4(p50), p75: round4(p75), trimmedMean: round4(trimmedMean), sampleN: valid.length }
}

/** _to_exalted 포팅: exalted/divine만 지원 */
function toExalted(amount, currency, exaltedPerDivine) {
  if (!(amount > 0)) return null
  const c = String(currency || '').toLowerCase()
  if (c === 'exalted') return amount
  if (c === 'divine' && exaltedPerDivine > 0) return amount * exaltedPerDivine
  return null
}

/** _dominant_currency 포팅 (ex 우선) */
function dominantUnit(listings) {
  const counts = { exalted: 0, divine: 0 }
  for (const l of listings) {
    const c = String(l.currency || '').toLowerCase()
    if (c === 'exalted' || c === 'divine') counts[c] += 1
  }
  if (counts.exalted === 0 && counts.divine === 0) return null
  if (counts.exalted >= counts.divine) return 'exalted'
  return 'divine'
}

/**
 * listings → 시세 스냅샷. div·ex만 사용.
 * @param {{amount:number,currency:string}[]} listings
 * @param {{exaltedPerDivine:number}} rates
 */
export function priceSnapshot(listings, rates) {
  const epd = rates?.exaltedPerDivine || 0
  const now = Date.now()

  if (epd > 0) {
    const exalted = listings.map((l) => toExalted(l.amount, l.currency, epd)).filter((v) => v != null)
    if (exalted.length === 0) return null
    const r = computeSellable(exalted)
    const valueDiv = round4(r.sellable / epd)
    return {
      valueDiv,
      value: valueDiv,
      unit: 'divine',
      lowestAsk: round4(r.lowestAsk / epd),
      sampleN: r.sampleN,
      method: 'sellable_p25',
      capturedAt: now,
    }
  }

  const unit = dominantUnit(listings)
  if (!unit) return null
  const same = listings.filter((l) => String(l.currency || '').toLowerCase() === unit).map((l) => l.amount)
  const r = computeSellable(same)
  if (r.sampleN === 0) return null
  return { value: r.sellable, unit, lowestAsk: r.lowestAsk, sampleN: r.sampleN, method: 'sellable_p25_fallback', capturedAt: now }
}
