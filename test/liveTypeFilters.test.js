import { describe, it, expect } from 'vitest'
import { optionIdByText, applyLiveTypeFilters } from '../src/lib/liveTypeFilters.js'
import { classFromQuery } from '../src/lib/itemClass.js'

// buildFilterMap 결과 모양 — 옵션 id 는 문자열로 저장되고 '모두' 는 'null' 이다.
const filterMap = {
  label: { category: '아이템 유형', ilvl: '아이템 레벨' },
  options: { category: { null: '모두', 'armour.chest': '갑옷', 'armour.helmet': '투구', weapon: '모든 무기' } },
}

describe('optionIdByText — 화면 텍스트 → 거래소 옵션 id', () => {
  it('표시 텍스트로 id 를 찾는다', () => {
    expect(optionIdByText(filterMap, 'category').get('갑옷')).toBe('armour.chest')
  })
  it("'모두' 는 문자열 'null' 이 아니라 진짜 null 이다", () => {
    const m = optionIdByText(filterMap, 'category')
    expect(m.has('모두')).toBe(true)
    expect(m.get('모두')).toBeNull()
  })
  it('필터 맵이 아직 없으면 빈 맵', () => {
    expect(optionIdByText({ label: {}, options: {} }, 'category').size).toBe(0)
    expect(optionIdByText(null, 'category').size).toBe(0)
  })
})

describe('applyLiveTypeFilters — 화면에서 읽은 값으로 검색 조건을 덮는다', () => {
  const stale = {
    type: '',
    filters: { type_filters: { filters: { category: { option: 'accessory.ring' }, ilvl: { min: 1, max: 82 } } } },
  }

  it('화면에서 아무것도 확정 못 했으면 검색 조건을 그대로 돌려준다', () => {
    const live = { category: { status: 'none' }, ilvlMax: { status: 'ambiguous' } }
    expect(applyLiveTypeFilters(stale, live)).toBe(stale)
  })

  it('화면의 유형이 마지막 검색의 유형을 이긴다', () => {
    const q = applyLiveTypeFilters(stale, { category: { status: 'ok', id: 'armour.chest' }, ilvlMax: { status: 'none' } })
    expect(q.filters.type_filters.filters.category.option).toBe('armour.chest')
    expect(classFromQuery(q, null)).toBe('Body_Armour') // 기존 판정 함수에 그대로 흘러간다
  })

  it("화면이 '모두' 면 유형을 지운다 — 마지막 검색의 유형이 남으면 안 된다", () => {
    const q = applyLiveTypeFilters(stale, { category: { status: 'ok', id: null }, ilvlMax: { status: 'none' } })
    expect(q.filters.type_filters.filters.category).toBeUndefined()
    expect(classFromQuery(q, null)).toBeNull()
  })

  it('한 번도 검색하지 않았어도(검색 조건 null) 화면 값으로 판정한다', () => {
    const q = applyLiveTypeFilters(null, { category: { status: 'ok', id: 'armour.helmet' }, ilvlMax: { status: 'none' } })
    expect(classFromQuery(q, null)).toBe('Helmet')
  })

  it('아이템 레벨 최대를 덮고 최소는 지킨다', () => {
    const q = applyLiveTypeFilters(stale, { category: { status: 'none' }, ilvlMax: { status: 'ok', value: 60 } })
    expect(q.filters.type_filters.filters.ilvl).toEqual({ min: 1, max: 60 })
  })

  it('화면의 최대칸이 비어 있으면 상한을 지운다', () => {
    const q = applyLiveTypeFilters(stale, { category: { status: 'none' }, ilvlMax: { status: 'ok', value: null } })
    expect(q.filters.type_filters.filters.ilvl.max).toBeUndefined()
    expect(q.filters.type_filters.filters.ilvl.min).toBe(1)
  })

  it('원본 검색 조건을 건드리지 않는다 — 검색 조건 툴팁·북마크 저장이 같은 객체를 쓴다', () => {
    const before = JSON.stringify(stale)
    applyLiveTypeFilters(stale, { category: { status: 'ok', id: null }, ilvlMax: { status: 'ok', value: null } })
    expect(JSON.stringify(stale)).toBe(before)
  })

  it('검색창의 베이스 이름(type)은 그대로 둔다', () => {
    const q = applyLiveTypeFilters({ type: '파란 진주 목걸이' }, { category: { status: 'ok', id: null }, ilvlMax: { status: 'none' } })
    expect(q.type).toBe('파란 진주 목걸이')
  })
})
