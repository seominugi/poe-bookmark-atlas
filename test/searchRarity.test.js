import { describe, it, expect } from 'vitest'
import { rarityOfQuery, rarityOfItem } from '../src/lib/searchRarity.js'

const withRarity = (option) => ({ query: { filters: { type_filters: { filters: { rarity: { option } } } } } })

describe('rarityOfQuery', () => {
  it('희귀도 필터로 가른다 — 바디와 query 모두 받는다', () => {
    expect(rarityOfQuery(withRarity('unique'))).toBe('unique')
    expect(rarityOfQuery(withRarity('uniquefoil'))).toBe('unique')
    expect(rarityOfQuery(withRarity('nonunique'))).toBe('nonunique')
    expect(rarityOfQuery(withRarity('rare').query)).toBe('nonunique')
  })
  it('희귀도가 없어도 이름을 지정했으면 고유 검색이다', () => {
    expect(rarityOfQuery({ query: { name: '베렉의 손아귀', type: '가죽 벨트' } })).toBe('unique')
    expect(rarityOfQuery({ query: { name: { option: 'x', discriminator: 'y' } } })).toBe('unique')
  })
  it('모르면 null — 희귀도 「모두」, 조건 없음', () => {
    expect(rarityOfQuery(withRarity(null))).toBeNull()
    expect(rarityOfQuery({ query: { type: '루비' } })).toBeNull()
    expect(rarityOfQuery(null)).toBeNull()
    expect(rarityOfQuery(undefined)).toBeNull()
  })
})

describe('rarityOfItem', () => {
  it('매물의 rarity', () => {
    expect(rarityOfItem({ rarity: 'Unique' })).toBe('unique')
    expect(rarityOfItem({ rarity: 'Rare' })).toBe('nonunique')
    expect(rarityOfItem({})).toBeNull()
  })
})
