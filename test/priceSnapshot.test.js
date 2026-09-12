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

// ⚠ **여기 있던 `'chaos 등 div/ex 외 통화는 제외'` 를 반대로 뒤집었다** (2026-09-13).
//    실수가 아니라 당시 의도적으로 좁힌 결정이었는데(환율이 ex/div 뿐이던 시절), 그 사이 BE 가
//    리그당 화폐 33종의 환율을 내주게 됐고 거래소 결과 행의 환산 칩은 이미 그걸 쓰고 있었다.
//    그 결과 **같은 앱이 같은 가격에 두 답**을 냈고, 북마크에서는 가격이 아무 표시 없이 사라졌다
//    (제보 — 베렉 시리즈 3건. 사용자 리그 화폐 33종 중 31종이 버려지고 있었다).
//
// 이 describe 가 지키는 계약: **환산기가 값을 주는 매물은 하나도 버리지 않고, 버린 게 있으면 말한다.**
describe('priceSnapshot — 환산기가 주는 모든 화폐를 쓴다', () => {
  // 실측 환율(poe2 Forbidden Rites, 2026-09-13): 엑잘/디바인 327.56 · 카오스 36.08 · 연금술 2.08 · 제왕 1.67
  const EPD = 327.56
  const PER = { exalted: 1, divine: EPD, chaos: 36.08, alch: 2.08, regal: 1.67 }
  // 거래소 행 환산 칩이 하는 일을 그대로 흉내낸 주입 환산기 — 모르는 화폐는 null
  const toBase = (l) => (PER[l.currency] && l.amount > 0 ? l.amount * PER[l.currency] : null)
  const opts = { toBase, basePerDivine: EPD, exaltedPerDivine: EPD, nameOf: (id) => ({ chaos: '카오스 오브', alch: '연금술의 오브', regal: '제왕의 오브', exalted: '엑잘티드 오브', divine: '신성한 오브' }[id] || id) }

  it('div/ex listings를 기본 화폐로 환산 후 sellable 계산, 디바인값 반환', () => {
    const listings = Array.from({ length: 8 }, () => ({ amount: 1, currency: 'divine' }))
    const snap = priceSnapshot(listings, opts)
    expect(snap.unit).toBe('divine')
    expect(snap.valueDiv).toBeCloseTo(1.0, 3)
    expect(snap.sampleN).toBe(8)
  })

  it('연금술·제왕·바알·카오스도 계산에 들어간다 — 이게 이번 버그의 본체다', () => {
    const listings = [
      ...Array.from({ length: 5 }, () => ({ amount: 100, currency: 'chaos' })),
      ...Array.from({ length: 5 }, () => ({ amount: 2, currency: 'divine' })),
    ]
    const snap = priceSnapshot(listings, opts)
    expect(snap.sampleN).toBe(10) // 종전엔 5 — divine 만 세고 chaos 5개를 버렸다
    expect(snap.dropped).toBe(0)
  })

  it('exalted·divine 이 하나도 없어도 가격이 나온다 — 베렉 시리즈가 바로 이 경우였다', () => {
    const listings = [
      ...Array.from({ length: 4 }, () => ({ amount: 30, currency: 'alch' })),
      ...Array.from({ length: 4 }, () => ({ amount: 40, currency: 'regal' })),
    ]
    const snap = priceSnapshot(listings, opts)
    expect(snap).not.toBeNull() // 종전엔 null → 가격 필이 아예 안 떴다
    expect(snap.sampleN).toBe(8)
    expect(snap.valueDiv).toBeGreaterThan(0)
  })

  it('sampleN 이 실제로 쓴 매물 수와 같다 — 툴팁이 거짓말하지 않게', () => {
    const listings = [
      ...Array.from({ length: 6 }, () => ({ amount: 10, currency: 'chaos' })),
      ...Array.from({ length: 3 }, () => ({ amount: 50, currency: 'alch' })),
      { amount: 1, currency: '모르는화폐' },
    ]
    const snap = priceSnapshot(listings, opts)
    expect(snap.sampleN).toBe(9)
    expect(snap.dropped).toBe(1) // 환산 못 한 1개를 숨기지 않는다
  })

  it('원래 제시 화폐를 많은 순으로 담는다 — 환산값을 검증할 근거', () => {
    const listings = [
      ...Array.from({ length: 6 }, () => ({ amount: 10, currency: 'chaos' })),
      ...Array.from({ length: 2 }, () => ({ amount: 50, currency: 'alch' })),
      { amount: 1, currency: 'divine' },
    ]
    const snap = priceSnapshot(listings, opts)
    expect(snap.currencyMix).toEqual([
      { name: '카오스 오브', n: 6 },
      { name: '연금술의 오브', n: 2 },
      { name: '신성한 오브', n: 1 },
    ])
  })

  // 툴팁(.ba-tip)이 white-space: pre 라 줄바꿈이 없다 → 한 줄 길이를 상한 안에 묶어야 한다.
  it('화폐가 4종을 넘으면 상위 3종 + 기타로 접는다 — 툴팁 폭', () => {
    const listings = [
      ...Array.from({ length: 5 }, () => ({ amount: 1, currency: 'chaos' })),
      ...Array.from({ length: 4 }, () => ({ amount: 1, currency: 'alch' })),
      ...Array.from({ length: 3 }, () => ({ amount: 1, currency: 'regal' })),
      ...Array.from({ length: 2 }, () => ({ amount: 1, currency: 'divine' })),
      { amount: 1, currency: 'exalted' },
    ]
    const mix = priceSnapshot(listings, opts).currencyMix
    expect(mix).toHaveLength(4)
    expect(mix[3]).toEqual({ name: '기타', n: 3 }) // divine 2 + exalted 1
    // 접혀도 총합은 sampleN 과 맞는다 — 분포가 표본을 배신하지 않는다
    expect(mix.reduce((s, m) => s + m.n, 0)).toBe(15)
  })

  it('poe1 처럼 기본 화폐가 카오스여도 디바인값으로 환산된다', () => {
    // poe1 실측(2026-09-13): chaos_per_divine 773.33 · chaos_per_exalted 15.11
    const CPD = 773.33
    const p1 = (l) => ({ chaos: 1, exalted: 15.11, divine: CPD }[l.currency] || null)
    const snap = priceSnapshot(
      Array.from({ length: 6 }, () => ({ amount: 773.33, currency: 'chaos' })),
      { toBase: (l) => (p1(l) ? l.amount * p1(l) : null), basePerDivine: CPD, exaltedPerDivine: 62 },
    )
    expect(snap.valueDiv).toBeCloseTo(1.0, 2) // 종전엔 chaos 를 버려서 항상 null 이었다
    expect(snap.exaltedPerDivine).toBe(62)    // 표시는 엑잘 축(formatPrice 가 1디바인 미만을 엑잘로 바꾼다)
  })

  it('환산기가 전부 null 을 주면 null — 없는 가격을 지어내지 않는다', () => {
    const snap = priceSnapshot([{ amount: 5, currency: '모르는화폐' }], opts)
    expect(snap).toBeNull()
  })

  it('가격 자체가 없는 검색(빈 목록)은 null', () => {
    expect(priceSnapshot([], opts)).toBeNull()
  })

  it('환율이 없으면(폴백) 최빈 단위 한 종류로 산출 — formatPrice 가 라벨을 가진 둘만', () => {
    const listings = Array.from({ length: 6 }, () => ({ amount: 40, currency: 'exalted' }))
    const snap = priceSnapshot(listings, { exaltedPerDivine: 0 })
    expect(snap.unit).toBe('exalted')
    expect(snap.value).toBe(40)
  })

  it('환율도 환산기도 없고 ex·div 도 없으면 null — 빈칸이 뜨는 것보다 낫다', () => {
    expect(priceSnapshot([{ amount: 100, currency: 'chaos' }], {})).toBeNull()
  })
})
