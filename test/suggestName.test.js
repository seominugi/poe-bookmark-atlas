import { describe, it, expect } from 'vitest'
import { suggestName } from '../src/lib/suggestName.js'

describe('suggestName', () => {
  it('유니크 아이템명 우선', () => {
    expect(suggestName({ name: '카오스의 인장', stats: ['생명'], title: 't' })).toBe('카오스의 인장')
  })
  it('유형 + 능력치 필터 → "{유형} - 능력치 필터"', () => {
    expect(suggestName({ itemType: '목걸이', stats: ['생명'], title: 't' })).toBe('목걸이 - 능력치 필터')
    expect(suggestName({ itemType: '갑옷', statGroups: [{ filters: ['x'] }], title: 't' })).toBe('갑옷 - 능력치 필터')
  })
  it('유형만 있고 능력치 필터 없으면 유형만', () => {
    expect(suggestName({ itemType: '반지', title: 't' })).toBe('반지')
  })
  it('이름 없으면 핵심 스탯 2개를 · 로 결합', () => {
    expect(suggestName({ stats: ['어둠 저항', '화염 저항', '생명'], title: 't' })).toBe('어둠 저항 · 화염 저항')
  })
  it('이름·스탯 없으면 title', () => {
    expect(suggestName({ title: '목걸이 검색' })).toBe('목걸이 검색')
  })
  it('빈 입력은 기본 폴백', () => {
    expect(suggestName(null)).toBe('북마크')
    expect(suggestName({})).toBe('북마크')
  })
})
