import { describe, it, expect } from 'vitest'
import { quartiles, computeSellable, priceSnapshot } from '../src/lib/priceSnapshot.js'

describe('quartiles (inclusive, _quartiles 포팅)', () => {
  it('4개 이상은 선형보간 분위', () => {
    expect(quartiles([1, 2, 3, 4, 5])).toEqual([2, 3, 4])
  })
  it('4개 미만은 (min, median, max)', () => {
    expect(quartiles([10, 20, 30])).toEqual([10, 20, 30])
    expect(quartiles([10, 20])).toEqual([10, 15, 20])
  })
})

describe('computeSellable (compute_sellable_price 포팅)', () => {
  it('4개 이상: 하위 max(1,10%) 절사 후 P25', () => {
    const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const r = computeSellable(prices)
    expect(r.sampleN).toBe(10)
    expect(r.lowestAsk).toBe(1)
    expect(r.sellable).toBe(4)
  })
  it('극단 허위 1개는 절사+P25로 방어', () => {
    const prices = [0.01, 9, 9.5, 10, 10, 10.5, 11, 11, 12, 13]
    const r = computeSellable(prices)
    expect(r.sellable).toBeGreaterThan(9)
  })
  it('4개 미만은 절사 없이 P50', () => {
    expect(computeSellable([5, 7, 9]).sellable).toBe(7)
  })
  it('빈 입력은 0', () => {
    expect(computeSellable([]).sampleN).toBe(0)
  })
})

describe('priceSnapshot (div·ex만, exalted 피벗)', () => {
  const rates = { exaltedPerDivine: 200 }
  it('div/ex listings를 exalted로 환산 후 sellable 계산, 디바인값 반환', () => {
    const listings = Array.from({ length: 8 }, () => ({ amount: 1, currency: 'divine' }))
    const snap = priceSnapshot(listings, rates)
    expect(snap.unit).toBe('divine')
    expect(snap.valueDiv).toBeCloseTo(1.0, 3)
    expect(snap.sampleN).toBe(8)
  })
  it('chaos 등 div/ex 외 통화는 제외', () => {
    const listings = [
      ...Array.from({ length: 5 }, () => ({ amount: 100, currency: 'chaos' })),
      ...Array.from({ length: 5 }, () => ({ amount: 2, currency: 'divine' })),
    ]
    const snap = priceSnapshot(listings, rates)
    expect(snap.sampleN).toBe(5)
  })
  it('환율 없으면(폴백) 최빈 단위 한 종류로 산출', () => {
    const listings = Array.from({ length: 6 }, () => ({ amount: 40, currency: 'exalted' }))
    const snap = priceSnapshot(listings, { exaltedPerDivine: 0 })
    expect(snap.unit).toBe('exalted')
    expect(snap.value).toBe(40)
  })
  it('표본 0이면 null', () => {
    expect(priceSnapshot([{ amount: 5, currency: 'chaos' }], rates)).toBeNull()
  })
})
