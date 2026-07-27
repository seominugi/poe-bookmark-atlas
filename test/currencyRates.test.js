import { describe, it, expect } from 'vitest'
import { parseExaltedPerDivine, RatesCache, baseFromPrice, baseCurrencyOf, fmtCurAmount, itemsRate, indexItemsByName } from '../src/lib/currencyRates.js'

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
  const rd = { exchange_rates: { exalted_per_chaos: { price: 84 }, exalted_per_divine: { price: 715 }, divine_per_mirror: { price: 6666 } } }
  it('chaos → 엑잘', () => expect(baseFromPrice({ amount: 2, currency: 'chaos' }, rd, 'poe2')).toBe(168))
  it('divine → 엑잘 (소수 amount)', () => expect(baseFromPrice({ amount: 1.5, currency: 'divine' }, rd, 'poe2')).toBe(1072.5))
  it('mirror → 엑잘 (divine 경유 cross)', () => expect(baseFromPrice({ amount: 1, currency: 'mirror' }, rd, 'poe2')).toBe(6666 * 715))
  it('이미 엑잘이면 null(환산 불필요)', () => expect(baseFromPrice({ amount: 15, currency: 'exalted' }, rd, 'poe2')).toBeNull())
  it('미지원 화폐·환율 없음(items도 없음) → null', () => {
    expect(baseFromPrice({ amount: 1, currency: 'annul' }, rd, 'poe2')).toBeNull()
    expect(baseFromPrice({ amount: 1, currency: 'chaos' }, null, 'poe2')).toBeNull()
    expect(baseFromPrice({ amount: 1, currency: 'chaos' }, {}, 'poe2')).toBeNull()
    expect(baseFromPrice(null, rd, 'poe2')).toBeNull()
  })
})

describe('baseFromPrice(poe1) — 제시 가격 → 카오스 환산 (chaos 기준 키)', () => {
  const rd = { exchange_rates: { chaos_per_exalted: { price: 12 }, chaos_per_divine: { price: 102 }, exalted_per_divine: { price: 8.5 }, divine_per_mirror: { price: 5000 } } }
  it('exalted → 카오스', () => expect(baseFromPrice({ amount: 2, currency: 'exalted' }, rd, 'poe1')).toBe(24))
  it('divine → 카오스', () => expect(baseFromPrice({ amount: 1.5, currency: 'divine' }, rd, 'poe1')).toBe(153))
  it('mirror → 카오스 (divine 경유 cross)', () => expect(baseFromPrice({ amount: 1, currency: 'mirror' }, rd, 'poe1')).toBe(5000 * 102))
  it('이미 카오스면 null(환산 불필요)', () => expect(baseFromPrice({ amount: 10, currency: 'chaos' }, rd, 'poe1')).toBeNull())
})

describe('indexItemsByName — 경제 API items 색인', () => {
  // ⚠ 실제 응답의 items 키는 거래소 화폐 id가 아니라 Metadata 경로다(2026-07-27 실측, 818개 전부).
  //    예전 테스트가 짧은 키({chrome:{...}})를 가정해 프로덕션이 깨진 채로 통과했다 — 실제 형태로 고정한다.
  const items = {
    'Metadata/Items/Currency/CurrencyRerollSocketColours': { ko_name: '색채의 오브', category: '화폐', primary_currency: 'chaos', chaos: 1.40026, chaos_ask: 1.40026 },
    'Metadata/Items/Currency/CurrencyUpgradeToRare': { ko_name: '연금술의 오브', category: '화폐', primary_currency: 'divine', chaos: 0.05137, chaos_ask: 0.04 },
    'Metadata/Items/Currency/NoName': { category: '화폐', chaos: 9 },
  }

  it('Metadata 경로가 키여도 한글 이름으로 찾을 수 있다', () => {
    const idx = indexItemsByName(items)
    expect(idx['색채의 오브'].chaos).toBe(1.40026)
    expect(idx['연금술의 오브'].chaos).toBe(0.05137)
  })
  it('ko_name 없는 항목은 색인하지 않는다', () => {
    expect(Object.keys(indexItemsByName(items))).toEqual(['색채의 오브', '연금술의 오브'])
  })
  it('빈 입력에도 안전', () => {
    expect(indexItemsByName(null)).toEqual({})
    expect(indexItemsByName({})).toEqual({})
  })

  it('itemsRate: primary_currency가 기준화폐면 직접관찰 _ask 사용', () => {
    expect(itemsRate(indexItemsByName(items), '색채의 오브', 'chaos')).toBe(1.40026)
  })
  it('itemsRate: primary_currency가 다르면 top-level cross 값 사용', () => {
    expect(itemsRate(indexItemsByName(items), '연금술의 오브', 'chaos')).toBe(0.05137)
  })
  it('itemsRate: 없는 이름·필드 누락 → null', () => {
    const idx = indexItemsByName(items)
    expect(itemsRate(idx, '없는 오브', 'chaos')).toBeNull()
    expect(itemsRate(idx, '색채의 오브', 'divine')).toBeNull()
    expect(itemsRate(null, '색채의 오브', 'chaos')).toBeNull()
  })
})

describe('baseFromPrice — 큐레이션 밖 화폐를 한글명으로 이어 환산 (사용자 제보 재현)', () => {
  const rd = {
    exchange_rates: { chaos_per_exalted: { price: 12 } }, // 큐레이션엔 색채의 오브가 없다
    items: {
      'Metadata/Items/Currency/CurrencyRerollSocketColours': { ko_name: '색채의 오브', primary_currency: 'chaos', chaos: 1.40026, chaos_ask: 1.40026 },
      'Metadata/Items/Currency/CurrencyRerollRare': { ko_name: '카오스 오브', primary_currency: 'divine', chaos: 1.0665 },
    },
  }
  const names = { chrome: '색채의 오브', chaos: '카오스 오브', jewellers: '쥬얼러 오브' }

  it('색채의 오브 20개 → 카오스 환산 (스크린샷 사례)', () => {
    expect(baseFromPrice({ amount: 20, currency: 'chrome' }, rd, 'poe1', names)).toBeCloseTo(28.0052, 4)
  })
  it('기준화폐(카오스)는 환산하지 않는다 — 경제 데이터에 있어도', () => {
    expect(baseFromPrice({ amount: 7, currency: 'chaos' }, rd, 'poe1', names)).toBeNull()
  })
  it('경제 데이터에 없는 화폐는 조용히 미표시', () => {
    expect(baseFromPrice({ amount: 3, currency: 'jewellers' }, rd, 'poe1', names)).toBeNull()
  })
  it('한글명 맵이 아직 없으면 큐레이션 4종으로만 동작(로드 전 폴백)', () => {
    expect(baseFromPrice({ amount: 20, currency: 'chrome' }, rd, 'poe1')).toBeNull()
    expect(baseFromPrice({ amount: 2, currency: 'exalted' }, rd, 'poe1')).toBe(24) // 큐레이션은 그대로
  })
  it('큐레이션이 우선 — 이름 맵이 있어도 exchange_rates 값을 쓴다', () => {
    expect(baseFromPrice({ amount: 2, currency: 'exalted' }, rd, 'poe1', { exalted: '엑잘티드 오브' })).toBe(24)
  })
  it('poe2도 같은 방식(기준화폐 엑잘)', () => {
    const rd2 = { exchange_rates: {}, items: { 'Metadata/X': { ko_name: '색채의 오브', primary_currency: 'exalted', exalted: 0.5, exalted_ask: 0.5 } } }
    expect(baseFromPrice({ amount: 4, currency: 'chrome' }, rd2, 'poe2', names)).toBe(2)
  })
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
