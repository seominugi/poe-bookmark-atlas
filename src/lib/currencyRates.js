/** @param {any} payload @returns {number|null} */
export function parseExaltedPerDivine(payload) {
  const price = payload?.exchange_rates?.exalted_per_divine?.price
  return typeof price === 'number' && price > 0 ? price : null
}

/** 리그별 환율 캐시 (TTL ms). now() 주입으로 테스트 가능. */
export class RatesCache {
  constructor(ttlMs = 5 * 60 * 1000, now = () => Date.now()) {
    this.ttl = ttlMs
    this.now = now
    this.map = new Map()
  }
  set(key, value) { this.map.set(key, { value, at: this.now() }) }
  get(key) {
    const e = this.map.get(key)
    if (!e) return null
    if (this.now() - e.at > this.ttl) { this.map.delete(key); return null }
    return e.value
  }
}
