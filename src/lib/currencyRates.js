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
 * BE items 맵(개별 화폐별 시세, 큐레이션 exchange_rates 4종 밖 60여 종 커버 — 쥬얼러·색채·연금술 등)에서
 * 화폐 하나의 기준화폐 환산 rate. primary_currency가 기준화폐와 같으면 그 시장에서 직접관찰된 _ask를 쓰고
 * (cross 계산 없이 가장 신뢰도 높음), 다르면 top-level cross 필드를 쓴다(예: chrome은 divine이 primary라
 * top-level chaos가 cross 계산값 — 실측 chaos_ask보다 유동성 높은 divine 경유가 더 안정적).
 * @param {any} items @param {string} currency @param {string} base @returns {number|null}
 */
export function itemsRate(items, currency, base) {
  const it = items?.[currency]
  if (!it) return null
  if (it.primary_currency === base && typeof it[base + '_ask'] === 'number') return it[base + '_ask']
  return typeof it[base] === 'number' ? it[base] : null
}

/**
 * 거래소 제시 가격({amount, currency}) → 게임 기본 화폐 환산값 (poe2: 엑잘 / poe1: 카오스).
 * 1순위 BE exchange_rates(엑잘·디바인·미러 — 미러는 디바인 경유 cross), 2순위 BE items 맵(그 외 다수 화폐).
 * 이미 기본 화폐거나 둘 다 없으면 null(표시 안 함).
 * @param {{amount:number, currency:string}|null} price @param {any} rateData BE 원본 응답({exchange_rates, items})
 * @param {string} game @returns {number|null}
 */
export function baseFromPrice(price, rateData, game) {
  if (!price || !rateData || typeof price.amount !== 'number') return null
  const base = baseCurrencyOf(game)
  if (price.currency === base) return null
  const ex = rateData.exchange_rates || {}
  let per
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
  if (typeof per !== 'number' || per <= 0) per = itemsRate(rateData.items, price.currency, base)
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
