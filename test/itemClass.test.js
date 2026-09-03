import { describe, it, expect } from 'vitest'
import { classFromCategory, classFromBaseName, classFromQuery, MOD_FILE_BY_CATEGORY, MOD_FILE_BY_POB_CLASS } from '../src/lib/itemClass.js'

const baseMap = { '루비 반지': ['Ruby Ring', 'Rings'], '황금 외투': ['Golden Mantle', 'Body Armours'] }

describe('classFromCategory', () => {
  it('구체 category 를 modifiers 파일명으로', () => {
    expect(classFromCategory('accessory.ring')).toBe('Ring')
    expect(classFromCategory('armour.chest')).toBe('Body_Armour')
    expect(classFromCategory('weapon.warstaff')).toBe('Warstaff')
    expect(classFromCategory('armour.focus')).toBe('Focus')
  })
  it('묶음 category 는 부위를 특정할 수 없다', () => {
    expect(classFromCategory('weapon')).toBe(null)
    expect(classFromCategory('armour')).toBe(null)
    expect(classFromCategory('weapon.onemelee')).toBe(null)
  })
  it('모르는 값은 null', () => {
    expect(classFromCategory(null)).toBe(null)
    expect(classFromCategory('nope')).toBe(null)
  })
})

describe('classFromBaseName', () => {
  it('베이스 이름 → PoB 클래스 → modifiers 파일명', () => {
    expect(classFromBaseName('루비 반지', baseMap)).toBe('Ring')
    expect(classFromBaseName('황금 외투', baseMap)).toBe('Body_Armour')
  })
  it('모르는 이름은 null', () => {
    expect(classFromBaseName('없는 아이템', baseMap)).toBe(null)
    expect(classFromBaseName(null, baseMap)).toBe(null)
  })
})

describe('classFromQuery — category 우선, 없으면 베이스 이름', () => {
  it('category 가 있으면 그것을 쓴다', () => {
    const q = { type: '루비 반지', filters: { type_filters: { filters: { category: { option: 'armour.chest' } } } } }
    expect(classFromQuery(q, baseMap)).toBe('Body_Armour')
  })
  it('category 가 없으면 베이스 이름으로', () => {
    expect(classFromQuery({ type: '루비 반지' }, baseMap)).toBe('Ring')
  })
  it('거래소가 type 을 객체로 줄 때도 읽는다 (변형 아이템)', () => {
    expect(classFromQuery({ type: { option: '루비 반지' } }, baseMap)).toBe('Ring')
  })
  it('둘 다 없으면 null', () => {
    expect(classFromQuery({}, baseMap)).toBe(null)
    expect(classFromQuery(null, baseMap)).toBe(null)
  })
})

describe('대응표 자체', () => {
  it('category 표에 묶음 항목이 섞이지 않았다', () => {
    for (const key of Object.keys(MOD_FILE_BY_CATEGORY)) {
      expect(key).toMatch(/\./) // 구체 category 는 항상 점을 포함한다 (jewel 은 예외로 아래에서 확인)
    }
  })
  it('PoB 클래스 표는 자동 단수화로 만들 수 없는 것들을 담는다', () => {
    expect(MOD_FILE_BY_POB_CLASS['Staves']).toBe('Staff')
    expect(MOD_FILE_BY_POB_CLASS['Quarterstaves']).toBe('Warstaff')
    expect(MOD_FILE_BY_POB_CLASS['Foci']).toBe('Focus')
    expect(MOD_FILE_BY_POB_CLASS['Life Flasks']).toBe('LifeFlask')
  })
})
