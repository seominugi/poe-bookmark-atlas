// 북마크 가격이 사라지던 경로를 **실제 BE 응답 구조로** 끝까지 재현한다.
//
// 제보(2026-09-13): 베렉의 손아귀·유예·길 세 북마크에 가격이 안 보인다. 같은 목록의 다른 북마크는 보인다.
// 원인은 스냅샷이 exalted·divine 만 인정한 것 — 사용자 리그(poe2 Forbidden Rites)에 실제로 쓰이는
// 화폐가 33종이라 **31종이 버려지고 있었다.**
//
// 이 파일이 지키는 것은 단위 함수가 아니라 **파이프라인 계약**이다:
//   거래소 매물 → (거래소 행 칩과 같은 환산기) → 스냅샷 → formatPrice → 화면 문자열
// 그래서 환산기를 흉내내지 않고 `baseFromPrice` 를 그대로 쓰고, 환율도 실측값을 쓴다.
import { describe, it, expect } from 'vitest'
import { priceSnapshot } from '../src/lib/priceSnapshot.js'
import { baseFromPrice, basePerDivineOf, baseCurrencyOf, parseExaltedPerDivine } from '../src/lib/currencyRates.js'
import { formatPrice } from '../src/lib/formatPrice.js'

// ── 2026-09-13 실측 (https://seominugi.com/api/poe2/currency-exchange?realmName=Forbidden_Rites) ──
// exchange_rates 는 큐레이션 3종(카오스·신성한·거울), 나머지는 items 맵(화폐 33종 포함 600항목).
const RATES_POE2 = {
  exchange_rates: {
    exalted_per_chaos: { price: 36.07964 },
    exalted_per_divine: { price: 327.55583 },
    chaos_per_divine: { price: 9.07869 },
    divine_per_mirror: { price: 1882.44 },
  },
  items: {
    // 키는 거래소 화폐 id 형태의 슬러그다(Metadata 경로가 아니다 — 2026-09-13 확인, 600/600).
    // 다만 환산은 ko_name 색인을 타므로 거래소 static API 의 한글명과 맞아야 한다.
    alch: { ko_name: '연금술의 오브', category: '화폐', primary_currency: 'divine', exalted: 2.08172 },
    regal: { ko_name: '제왕의 오브', category: '화폐', primary_currency: 'divine', exalted: 1.67008 },
    vaal: { ko_name: '바알 오브', category: '화폐', primary_currency: 'divine', exalted: 3.48771 },
    annul: { ko_name: '소멸의 오브', category: '화폐', primary_currency: 'divine', exalted: 161.29362 },
  },
}
// 거래소 static API 가 주는 화폐 id → 한글명 (ensureCurrencyStatic)
const CUR_NAMES = { alch: '연금술의 오브', regal: '제왕의 오브', vaal: '바알 오브', annul: '소멸의 오브', chaos: '카오스 오브', divine: '신성한 오브', exalted: '엑잘티드 오브' }

/** content-main.js 의 스냅샷 호출부와 **같은 조립**. 여기가 갈라지면 테스트가 거짓 안심을 준다. */
function snapshotOf(listings, { game = 'poe2', rateData = RATES_POE2, curNames = CUR_NAMES } = {}) {
  const base = baseCurrencyOf(game)
  const toBase = (l) => (String(l.currency || '').toLowerCase() === base
    ? (l.amount > 0 ? l.amount : null)
    : baseFromPrice(l, rateData, game, curNames))
  return priceSnapshot(listings, {
    toBase,
    basePerDivine: basePerDivineOf(rateData, game),
    exaltedPerDivine: (rateData ? parseExaltedPerDivine(rateData) : 0) || 0,
    nameOf: (id) => (curNames && curNames[id]) || id,
  })
}
const rep = (n, price) => Array.from({ length: n }, () => price)

