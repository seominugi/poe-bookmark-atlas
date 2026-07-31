import { describe, it, expect } from 'vitest'
import { parseSearchQuery, searchIdentity, structuralIdentity, findNearDuplicate, formatStatText } from '../src/lib/searchParser.js'
import fixture from './fixtures/poe2-search-query.json'

const statMap = { 'explicit.stat_life': '최대 생명', 'explicit.stat_fire_res': '화염 저항' }

describe('parseSearchQuery', () => {
  it('타입/이름으로 제목 구성', () => {
    expect(parseSearchQuery(fixture, statMap).title).toBe('Body Armour')
  })
  it('스탯 id를 한글 텍스트로 (평탄 stats는 값 없이 — 구조·검색·개수용)', () => {
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
  it('statGroups: 그룹 타입 라벨 + 능력치 텍스트·입력 수치({text,value}) 보존', () => {
    const r = parseSearchQuery(fixture, statMap)
    expect(r.statGroups).toEqual([{ type: 'and', label: '및', filters: [
      { text: '최대 생명', value: '≥80' }, { text: '화염 저항', value: '≥30' },
    ] }])
  })
  it('능력치 값 포맷: min만 → ≥N, 범위 → a~b, max만 → ≤b, 없음 → 빈값', () => {
    const q = { query: { stats: [{ type: 'and', filters: [
      { id: 'explicit.stat_life', value: { min: 80 } },
      { id: 'explicit.stat_fire_res', value: { min: 20, max: 40 } },
      { id: 'a', value: { max: 5 } },
      { id: 'b' },
    ] }] } }
    expect(parseSearchQuery(q, statMap).statGroups[0].filters.map((f) => f.value)).toEqual(['≥80', '20~40', '≤5', ''])
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
  it('변형(discriminator) 아이템: name·type이 객체여도 문자열로 (→ "[object Object]" 방지)', () => {
    const q = { query: { name: { discriminator: 'warlord', option: '해안 교두보' }, type: { discriminator: 'warlord', option: '선구자의 지도' } } }
    const r = parseSearchQuery(q, statMap)
    expect(r.name).toBe('해안 교두보')
    expect(r.itemType).toBe('선구자의 지도')
    expect(r.title).toBe('해안 교두보')
  })
  it('알 수 없는 형태의 name 객체는 버린다(폴백 유지)', () => {
    const q = { query: { name: { foo: 1 }, type: '목걸이' } }
    const r = parseSearchQuery(q, statMap)
    expect(r.name).toBe(null)
    expect(r.title).toBe('목걸이')
  })
})

describe('formatStatText — 능력치 텍스트에 입력 수치 결합', () => {
  it('# 를 값으로 치환 (min만 → ≥40)', () => {
    expect(formatStatText({ text: '화염 저항 #%', value: '≥40' })).toBe('화염 저항 ≥40%')
  })
  it('# 없으면 뒤에 붙임', () => {
    expect(formatStatText({ text: '최대 생명', value: '≥80' })).toBe('최대 생명 ≥80')
  })
  it('값 없으면 텍스트 그대로', () => {
    expect(formatStatText({ text: '얼음 저항 #%', value: '' })).toBe('얼음 저항 #%')
  })
  it('구 레코드(문자열 filters) 호환', () => {
    expect(formatStatText('물리 피해 #')).toBe('물리 피해 #')
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

describe('searchIdentity — 비-능력치 필터 반영 (중복 저장 오판 수정)', () => {
  it('범위 필터(min/max) 값만 달라도 다른 키 — 경로석 확률 15 vs 120', () => {
    const mk = (v) => ({ query: { type: 'Waystone', stats: [{ type: 'and', filters: [{ id: 's1', value: { min: 40 } }] }],
      filters: { misc_filters: { filters: { map_iiq: { min: v } } } } } })
    expect(searchIdentity(mk(15))).not.toBe(searchIdentity(mk(120)))
  })
  it('옵션 필터 값만 달라도 다른 키 — 등급 옵션', () => {
    const mk = (opt) => ({ query: { type: 'Waystone', filters: { map_filters: { filters: { map_tier: { option: opt } } } } } })
    expect(searchIdentity(mk('15'))).not.toBe(searchIdentity(mk('16')))
  })
  it('타락(option) 유무가 반영 — true vs 필터 없음', () => {
    const withCorrupt = { query: { type: 'Ring', filters: { misc_filters: { filters: { corrupted: { option: 'true' } } } } } }
    const without = { query: { type: 'Ring', filters: { misc_filters: { filters: {} } } } }
    expect(searchIdentity(withCorrupt)).not.toBe(searchIdentity(without))
  })
  it('동일한 비-능력치 필터면 같은 키 (정상 재검색은 하나로 dedupe — 회귀 방지)', () => {
    const mk = () => ({ query: { type: 'Waystone', filters: { misc_filters: { filters: { map_iiq: { min: 40 }, corrupted: { option: 'false' } } } } } })
    expect(searchIdentity(mk())).toBe(searchIdentity(mk()))
  })
  it('비-능력치 필터의 키 순서가 달라도 같은 키', () => {
    const a = { query: { filters: { misc_filters: { filters: { map_iiq: { min: 40 }, ilvl: { min: 80 } } } } } }
    const b = { query: { filters: { misc_filters: { filters: { ilvl: { min: 80 }, map_iiq: { min: 40 } } } } } }
    expect(searchIdentity(a)).toBe(searchIdentity(b))
  })
  it('거래 메타(sale_type·indexed 등)는 조건 동일성에서 무시', () => {
    const a = { query: { type: 'Ring', filters: { trade_filters: { filters: { sale_type: { option: 'priced' }, indexed: { option: '1day' } } } } } }
    const b = { query: { type: 'Ring', filters: { trade_filters: { filters: {} } } } }
    expect(searchIdentity(a)).toBe(searchIdentity(b))
  })
  it('비활성(disabled) 필터 그룹은 조건 동일성에서 제외', () => {
    const enabled = { query: { filters: { type_filters: { filters: { ilvl: { min: 80 } } } } } }
    const disabled = { query: { filters: { type_filters: { disabled: true, filters: { ilvl: { min: 80 } } } } } }
    const none = { query: { filters: {} } }
    expect(searchIdentity(disabled)).toBe(searchIdentity(none))
    expect(searchIdentity(enabled)).not.toBe(searchIdentity(none))
  })
})

describe('structuralIdentity — 구조 동일성(수치 제외)', () => {
  const rec = (over) => ({ kind: 'bookmark', itemType: '반지', title: '반지', stats: ['화염 저항 #%', '최대 생명 #'], otherFilters: [{ key: 'ilvl', label: '아이템 레벨', value: '≥80' }], ...over })
  it('수치만 다른 두 검색은 같은 구조 키', () => {
    const a = rec({ otherFilters: [{ key: 'ilvl', value: '≥80' }] })
    const b = rec({ otherFilters: [{ key: 'ilvl', value: '≥60' }] }) // 필터 값만 다름
    expect(structuralIdentity(a)).toBe(structuralIdentity(b))
  })
  it('능력치 종류가 다르면 다른 구조 키', () => {
    expect(structuralIdentity(rec({}))).not.toBe(structuralIdentity(rec({ stats: ['화염 저항 #%'] })))
  })
  it('필터 종류가 다르면 다른 구조 키', () => {
    expect(structuralIdentity(rec({}))).not.toBe(structuralIdentity(rec({ otherFilters: [{ key: 'quality', value: '≥20' }] })))
  })
  it('유형/유니크명(title)이 다르면 다른 구조 키', () => {
    expect(structuralIdentity(rec({}))).not.toBe(structuralIdentity(rec({ itemType: '목걸이', title: '목걸이' })))
    expect(structuralIdentity(rec({}))).not.toBe(structuralIdentity(rec({ title: 'Astramentis' }))) // 유니크명(title) 차이
  })
  it('능력치·필터 순서는 무관', () => {
    const a = rec({ stats: ['A', 'B'], otherFilters: [{ key: 'x' }, { key: 'y' }] })
    const b = rec({ stats: ['B', 'A'], otherFilters: [{ key: 'y' }, { key: 'x' }] })
    expect(structuralIdentity(a)).toBe(structuralIdentity(b))
  })
})

describe('findNearDuplicate — 수치만 다른 기존 북마크 찾기', () => {
  const bm = (id, over) => ({ id, kind: 'bookmark', itemType: '반지', name: null, stats: ['화염 저항 #%'], otherFilters: [{ key: 'ilvl' }], dedupeKey: `k_${id}`, updatedAt: id, ...over })
  it('수치만 다른 북마크를 찾음', () => {
    const latest = bm('L', { dedupeKey: 'kL' })
    const found = findNearDuplicate(latest, [bm(1, { dedupeKey: 'k1' }), bm(2, { itemType: '목걸이', dedupeKey: 'k2' })])
    expect(found && found.id).toBe(1)
  })
  it('완전 동일(exact, 같은 dedupeKey)은 near-dup에서 제외', () => {
    const latest = bm('L', { dedupeKey: 'kX' })
    expect(findNearDuplicate(latest, [bm(1, { dedupeKey: 'kX' })])).toBeNull()
  })
  it('수치만 다른 게 여러 개면 가장 최근 것', () => {
    const latest = bm('L', { dedupeKey: 'kL' })
    const found = findNearDuplicate(latest, [bm(1, { dedupeKey: 'k1', updatedAt: 100 }), bm(3, { dedupeKey: 'k3', updatedAt: 300 }), bm(2, { dedupeKey: 'k2', updatedAt: 200 })])
    expect(found.id).toBe(3)
  })
  it('구조가 다르면 없음', () => {
    const latest = bm('L', { dedupeKey: 'kL', stats: ['냉기 저항 #%'] })
    expect(findNearDuplicate(latest, [bm(1, { dedupeKey: 'k1' })])).toBeNull()
  })
})
