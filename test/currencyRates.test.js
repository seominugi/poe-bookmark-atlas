import { describe, it, expect } from 'vitest'
import { parseExaltedPerDivine, RatesCache } from '../src/lib/currencyRates.js'

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
