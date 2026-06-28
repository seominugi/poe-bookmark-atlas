import { describe, it, expect } from 'vitest'
import { buildAutoNote } from '../src/lib/autoNote.js'

describe('buildAutoNote', () => {
  it('유형·비능력치 필터·능력치 개수 한 줄 (category는 유형과 중복이라 제외)', () => {
    const r = {
      itemType: '반지',
      otherFilters: [
        { key: 'category', label: '아이템 유형', value: '반지' },
        { key: 'ilvl', label: '아이템 레벨', value: '≥80' },
        { key: 'price', label: '가격', value: '≥1 디바인' },
      ],
      stats: ['a', 'b', 'c', 'd'],
    }
    expect(buildAutoNote(r)).toBe('반지 · 아이템 레벨 ≥80 · 가격 ≥1 디바인 · 능력치 4개')
  })
  it('필터 없으면 유형·개수만 / 빈 입력은 빈 문자열', () => {
    expect(buildAutoNote({ itemType: '목걸이', stats: ['x'] })).toBe('목걸이 · 능력치 1개')
    expect(buildAutoNote(null)).toBe('')
    expect(buildAutoNote({})).toBe('')
  })
})
