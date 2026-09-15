import { describe, it, expect } from 'vitest'
import { affixListFor, filterAffixes } from '../src/lib/affixList.js'
import realTable from '../src/lib/statTiers.poe2.json'
import realAffixes from '../src/lib/statAffixes.poe2.json'

const table = {
  Gloves: {
    'stat.life': [{ t: 1, l: 60 }, { t: 2, l: 54 }, { t: 3, l: 46 }],
    'stat.fire_add': [{ t: 1, l: 75 }, { t: 2, l: 65 }],
    'stat.fire_res': [{ t: 1, l: 82 }, { t: 2, l: 71 }, { t: 3, l: 60 }],
    'stat.no_text': [{ t: 1, l: 10 }],
  },
}
const affixes = { Gloves: { p: ['stat.life', 'stat.fire_add', 'stat.no_text'], s: ['stat.fire_res', 'stat.not_in_table'] } }
const statMap = { 'stat.life': '생명력 최대치 #', 'stat.fire_add': '공격 시 화염 피해 #~# 추가', 'stat.fire_res': '화염 저항 #%' }

describe('affixListFor', () => {
  it('접두어·접미어로 갈라 표 순서를 지킨다', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap })
    expect(r.status).toBe('ok')
    expect(r.prefix.map((x) => x.id)).toEqual(['stat.life', 'stat.fire_add'])
    expect(r.suffix.map((x) => x.id)).toEqual(['stat.fire_res'])
    expect(r.prefix[0]).toMatchObject({ text: '생명력 최대치 #', tiers: 3, topLevel: 60, have: false })
  })

  it('거래소 문구가 없거나 표에 없는 id 는 뺀다 — 넣을 수 없는 것을 늘어놓지 않는다', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap })
    expect(r.prefix.find((x) => x.id === 'stat.no_text')).toBeUndefined()
    expect(r.suffix.find((x) => x.id === 'stat.not_in_table')).toBeUndefined()
  })

  it('아이템 레벨 상한 안에서 닿는 티어만 센다', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap, ilvlMax: 65 })
    expect(r.suffix[0]).toMatchObject({ tiers: 1, topLevel: 60 }) // T3(60)만
    expect(r.prefix[1]).toMatchObject({ tiers: 1, topLevel: 65 })
  })

  it('상한으로 하나도 안 닿으면 tiers 0 · T1 필요 레벨', () => {
    const r = affixListFor({ table, affixes, itemClass: 'Gloves', statMap, ilvlMax: 40 })
    expect(r.prefix[1]).toMatchObject({ tiers: 0, topLevel: 75 })
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
})
