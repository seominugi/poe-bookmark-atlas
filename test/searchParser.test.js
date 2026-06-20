import { describe, it, expect } from 'vitest'
import { parseSearchQuery } from '../src/lib/searchParser.js'
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
})
