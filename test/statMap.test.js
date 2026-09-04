import { describe, it, expect } from 'vitest'
import { buildStatMap, buildStatIdIndex } from '../src/lib/statMap.js'
import fixture from './fixtures/poe2-stats.json'

describe('buildStatMap', () => {
  it('result[].entries[]를 평탄화해 id→text', () => {
    const m = buildStatMap(fixture)
    expect(m['explicit.stat_life']).toBe('최대 생명 +#')
    expect(m['explicit.stat_fire_res']).toBe('화염 저항 +#%')
  })
  it('비정상 입력은 빈 맵', () => {
    expect(buildStatMap(null)).toEqual({})
    expect(buildStatMap({ result: 'x' })).toEqual({})
  })
})

describe('buildStatIdIndex — 문구로 stat id 를 되찾는다', () => {
  it('정규화한 문구를 키로 쓴다 (부호 무시)', () => {
    const idx = buildStatIdIndex({ 'explicit.stat_a': '화염 저항 +#%' })
    expect(idx.get('화염 저항 #%')).toBe('explicit.stat_a')
  })
  it('문구가 겹치면 먼저 온 것을 남긴다', () => {
    const idx = buildStatIdIndex({ 'explicit.stat_a': '정신력 #', 'explicit.stat_b': '정신력 #' })
    expect(idx.get('정신력 #')).toBe('explicit.stat_a')
  })
  it('빈 맵도 안전하다', () => {
    expect(buildStatIdIndex({}).size).toBe(0)
    expect(buildStatIdIndex(null).size).toBe(0)
  })
})
