import { describe, it, expect } from 'vitest'
import { normalizeTradeText, normalizeModText } from '../src/lib/statTextNorm.js'

describe('normalizeTradeText — 거래소 문구', () => {
  it('부호를 뗀다', () => {
    expect(normalizeTradeText('화염 저항 +#%')).toBe('화염 저항 #%')
    expect(normalizeTradeText('생명력 최대치 +#')).toBe('생명력 최대치 #')
  })
  it('공백을 정리한다', () => {
    expect(normalizeTradeText('  화염 저항  #% ')).toBe('화염 저항 #%')
  })
})

describe('normalizeModText — 게임 문구', () => {
  it('괄호 범위를 슬롯으로 바꾼다', () => {
    expect(normalizeModText('화염 저항 (30-35)%', 1)).toBe('화염 저항 #%')
  })
  it('물결 범위는 슬롯 둘', () => {
    expect(normalizeModText('공격 시 화염 피해 1~2 추가', 2)).toBe('공격 시 화염 피해 #~# 추가')
  })
  it('고정 숫자와 괄호 범위가 섞인 물결도 슬롯 둘 (PoE2 흔한 형태)', () => {
    expect(normalizeModText('공격 시 냉기 피해 1~(2-3) 추가', 2)).toBe('공격 시 냉기 피해 #~# 추가')
  })
  it('슬롯 수가 모자라면 남은 상수를 슬롯으로 올린다', () => {
    expect(normalizeModText('모든 근접 스킬 레벨 1', 1)).toBe('모든 근접 스킬 레벨 #')
  })
  it('슬롯이 이미 찼으면 남은 상수는 건드리지 않는다', () => {
    expect(normalizeModText('1초마다 생명력 (60-120) 재생', 1)).toBe('1초마다 생명력 # 재생')
  })
  it('슬롯 수를 모르면(0) 상수 승격을 하지 않는다', () => {
    expect(normalizeModText('지역에 심연 1개 추가 등장', 0)).toBe('지역에 심연 1개 추가 등장')
  })
})
