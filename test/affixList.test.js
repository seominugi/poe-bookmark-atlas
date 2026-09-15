import { describe, it, expect } from 'vitest'
import { affixListFor, affixFilterValue, filterAffixes } from '../src/lib/affixList.js'
import realTable from '../src/lib/statTiers.poe2.json'
import realAffixes from '../src/lib/statAffixes.poe2.json'

const table = {
  Gloves: {
    'stat.life': [{ t: 1, l: 60, v: [[120, 149]] }, { t: 2, l: 54, v: [[100, 119]] }, { t: 3, l: 46, v: [[85, 99]] }, { t: 4, l: 38, v: [[70, 84]] }],
    'stat.fire_add': [{ t: 1, l: 75, v: [[25, 29], [37, 45]] }, { t: 2, l: 65, v: [[20, 24], [33, 36]] }],
    'stat.fire_res': [{ t: 1, l: 82, v: [[41, 45]] }, { t: 2, l: 71, v: [[36, 40]] }, { t: 3, l: 60, v: [[31, 35]] }],
    'stat.no_text': [{ t: 1, l: 10, v: [[1, 2]] }],
  },
  Jewel: {
    'stat.accuracy': [{ t: 1, l: 1, v: [[5, 10]] }],
    'stat.curse_speed': [{ t: 1, l: 1, v: [[-15, -5]] }],
  },
}
const affixes = {
  Gloves: { p: ['stat.life', 'stat.fire_add', 'stat.no_text'], s: ['stat.fire_res', 'stat.not_in_table'] },
  Jewel: { p: ['stat.accuracy'], s: ['stat.curse_speed'] },
}
const statMap = {
  'stat.life': '생명력 최대치 #', 'stat.fire_add': '공격 시 화염 피해 #~# 추가', 'stat.fire_res': '화염 저항 #%',
  'stat.accuracy': '일반 정확도 #% 증가', 'stat.curse_speed': '저주 활성화 속도 #% 가속',
}

describe('affixListFor', () => {
  it('접두어·접미어로 갈라 표 순서를 지킨다', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap })
    expect(r.status).toBe('ok')
    expect(r.prefix.map((x) => x.id)).toEqual(['stat.life', 'stat.fire_add'])
    expect(r.suffix.map((x) => x.id)).toEqual(['stat.fire_res'])
    expect(r.prefix[0]).toMatchObject({ text: '생명력 최대치 #', tiers: 4, topLevel: 60, have: false, single: false, fill: 'min' })
  })

  it('고를 값은 칩과 같은 상위 세 티어다 — 두 칸 능력치는 평균 기준', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap })
    expect(r.prefix[0].choices.map((c) => [c.t, c.min])).toEqual([[1, 120], [2, 100], [3, 85]])
    expect(r.prefix[1].choices[0]).toMatchObject({ t: 1, min: 31, max: 37 })
  })

  it('거래소 문구가 없거나 표에 없는 id 는 뺀다 — 넣을 수 없는 것을 늘어놓지 않는다', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap })
    expect(r.prefix.find((x) => x.id === 'stat.no_text')).toBeUndefined()
    expect(r.suffix.find((x) => x.id === 'stat.not_in_table')).toBeUndefined()
  })

  it('아이템 레벨 상한 안에서 닿는 티어만 센다', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap, ilvlMax: 65 })
    expect(r.suffix[0]).toMatchObject({ tiers: 1, topLevel: 60 })
    expect(r.suffix[0].choices.map((c) => c.t)).toEqual([3])
  })

  it('상한으로 하나도 안 닿으면 tiers 0 · 고를 값 없음', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap, ilvlMax: 40 })
    expect(r.prefix[1]).toMatchObject({ tiers: 0, topLevel: 75, choices: [] })
  })

  it('티어가 하나뿐이면 single (주얼)', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Jewel', statMap })
    expect(r.prefix[0]).toMatchObject({ single: true, tiers: 1 })
    expect(r.prefix[0].choices).toHaveLength(1)
  })

  it('이미 그룹에 있는 것은 have', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap, existingIds: ['stat.fire_res'] })
    expect(r.suffix[0].have).toBe(true)
    expect(r.prefix[0].have).toBe(false)
  })

  it('부위를 모르거나 목록이 없으면 no-class', () => {
    expect(affixListFor({ table, affixes, itemClass: null, statMap }).status).toBe('no-class')
    expect(affixListFor({ table, affixes, itemClass: 'Focus', statMap }).status).toBe('no-class')
    expect(affixListFor({ table, affixes, itemClass: 'constructor', statMap }).status).toBe('no-class')
  })
})

describe('affixFilterValue — 넣을 값', () => {
  const gloves = affixListFor({ table, affixes, itemClass: 'Gloves', statMap })
  const jewel = affixListFor({ table, affixes, itemClass: 'Jewel', statMap })

  it('빈칸이면 null', () => {
    expect(affixFilterValue(gloves.prefix[0], -1)).toBeNull()
    expect(affixFilterValue(gloves.prefix[0], 9)).toBeNull()
  })
  it('티어가 여럿이면 넣는 칸 하나만 — 최대까지 채우면 더 좋은 티어가 빠진다', () => {
    expect(affixFilterValue(gloves.prefix[0], 1)).toEqual({ min: 100 })
    expect(affixFilterValue(gloves.prefix[1], 0)).toEqual({ min: 31 })
  })
  it('티어가 하나뿐이면 최소·최대 모두', () => {
    expect(affixFilterValue(jewel.prefix[0], 0)).toEqual({ min: 5, max: 10 })
  })
  it('티어가 하나뿐인 음수 능력치도 범위 그대로', () => {
    expect(affixFilterValue(jewel.suffix[0], 0)).toEqual({ min: -15, max: -5 })
  })
})

describe('filterAffixes', () => {
  const items = [{ text: '화염 저항 #%' }, { text: '공격 시 화염 피해 #~# 추가' }, { text: '생명력 최대치 #' }]
  it('공백을 무시한 부분 일치', () => {
    expect(filterAffixes(items, '화염저항').map((x) => x.text)).toEqual(['화염 저항 #%'])
    expect(filterAffixes(items, '화염').length).toBe(2)
  })
  it('빈 검색어면 그대로', () => {
    expect(filterAffixes(items, '  ')).toBe(items)
  })
})

// 두 파일은 같은 빌드 회차에서 나온다 — 어긋나면 목록에 칩이 안 뜨는 속성이 섞인다.
describe('실제 데이터 — statAffixes 와 statTiers 가 같은 능력치를 가리킨다', () => {
  it('부위 집합이 같고, 부위마다 id 집합이 같다', () => {
    expect(Object.keys(realAffixes).sort()).toEqual(Object.keys(realTable).sort())
    for (const cls of Object.keys(realTable)) {
      const listed = [...realAffixes[cls].p, ...realAffixes[cls].s]
      expect(new Set(listed).size).toBe(listed.length)
      expect([...listed].sort()).toEqual(Object.keys(realTable[cls]).sort())
    }
  })

  it('주얼 반경판이 제대로 이어져 주얼 능력치가 수백 개다 (전에는 값 충돌로 7개)', () => {
    expect(Object.keys(realTable.Jewel).length).toBeGreaterThan(250)
  })
})
