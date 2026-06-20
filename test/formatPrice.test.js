import { describe, it, expect } from 'vitest'
import { formatPrice } from '../src/lib/formatPrice.js'

describe('formatPrice', () => {
  it('1 div 이상은 div로 표시', () => {
    expect(formatPrice({ valueDiv: 2.34, exaltedPerDivine: 200 })).toBe('≈ 2.3 div')
  })
  it('정확히 1 div는 div', () => {
    expect(formatPrice({ valueDiv: 1, exaltedPerDivine: 200 })).toBe('≈ 1 div')
  })
  it('1 div 미만은 ex로 환산 표시', () => {
    // 0.4 div × 200 = 80 ex
    expect(formatPrice({ valueDiv: 0.4, exaltedPerDivine: 200 })).toBe('≈ 80 ex')
  })
  it('환율 폴백: 이미 단위가 정해진 경우 그대로', () => {
    expect(formatPrice({ value: 55, unit: 'exalted' })).toBe('≈ 55 ex')
    expect(formatPrice({ value: 3.2, unit: 'divine' })).toBe('≈ 3.2 div')
  })
  it('값 없으면 빈 문자열', () => {
    expect(formatPrice({})).toBe('')
  })
})
