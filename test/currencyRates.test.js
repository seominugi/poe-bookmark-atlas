import { describe, it, expect } from 'vitest'
import { parseExaltedPerDivine, RatesCache, baseFromPrice, baseCurrencyOf, fmtCurAmount } from '../src/lib/currencyRates.js'

describe('parseExaltedPerDivine', () => {
  it('exchange_rates에서 가격 추출', () => {
    const payload = { exchange_rates: { exalted_per_divine: { price: 215 } } }
    expect(parseExaltedPerDivine(payload)).toBe(215)
  })
  it('없으면 null', () => {
    expect(parseExaltedPerDivine({})).toBeNull()
    expect(parseExaltedPerDivine({ exchange_rates: {} })).toBeNull()
  })
})

describe('baseCurrencyOf — 게임별 기본 거래 화폐', () => {
  it('poe2 → exalted, poe1 → chaos', () => {
    expect(baseCurrencyOf('poe2')).toBe('exalted')
    expect(baseCurrencyOf('poe1')).toBe('chaos')
  })
})

describe('baseFromPrice(poe2) — 제시 가격 → 엑잘 환산 (BE exchange_rates)', () => {
  const ex = { exalted_per_chaos: { price: 84 }, exalted_per_divine: { price: 715 }, divine_per_mirror: { price: 6666 } }
  it('chaos → 엑잘', () => expect(baseFromPrice({ amount: 2, currency: 'chaos' }, ex, 'poe2')).toBe(168))
  it('divine → 엑잘 (소수 amount)', () => expect(baseFromPrice({ amount: 1.5, currency: 'divine' }, ex, 'poe2')).toBe(1072.5))
  it('mirror → 엑잘 (divine 경유 cross)', () => expect(baseFromPrice({ amount: 1, currency: 'mirror' }, ex, 'poe2')).toBe(6666 * 715))
  it('이미 엑잘이면 null(환산 불필요)', () => expect(baseFromPrice({ amount: 15, currency: 'exalted' }, ex, 'poe2')).toBeNull())
  it('미지원 화폐·환율 없음 → null', () => {
    expect(baseFromPrice({ amount: 1, currency: 'annul' }, ex, 'poe2')).toBeNull()
    expect(baseFromPrice({ amount: 1, currency: 'chaos' }, null, 'poe2')).toBeNull()
    expect(baseFromPrice({ amount: 1, currency: 'chaos' }, {}, 'poe2')).toBeNull()
    expect(baseFromPrice(null, ex, 'poe2')).toBeNull()
  })
})

describe('baseFromPrice(poe1) — 제시 가격 → 카오스 환산 (chaos 기준 키)', () => {
  const ex = { chaos_per_exalted: { price: 12 }, chaos_per_divine: { price: 102 }, exalted_per_divine: { price: 8.5 }, divine_per_mirror: { price: 5000 } }
  it('exalted → 카오스', () => expect(baseFromPrice({ amount: 2, currency: 'exalted' }, ex, 'poe1')).toBe(24))
  it('divine → 카오스', () => expect(baseFromPrice({ amount: 1.5, currency: 'divine' }, ex, 'poe1')).toBe(153))
  it('mirror → 카오스 (divine 경유 cross)', () => expect(baseFromPrice({ amount: 1, currency: 'mirror' }, ex, 'poe1')).toBe(5000 * 102))
  it('이미 카오스면 null(환산 불필요)', () => expect(baseFromPrice({ amount: 10, currency: 'chaos' }, ex, 'poe1')).toBeNull())
})

describe('fmtCurAmount — 환산 수치 표기', () => {
  it('10 이상은 반올림 + 천단위 콤마', () => {
    expect(fmtCurAmount(168)).toBe('168')
    expect(fmtCurAmount(1072.5)).toBe('1,073')
    expect(fmtCurAmount(4766190)).toBe('4,766,190')
  })
  it('10 미만은 소수 1자리(정수면 생략)', () => {
    expect(fmtCurAmount(9.53)).toBe('9.5')
    expect(fmtCurAmount(8)).toBe('8')
  })
})

describe('RatesCache (리그별, TTL)', () => {
  it('TTL 내 동일 리그는 캐시 반환', () => {
    let now = 1000
    const cache = new RatesCache(5000, () => now)
    cache.set('poe2:Standard', 200)
    now = 4000
    expect(cache.get('poe2:Standard')).toBe(200)
    now = 7000
    expect(cache.get('poe2:Standard')).toBeNull()
  })
  it('리그가 다르면 분리', () => {
    const cache = new RatesCache(5000, () => 0)
    cache.set('poe2:Standard', 200)
    expect(cache.get('poe2:Hardcore')).toBeNull()
  })
})
