import { describe, it, expect } from 'vitest'
import { parseSearchQuery, searchIdentity } from '../src/lib/searchParser.js'
import fixture from './fixtures/poe2-search-query.json'

const statMap = { 'explicit.stat_life': '최대 생명', 'explicit.stat_fire_res': '화염 저항' }

describe('parseSearchQuery', () => {
  it('타입/이름으로 제목 구성', () => {
    expect(parseSearchQuery(fixture, statMap).title).toBe('Body Armour')
  })
  it('스탯 id를 한글 텍스트로', () => {
    expect(parseSearchQuery(fixture, statMap).stats).toEqual(['최대 생명', '화염 저항'])
  })
  it('매핑 없는 stat은 id 일부로 폴백', () => {
    expect(parseSearchQuery(fixture, {}).stats[0]).toContain('stat_life')
  })
  it('가격 필터 추출', () => {
    expect(parseSearchQuery(fixture, statMap).priceFilter).toEqual({ min: null, max: 3, currency: 'divine' })
  })
  it('정렬이 가격 오름차순인지', () => {
    expect(parseSearchQuery(fixture, statMap).sortIsPriceAsc).toBe(true)
  })
  it('name이 있으면 제목 우선', () => {
    const q = { query: { name: 'Astramentis', type: 'Amulet', stats: [] } }
    expect(parseSearchQuery(q, statMap).title).toBe('Astramentis')
  })
  it('statGroups: 그룹 타입을 한글 라벨로 보존', () => {
    const r = parseSearchQuery(fixture, statMap)
    expect(r.statGroups).toEqual([{ type: 'and', label: '및', filters: ['최대 생명', '화염 저항'] }])
  })
  it('statGroups: 여러 그룹 타입(및·제외·숫자)과 count 최소값 라벨', () => {
    const q = { query: { stats: [
      { type: 'and', filters: [{ id: 'explicit.stat_life' }] },
      { type: 'not', filters: [{ id: 'explicit.stat_fire_res' }] },
      { type: 'count', value: { min: 2 }, filters: [{ id: 'explicit.stat_life' }, { id: 'explicit.stat_fire_res' }] },
    ] } }
    const r = parseSearchQuery(q, statMap)
    expect(r.statGroups.map((g) => g.label)).toEqual(['및', '제외', '숫자 ≥2'])
    expect(r.stats).toEqual(['최대 생명', '화염 저항', '최대 생명', '화염 저항'])
  })
  it('빈 필터 그룹은 statGroups에서 제외', () => {
    const q = { query: { stats: [{ type: 'and', filters: [] }, { type: 'not', filters: [{ id: 'explicit.stat_life' }] }] } }
    expect(parseSearchQuery(q, statMap).statGroups.map((g) => g.label)).toEqual(['제외'])
  })
})

describe('searchIdentity (조건 동일성 — 히스토리 중복 제거)', () => {
  it('필터 순서·키 순서가 달라도 같은 조건이면 동일 키', () => {
    const a = { query: { type: 'Amulet', stats: [{ type: 'and', filters: [{ id: 's1', value: { min: 1 } }, { id: 's2' }] }] } }
    const b = { query: { stats: [{ type: 'and', filters: [{ id: 's2' }, { id: 's1', value: { min: 1 } }] }], type: 'Amulet' } }
    expect(searchIdentity(a)).toBe(searchIdentity(b))
  })
  it('값(min/max)이 다르면 다른 키', () => {
    const a = { query: { stats: [{ type: 'and', filters: [{ id: 's1', value: { min: 80 } }] }] } }
    const b = { query: { stats: [{ type: 'and', filters: [{ id: 's1', value: { min: 100 } }] }] } }
    expect(searchIdentity(a)).not.toBe(searchIdentity(b))
  })
  it('가격·타입·그룹 타입을 반영', () => {
    const a = { query: { type: 'Ring', filters: { trade_filters: { filters: { price: { max: 3, option: 'divine' } } } }, stats: [{ type: 'not', filters: [{ id: 's1' }] }] } }
    const b = { query: { type: 'Ring', filters: { trade_filters: { filters: { price: { max: 3, option: 'divine' } } } }, stats: [{ type: 'and', filters: [{ id: 's1' }] }] } }
    expect(searchIdentity(a)).not.toBe(searchIdentity(b)) // and vs not
  })
})
