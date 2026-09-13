import { describe, it, expect } from 'vitest'
import { buildFilterMap, parseQueryFilters } from '../src/lib/filterMap.js'

const META = buildFilterMap({
  result: [
    {
      id: 'type_filters',
      filters: [
        { id: 'category', text: '아이템 유형', option: { options: [{ id: 'accessory.ring', text: '반지' }] } },
        { id: 'ilvl', text: '아이템 레벨' },
      ],
    },
    {
      id: 'trade_filters',
      filters: [
        { id: 'price', text: '가격', option: { options: [{ id: 'divine', text: '신성한 오브' }] } },
        { id: 'status', text: '판매 상태' },
      ],
    },
  ],
})

describe('buildFilterMap', () => {
  it('필터 id→라벨, 옵션 id→텍스트 매핑', () => {
    expect(META.label.ilvl).toBe('아이템 레벨')
    expect(META.options.category['accessory.ring']).toBe('반지')
  })

  // 거래소는 '모두' 를 { id: null, text: '모두' } 로 준다. 이걸 빼면 화면에서 '모두' 를 읽어도
  // 무엇인지 모른다 — 티어 칩이 유형을 '모두' 로 되돌린 걸 알아채지 못하고 옛 부위 칩을 남겼다.
  it("id 가 null 인 옵션('모두')도 'null' 키로 담는다", () => {
    const m = buildFilterMap({
      result: [{ id: 'type_filters', filters: [{ id: 'category', text: '아이템 유형', option: { options: [{ id: null, text: '모두' }, { id: 'armour.chest', text: '갑옷' }] } }] }],
    })
    expect(m.options.category).toEqual({ null: '모두', 'armour.chest': '갑옷' })
  })

  it("'null' 키가 있어도 검색 조건 요약은 '모두'(무필터)를 여전히 뺀다", () => {
    const m = buildFilterMap({
      result: [{ id: 'type_filters', filters: [{ id: 'category', text: '아이템 유형', option: { options: [{ id: null, text: '모두' }] } }] }],
    })
    expect(parseQueryFilters({ filters: { type_filters: { filters: { category: { option: null } } } } }, m)).toEqual([])
  })
})

describe('parseQueryFilters', () => {
  it('옵션·범위·가격을 한글 라벨:값으로 (status 등 메타는 제외)', () => {
    const q = {
      filters: {
        type_filters: { filters: { category: { option: 'accessory.ring' }, ilvl: { min: 80 } } },
        trade_filters: { filters: { price: { min: 1, max: 5, option: 'divine' }, status: { option: 'online' } } },
      },
    }
    expect(parseQueryFilters(q, META)).toEqual([
      { key: 'category', label: '아이템 유형', value: '반지' },
      { key: 'ilvl', label: '아이템 레벨', value: '≥80' },
      { key: 'price', label: '가격', value: '1~5 신성한 오브' },
    ])
  })
  it('option=null(모두)·필터 없음은 제외', () => {
    expect(parseQueryFilters({ filters: { type_filters: { filters: { category: { option: null } } } } }, META)).toEqual([])
    expect(parseQueryFilters({}, META)).toEqual([])
  })
})
