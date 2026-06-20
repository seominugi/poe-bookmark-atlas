import { describe, it, expect } from 'vitest'
import { buildStatMap } from '../src/lib/statMap.js'
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
