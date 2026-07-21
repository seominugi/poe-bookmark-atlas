// test/tradeSearch.test.js — 리그 이관(저장된 조건을 현재 리그로 재검색)용 순수 헬퍼
import { describe, it, expect } from 'vitest'
import { searchApiPath, searchResultPath, isSafeSearchId, sanitizeQuery } from '../src/lib/tradeSearch.js'

describe('searchApiPath', () => {
  it('poe2는 /api/trade2/search/poe2/<리그>', () => {
    expect(searchApiPath('poe2', 'Standard')).toBe('/api/trade2/search/poe2/Standard')
  })
  it('poe1은 /api/trade/search/<리그>', () => {
    expect(searchApiPath('poe1', 'Standard')).toBe('/api/trade/search/Standard')
  })
  it('리그명을 URL 인코딩한다(공백·한글 리그)', () => {
    expect(searchApiPath('poe2', 'Rise of the Abyssal')).toBe('/api/trade2/search/poe2/Rise%20of%20the%20Abyssal')
    expect(searchApiPath('poe1', '허상')).toBe('/api/trade/search/%ED%97%88%EC%83%81')
  })
  it('리그가 비면 Standard로 폴백', () => {
    expect(searchApiPath('poe2', '')).toBe('/api/trade2/search/poe2/Standard')
  })
})

describe('searchResultPath', () => {
  it('poe2 결과 URL 경로', () => {
    expect(searchResultPath('poe2', 'Standard', 'abc123')).toBe('/trade2/search/poe2/Standard/abc123')
  })
  it('poe1 결과 URL 경로', () => {
    expect(searchResultPath('poe1', '허상', 'abc123')).toBe('/trade/search/%ED%97%88%EC%83%81/abc123')
  })
})

describe('isSafeSearchId', () => {
  it('영숫자·하이픈·밑줄만 통과', () => {
    expect(isSafeSearchId('0aB3nEjTv')).toBe(true)
    expect(isSafeSearchId('a-b_c')).toBe(true)
  })
  it('경로 조작·프로토콜 문자는 차단', () => {
    expect(isSafeSearchId('../../evil')).toBe(false)
    expect(isSafeSearchId('a/b')).toBe(false)
    expect(isSafeSearchId('javascript:alert(1)')).toBe(false)
    expect(isSafeSearchId('a?b=1')).toBe(false)
  })
  it('빈 값·비문자열·과도한 길이는 차단', () => {
    expect(isSafeSearchId('')).toBe(false)
    expect(isSafeSearchId(null)).toBe(false)
    expect(isSafeSearchId(123)).toBe(false)
    expect(isSafeSearchId('a'.repeat(65))).toBe(false)
  })
})

describe('sanitizeQuery', () => {
  const body = { query: { status: { option: 'online' }, stats: [{ type: 'and', filters: [] }] }, sort: { price: 'asc' } }

  it('정상 바디는 query·sort를 보존해 통과', () => {
    const r = sanitizeQuery(body)
    expect(r.ok).toBe(true)
    expect(r.query.query.status.option).toBe('online')
    expect(r.query.sort).toEqual({ price: 'asc' })
  })
  it('허용 외 최상위 키는 제거한다(가져온 데이터 방어)', () => {
    const r = sanitizeQuery({ ...body, evil: { drop: 1 }, redirect: 'https://evil.example' })
    expect(r.ok).toBe(true)
    expect(Object.keys(r.query).sort()).toEqual(['query', 'sort'])
  })
  it('query가 없거나 객체가 아니면 거부', () => {
    expect(sanitizeQuery(null).ok).toBe(false)
    expect(sanitizeQuery({}).ok).toBe(false)
    expect(sanitizeQuery({ query: 'x' }).ok).toBe(false)
    expect(sanitizeQuery({ query: [] }).ok).toBe(false)
    expect(sanitizeQuery([{ query: {} }]).ok).toBe(false)
  })
  it('sort가 객체가 아니면 sort만 버리고 통과', () => {
    const r = sanitizeQuery({ query: { a: 1 }, sort: 'price' })
    expect(r.ok).toBe(true)
    expect(r.query.sort).toBeUndefined()
  })
  it('직렬화 상한(기본 20KB)을 넘으면 거부', () => {
    const r = sanitizeQuery({ query: { name: 'x'.repeat(21000) } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('size')
  })
  it('상한은 인자로 조절 가능', () => {
    expect(sanitizeQuery({ query: { name: 'xxxxxxxxxx' } }, 10).ok).toBe(false)
  })
  it('순환 참조는 거부(직렬화 불가)', () => {
    const cyc = { query: {} }
    cyc.query.self = cyc
    expect(sanitizeQuery(cyc).ok).toBe(false)
  })
  it('함수·undefined는 JSON 왕복으로 제거된다', () => {
    const r = sanitizeQuery({ query: { keep: 1, fn: () => {}, u: undefined } })
    expect(r.ok).toBe(true)
    expect(r.query.query).toEqual({ keep: 1 })
  })
})
