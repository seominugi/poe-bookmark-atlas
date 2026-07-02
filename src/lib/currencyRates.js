/** @param {any} payload @returns {number|null} */
export function parseExaltedPerDivine(payload) {
  const price = payload?.exchange_rates?.exalted_per_divine?.price
  return typeof price === 'number' && price > 0 ? price : null
}

/** 게임별 기본 거래 화폐 — poe2는 엑잘티드 오브, poe1은 카오스 오브 */
export function baseCurrencyOf(game) {
  return game === 'poe1' ? 'chaos' : 'exalted'
}

/**
 * 거래소 제시 가격({amount, currency}) → 게임 기본 화폐 환산값 (poe2: 엑잘 / poe1: 카오스, BE exchange_rates 기준).
 * 미러는 디바인 경유 cross. 이미 기본 화폐거나 미지원 화폐·환율 부재면 null(표시 안 함).
 * @param {{amount:number, currency:string}|null} price @param {any} ex @param {string} game @returns {number|null}
 */
export function baseFromPrice(price, ex, game) {
  if (!price || !ex || typeof price.amount !== 'number') return null
  let per = null
  if (game === 'poe1') {
    const cpd = ex.chaos_per_divine?.price
    per = {
      exalted: ex.chaos_per_exalted?.price,
      divine: cpd,
      mirror: ex.divine_per_mirror?.price && cpd ? ex.divine_per_mirror.price * cpd : null,
    }[price.currency]
  } else {
    const epd = ex.exalted_per_divine?.price
    per = {
      chaos: ex.exalted_per_chaos?.price,
      divine: epd,
      mirror: ex.divine_per_mirror?.price && epd ? ex.divine_per_mirror.price * epd : null,
    }[price.currency]
  }
  return typeof per === 'number' && per > 0 ? price.amount * per : null
}

/** 환산 수치 표기 — 10 이상 반올림+천단위 콤마, 10 미만 소수 1자리(정수면 생략) */
export function fmtCurAmount(n) {
  if (n >= 10) return Math.round(n).toLocaleString('en-US')
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
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