describe('제보 재현 — 엑잘·디바인이 아닌 화폐로만 올라온 매물', () => {
  it('연금술의 오브로만 매겨진 검색에 가격이 나온다', () => {
    const snap = snapshotOf(rep(8, { amount: 30, currency: 'alch' }))
    expect(snap, '종전엔 null 이라 가격 필이 아예 안 떴다').not.toBeNull()
    expect(snap.sampleN).toBe(8)
    // 30 연금술 × 2.08172 엑잘 = 62.45 엑잘 → / 327.556 = 0.1906 디바인
    expect(snap.valueDiv).toBeCloseTo(30 * 2.08172 / 327.55583, 4)
  })

  it('제왕의 오브 — 사용자가 직접 지목한 화폐', () => {
    const snap = snapshotOf(rep(6, { amount: 50, currency: 'regal' }))
    expect(snap).not.toBeNull()
    expect(snap.currencyMix).toEqual([{ name: '제왕의 오브', n: 6 }])
  })

  it('연금술·제왕·바알·카오스가 섞여도 전부 센다', () => {
    const snap = snapshotOf([
      ...rep(4, { amount: 40, currency: 'alch' }),
      ...rep(3, { amount: 60, currency: 'regal' }),
      ...rep(2, { amount: 20, currency: 'vaal' }),
      ...rep(1, { amount: 3, currency: 'chaos' }),
    ])
    expect(snap.sampleN).toBe(10) // 종전엔 0 — 넷 다 버려져 null 이었다
    expect(snap.dropped).toBe(0)
    // 상위 3종 + 기타(카오스 1) — 툴팁 한 줄 길이를 묶기 위한 접기(priceSnapshot.currencyMix 주석)
    expect(snap.currencyMix).toEqual([
      { name: '연금술의 오브', n: 4 },
      { name: '제왕의 오브', n: 3 },
      { name: '바알 오브', n: 2 },
      { name: '기타', n: 1 },
    ])
  })

  it('섞인 목록에서 sampleN 이 더는 거짓말하지 않는다', () => {
    const listings = [...rep(8, { amount: 100, currency: 'chaos' }), ...rep(3, { amount: 2, currency: 'divine' })]
    const snap = snapshotOf(listings)
    expect(snap.sampleN).toBe(11) // 종전엔 3 — divine 만 세고 chaos 8개를 조용히 버렸다
  })
})

describe('화면에 실제로 찍히는 문자열', () => {
  it('싼 아이템은 엑잘로 보인다 — 1 디바인 미만은 formatPrice 가 엑잘로 바꾼다', () => {
    const snap = snapshotOf(rep(8, { amount: 30, currency: 'alch' }))
    expect(formatPrice(snap)).toMatch(/^≈ \d+(\.\d)? ex$/)
  })

  it('비싼 아이템은 디바인으로 보인다', () => {
    const snap = snapshotOf(rep(8, { amount: 5, currency: 'divine' }))
    expect(formatPrice(snap)).toBe('≈ 5 div')
  })

  it('환산 불가 매물만 있으면 빈 문자열 — 없는 가격을 지어내지 않는다', () => {
    const snap = snapshotOf(rep(3, { amount: 1, currency: '없는화폐' }))
    expect(snap).toBeNull()
    expect(formatPrice(snap || {})).toBe('')
  })
})

describe('화폐 한글명 맵이 아직 안 왔을 때 (첫 검색 경합)', () => {
  it('items 맵 화폐는 빠지지만 큐레이션 화폐로는 여전히 가격이 나온다', () => {
    const snap = snapshotOf([...rep(5, { amount: 3, currency: 'chaos' }), ...rep(4, { amount: 30, currency: 'alch' })], { curNames: null })
    expect(snap).not.toBeNull()
    expect(snap.sampleN).toBe(5)
    expect(snap.dropped).toBe(4) // 빠진 것을 숨기지 않는다 → 툴팁이 "4개는 제외했어요" 라고 말한다
  })

  it('맵이 오면 같은 목록이 전부 계산된다 — 그래서 호출부가 await 한다', () => {
    const listings = [...rep(5, { amount: 3, currency: 'chaos' }), ...rep(4, { amount: 30, currency: 'alch' })]
    expect(snapshotOf(listings, { curNames: null }).sampleN).toBe(5)
    expect(snapshotOf(listings).sampleN).toBe(9)
  })
})

describe('poe1 — 기본 화폐가 카오스', () => {
  // 2026-09-13 실측 (poe1 Standard): primary_unit=chaos
  const RATES_POE1 = {
    exchange_rates: {
      chaos_per_exalted: { price: 15.11111 },
      chaos_per_divine: { price: 773.33333 },
      exalted_per_divine: { price: 62 },
      divine_per_mirror: { price: 1611.90909 },
    },
    items: {},
  }
  it('카오스로 매겨진 매물에 가격이 나온다 — 종전엔 poe1 이 사실상 항상 null 이었다', () => {
    const snap = snapshotOf(rep(6, { amount: 773.33333, currency: 'chaos' }), { game: 'poe1', rateData: RATES_POE1 })
    expect(snap).not.toBeNull()
    expect(snap.valueDiv).toBeCloseTo(1, 3)
    expect(formatPrice(snap)).toBe('≈ 1 div')
  })
  it('엑잘·디바인도 같은 축으로 섞인다', () => {
    const snap = snapshotOf([
      ...rep(4, { amount: 1546.66666, currency: 'chaos' }),
      ...rep(4, { amount: 2, currency: 'divine' }),
    ], { game: 'poe1', rateData: RATES_POE1 })
    expect(snap.sampleN).toBe(8)
    expect(snap.valueDiv).toBeCloseTo(2, 2)
  })
})
