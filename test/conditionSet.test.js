// test/conditionSet.test.js — 조건 묶음 추출·병합 (자주 쓰는 조건 뭉치를 현재 검색에 얹기)
import { describe, it, expect } from 'vitest'
import { extractConditionSet, mergeConditionSet, conditionSetSummary } from '../src/lib/conditionSet.js'

const STAT_MAP = {
  'explicit.stat_life': '최대 생명력 #',
  'explicit.stat_fire_res': '화염 저항 #%',
  'explicit.stat_cold_res': '냉기 저항 #%',
}
// 실제 캡처된 검색 바디와 같은 형태 (test/fixtures/poe2-search-query.json)
const rec = (over = {}) => ({
  query: {
    query: {
      status: { option: 'online' },
      type: '목걸이',
      stats: [{ type: 'and', filters: [
        { id: 'explicit.stat_life', value: { min: 80 } },
        { id: 'explicit.stat_fire_res', value: { min: 30 } },
      ] }],
      filters: { trade_filters: { filters: { price: { max: 3, option: 'divine' } } } },
    },
    sort: { price: 'asc' },
  },
  ...over,
})

describe('extractConditionSet', () => {
  it('raw query에서 스탯(값 포함)과 유형을 뽑는다', () => {
    const set = extractConditionSet(rec(), STAT_MAP)
    expect(set.itemType).toBe('목걸이')
    expect(set.stats).toEqual([
      { id: 'explicit.stat_life', text: '최대 생명력 #', value: { min: 80 } },
      { id: 'explicit.stat_fire_res', text: '화염 저항 #%', value: { min: 30 } },
    ])
  })

  it('가격 등 비-스탯 필터는 담지 않는다 — 예산은 매번 다르므로 얹을 대상이 아니다', () => {
    const set = extractConditionSet(rec(), STAT_MAP)
    expect(set.filters).toBeUndefined()
    expect(JSON.stringify(set)).not.toContain('price')
  })

  it('비활성(disabled) 조건은 제외한다 — 검색에 적용되지 않던 것', () => {
    const r = rec()
    r.query.query.stats[0].filters.push({ id: 'explicit.stat_cold_res', value: { min: 20 }, disabled: true })
    r.query.query.stats.push({ type: 'and', disabled: true, filters: [{ id: 'explicit.stat_x', value: { min: 1 } }] })
    const set = extractConditionSet(r, STAT_MAP)
    expect(set.stats.map((s) => s.id)).toEqual(['explicit.stat_life', 'explicit.stat_fire_res'])
  })

  it('statMap에 없는 id는 id를 표시 텍스트로 쓴다(맵 로드 전에도 동작)', () => {
    const set = extractConditionSet(rec(), {})
    expect(set.stats[0].text).toBe('explicit.stat_life')
  })

  it('수치 없는 조건(존재 여부만)도 담는다', () => {
    const r = rec()
    r.query.query.stats[0].filters = [{ id: 'explicit.stat_life' }]
    const set = extractConditionSet(r, STAT_MAP)
    expect(set.stats).toEqual([{ id: 'explicit.stat_life', text: '최대 생명력 #' }])
  })

  it('min·max 둘 다 있으면 둘 다 보존한다', () => {
    const r = rec()
    r.query.query.stats[0].filters = [{ id: 'explicit.stat_life', value: { min: 80, max: 120 } }]
    expect(extractConditionSet(r, STAT_MAP).stats[0].value).toEqual({ min: 80, max: 120 })
  })

  it('raw query가 없는 구 레코드는 null (묶음으로 만들 수 없음)', () => {
    expect(extractConditionSet({ title: '반지' }, STAT_MAP)).toBeNull()
    expect(extractConditionSet(null, STAT_MAP)).toBeNull()
    expect(extractConditionSet({ query: { query: 'x' } }, STAT_MAP)).toBeNull()
  })

  it('담을 게 하나도 없으면 null', () => {
    const r = rec()
    r.query.query.type = null
    r.query.query.stats = []
    expect(extractConditionSet(r, STAT_MAP)).toBeNull()
  })
})

