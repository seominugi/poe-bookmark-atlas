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
 * BE items 맵을 **한글 이름으로** 색인한다.
 *
 * 배경: 예전 코드가 `items[거래소화폐id]`로 조회해 실제로는 한 번도 매칭되지 않았고, 그 결과 환산 칩이
 *   큐레이션 4종(엑잘·디바인·미러)에서만 뜨고 색채·연금술 등은 조용히 빠져 있었다(2026-07-27 실측·제보).
 *   두 데이터를 잇는 공통 키가 한글 이름이라(거래소 static API의 화폐 text == 경제 API의 ko_name,
 *   중복 0) 이름으로 색인한다.
 *
 * ⚠ **이 자리에 있던 "items의 키는 Metadata 경로다"는 이제 사실이 아니다** (2026-09-13 실측 정정).
 *   BE가 스키마를 바꿨다 — 지금 키는 거래소 화폐 id 형태의 슬러그(`regal`·`alch`·`vaal`)이고,
 *   Metadata 경로는 `market_ids` 필드로 옮겨갔다(poe2 Forbidden Rites 600항목 중 `Metadata/` 로
 *   시작하는 키 0개). 즉 id 직접 조회도 이제는 동작한다.
 *   그래도 **이름 색인을 정본으로 유지한다**: 키 스키마는 BE 사정으로 또 바뀔 수 있고, ko_name 은
 *   거래소 static API 와 맺은 계약이라 더 안정적이다. id 조회로 갈아타려면 양쪽 일치를 먼저 실측할 것.
 * @param {any} items @returns {Record<string, any>}
 */
export function indexItemsByName(items) {
  const index = {}
  for (const v of Object.values(items || {})) {
    if (v && typeof v.ko_name === 'string' && v.ko_name && !(v.ko_name in index)) index[v.ko_name] = v
  }
  return index
}

// 색인은 rates 응답당 1회만 만든다(항목이 800개 넘고 결과 행마다 조회하므로). 응답 객체가 바뀌면 자동 폐기.
const nameIndexCache = new WeakMap()
function nameIndexOf(items) {
  if (!items || typeof items !== 'object') return null
  let idx = nameIndexCache.get(items)
  if (!idx) { idx = indexItemsByName(items); nameIndexCache.set(items, idx) }
  return idx
}

/**
 * 색인된 items에서 화폐 하나의 기준화폐 환산 rate.
 * primary_currency가 기준화폐와 같으면 그 시장에서 직접관찰된 _ask를 쓰고(cross 계산 없이 가장 신뢰도 높음),
 * 다르면 top-level cross 필드를 쓴다(예: 연금술의 오브는 divine이 primary라 top-level chaos가 cross 계산값 —
 * 실측 chaos_ask보다 유동성 높은 divine 경유가 더 안정적).
 * @param {Record<string,any>|null} index indexItemsByName 결과 @param {string} name 한글 화폐명 @param {string} base
 * @returns {number|null}
 */
export function itemsRate(index, name, base) {
  const it = index?.[name]
  if (!it) return null
  if (it.primary_currency === base && typeof it[base + '_ask'] === 'number') return it[base + '_ask']
  return typeof it[base] === 'number' ? it[base] : null
}

/**
 * 거래소 제시 가격({amount, currency}) → 게임 기본 화폐 환산값 (poe2: 엑잘 / poe1: 카오스).
 * 1순위 BE exchange_rates(엑잘·디바인·미러 — 미러는 디바인 경유 cross), 2순위 BE items 맵(그 외 다수 화폐).
 * 이미 기본 화폐거나 둘 다 없으면 null(표시 안 함).
 * @param {{amount:number, currency:string}|null} price @param {any} rateData BE 원본 응답({exchange_rates, items})
 * @param {string} game
 * @param {Record<string,string>} [currencyNames] 거래소 화폐 id → 한글명(static API). 없으면 큐레이션 4종만 동작
 * @returns {number|null}
 */
export function baseFromPrice(price, rateData, game, currencyNames) {
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
  if (typeof per !== 'number' || per <= 0) {
    const name = currencyNames && currencyNames[price.currency]
    per = name ? itemsRate(nameIndexOf(rateData.items), name, base) : null
  }
  return typeof per === 'number' && per > 0 ? price.amount * per : null
}

/**
 * 기본 화폐 1개당 신성한 오브가 몇 개인가 — 즉 **base → divine 환산 계수**.
 *
 * 어느 환율 키를 봐야 하는지는 게임마다 다르다(poe2 `exalted_per_divine` / poe1 `chaos_per_divine`).
 * 그 지식을 이 모듈 밖으로 새게 하지 않으려고 여기 둔다 — 호출부가 키를 직접 알면 게임이 늘 때
 * 두 곳이 갈라진다(환산 칩이 실제로 그렇게 갈라져 한 번 조용히 죽었다, 위 indexItemsByName 주석 참조).
 * @param {any} rateData BE 원본 응답 @param {string} game
 * @returns {number} 못 구하면 0 — 호출부가 `> 0` 으로 판정한다
 */
export function basePerDivineOf(rateData, game) {
  const ex = rateData?.exchange_rates || {}
  const per = game === 'poe1' ? ex.chaos_per_divine?.price : ex.exalted_per_divine?.price
  return typeof per === 'number' && per > 0 ? per : 0
}

/**
 * 기본 화폐(poe2 엑잘 / poe1 카오스)로 매겨진 가격 → 신성한 오브 환산. baseFromPrice의 반대 방향이다.
 *
 * 한 목록에 "350 카오스"와 "2 신성한"이 섞이면 한쪽 축으로만 환산해서는 비교가 안 된다 —
 * 신성한 쪽엔 카오스 환산이 붙지만 카오스 쪽엔 붙을 게 없어(이미 기본 화폐라) 사용자가
 * 큰 카오스 숫자와 작은 신성한 숫자를 머릿속으로 나눠야 했다(2026-08-01 사용자 제보).
 * 기본 화폐가 아니거나 환율이 없으면 null.
 * @param {{amount:number, currency:string}|null} price @param {any} rateData @param {string} game
 * @returns {number|null}
 */
export function divineFromPrice(price, rateData, game) {
  if (!price || !rateData || typeof price.amount !== 'number') return null
  if (price.currency !== baseCurrencyOf(game)) return null
  const ex = rateData.exchange_rates || {}
  const per = game === 'poe1' ? ex.chaos_per_divine?.price : ex.exalted_per_divine?.price
  if (typeof per !== 'number' || per <= 0) return null
  return price.amount / per
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