describe('mergeConditionSet', () => {
  const SET = {
    itemType: '목걸이',
    stats: [
      { id: 'explicit.stat_fire_res', text: '화염 저항 #%', value: { min: 35 } },
      { id: 'explicit.stat_cold_res', text: '냉기 저항 #%', value: { min: 35 } },
    ],
  }

  it('현재 검색의 가격·정렬 등 관계없는 설정은 보존한다', () => {
    const body = mergeConditionSet(rec().query, SET)
    expect(body.query.filters.trade_filters.filters.price).toEqual({ max: 3, option: 'divine' })
    expect(body.sort).toEqual({ price: 'asc' })
    expect(body.query.status).toEqual({ option: 'online' })
  })

  it('기존 조건은 남기고 묶음 조건을 더한다', () => {
    const body = mergeConditionSet(rec().query, SET)
    const ids = body.query.stats[0].filters.map((f) => f.id)
    expect(ids).toEqual(['explicit.stat_life', 'explicit.stat_fire_res', 'explicit.stat_cold_res'])
  })

  it('같은 조건이 이미 있으면 묶음 값으로 덮어쓴다(중복 행이 생기지 않음)', () => {
    const body = mergeConditionSet(rec().query, SET)
    const fire = body.query.stats[0].filters.find((f) => f.id === 'explicit.stat_fire_res')
    expect(fire.value).toEqual({ min: 35 }) // 기존 30 → 묶음 35
    expect(body.query.stats[0].filters.filter((f) => f.id === 'explicit.stat_fire_res')).toHaveLength(1)
  })

  it('원본 바디를 변형하지 않는다(취소·되돌리기 대비)', () => {
    const base = rec().query
    const snapshot = JSON.stringify(base)
    mergeConditionSet(base, SET)
    expect(JSON.stringify(base)).toBe(snapshot)
  })

  it('현재 검색이 없으면 묶음만으로 검색 바디를 만든다', () => {
    const body = mergeConditionSet(null, SET)
    expect(body.query.type).toBe('목걸이')
    expect(body.query.status).toEqual({ option: 'online' }) // 거래소 기본
    expect(body.query.stats[0].filters.map((f) => f.id)).toEqual(['explicit.stat_fire_res', 'explicit.stat_cold_res'])
  })

  it('묶음에 유형이 없으면 현재 검색의 유형을 유지한다', () => {
    const body = mergeConditionSet(rec().query, { stats: SET.stats })
    expect(body.query.type).toBe('목걸이')
  })

  it('가중치·개수 그룹은 건드리지 않고 and 그룹에만 얹는다', () => {
    const base = rec().query
    base.query.stats.push({ type: 'weight', value: { min: 10 }, filters: [{ id: 'explicit.stat_fire_res', value: { weight: 2 } }] })
    const body = mergeConditionSet(base, SET)
    const weight = body.query.stats.find((g) => g.type === 'weight')
    expect(weight.filters).toEqual([{ id: 'explicit.stat_fire_res', value: { weight: 2 } }]) // 그대로
    expect(body.query.stats[0].filters).toHaveLength(3) // and 그룹에만 추가
  })

  it('and 그룹이 없으면 새로 만든다', () => {
    const base = { query: { stats: [{ type: 'count', value: { min: 2 }, filters: [] }] } }
    const body = mergeConditionSet(base, SET)
    const and = body.query.stats.find((g) => g.type === 'and')
    expect(and.filters.map((f) => f.id)).toEqual(['explicit.stat_fire_res', 'explicit.stat_cold_res'])
    expect(body.query.stats.find((g) => g.type === 'count')).toBeTruthy()
  })

  it('비활성 and 그룹에는 얹지 않는다(검색에 적용 안 되는 그룹)', () => {
    const base = { query: { stats: [{ type: 'and', disabled: true, filters: [] }] } }
    const body = mergeConditionSet(base, SET)
    const active = body.query.stats.filter((g) => !g.disabled)
    expect(active).toHaveLength(1)
    expect(active[0].filters).toHaveLength(2)
  })

  it('수치 없는 조건은 value 없이 얹는다', () => {
    const body = mergeConditionSet(null, { stats: [{ id: 'explicit.stat_life', text: 'x' }] })
    expect(body.query.stats[0].filters[0]).toEqual({ id: 'explicit.stat_life' })
  })

  it('묶음이 비었거나 없으면 null', () => {
    expect(mergeConditionSet(rec().query, null)).toBeNull()
    expect(mergeConditionSet(rec().query, { stats: [] })).toBeNull()
  })
})

describe('conditionSetSummary', () => {
  it('유형과 조건 개수를 한 줄로 요약한다', () => {
    expect(conditionSetSummary({ itemType: '목걸이', stats: [{ id: 'a' }, { id: 'b' }] })).toBe('목걸이 · 조건 2개')
  })
  it('유형이 없으면 조건 개수만', () => {
    expect(conditionSetSummary({ stats: [{ id: 'a' }] })).toBe('조건 1개')
  })
  it('유형만 있으면 유형만', () => {
    expect(conditionSetSummary({ itemType: '반지', stats: [] })).toBe('반지')
  })
  it('빈 묶음은 빈 문자열', () => {
    expect(conditionSetSummary(null)).toBe('')
  })
})
