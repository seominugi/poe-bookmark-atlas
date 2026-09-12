import { describe, it, expect } from 'vitest'
import { verifyClassBridge, rangesByLine, hasValueConflict, preferLadder } from '../scripts/build-tier-table.mjs'
import { MOD_FILE_BY_POB_CLASS } from '../src/lib/itemClass.js'

describe('verifyClassBridge — 부위 대응표 양방향 검증', () => {
  const modFiles = new Set(['Ring', 'Body_Armour', 'Staff'])
  const pobClasses = new Set(['Rings', 'Body Armours', 'Staves'])
  const bridge = { Rings: 'Ring', 'Body Armours': 'Body_Armour', Staves: 'Staff' }

  it('맞으면 문제를 내지 않는다', () => {
    expect(verifyClassBridge(bridge, modFiles, pobClasses)).toEqual([])
  })
  it('없는 modifiers 파일을 지목하면 잡는다', () => {
    const bad = { ...bridge, Wands: 'Wand' }
    expect(verifyClassBridge(bad, modFiles, pobClasses).join(' ')).toMatch(/Wand/)
  })
  it('pobBaseMap 에 없는 클래스를 지목하면 잡는다', () => {
    const bad = { ...bridge, Charms: 'Ring' }
    expect(verifyClassBridge(bad, modFiles, pobClasses).join(' ')).toMatch(/Charms/)
  })
  it('실제 대응표는 31행이다', () => {
    expect(Object.keys(MOD_FILE_BY_POB_CLASS)).toHaveLength(31)
  })
})

describe('rangesByLine — 값 슬롯을 문장 단위로 자른다', () => {
  it('문장이 하나면 그대로', () => {
    const mod = { valueRanges: [[41, 45]] }
    const lines = [{ stats: [{ stat: 'a' }] }]
    expect(rangesByLine(mod, lines)).toEqual([[[41, 45]]])
  })

  it('한 문장에 슬롯이 둘이면 둘 다 그 문장 것이다 (공격 시 화염 피해 #~# 추가)', () => {
    const mod = { valueRanges: [[25, 29], [37, 45]] }
    const lines = [{ stats: [{ stat: 'min' }, { stat: 'max' }] }]
    expect(rangesByLine(mod, lines)).toEqual([[[25, 29], [37, 45]]])
  })

  it('문장이 둘이면 각자 자기 슬롯만 가져간다 (하이브리드 접두사)', () => {
    // 활의 `시야 반경 15% 증가` + `정확도 41~60` — 통째로 쓰면 시야 반경에 정확도 값이 따라붙는다
    const mod = { valueRanges: [[15, 15], [41, 60]] }
    const lines = [{ stats: [{ stat: 'sight' }] }, { stats: [{ stat: 'accuracy' }] }]
    expect(rangesByLine(mod, lines)).toEqual([[[15, 15]], [[41, 60]]])
  })

  it('앞 문장이 슬롯 둘, 뒤 문장이 하나여도 경계가 맞는다', () => {
    const mod = { valueRanges: [[1, 2], [3, 4], [9, 9]] }
    const lines = [{ stats: [{ stat: 'a' }, { stat: 'b' }] }, { stats: [{ stat: 'c' }] }]
    expect(rangesByLine(mod, lines)).toEqual([[[1, 2], [3, 4]], [[9, 9]]])
  })

  it('valueRanges 가 없어도 터지지 않는다', () => {
    expect(rangesByLine({}, [{ stats: [{ stat: 'a' }] }])).toEqual([[]])
  })
})

describe('hasValueConflict — 같은 요구 레벨에 값이 갈리면 티어를 못 매긴다', () => {
  it('요구 레벨이 서로 다르면 충돌이 아니다', () => {
    const rows = [
      { ilvl: 82, byLine: [[[41, 45]]] },
      { ilvl: 71, byLine: [[[36, 40]]] },
    ]
    expect(hasValueConflict(rows)).toBe(false)
  })

  it('같은 요구 레벨에 같은 값이면 충돌이 아니다', () => {
    const rows = [
      { ilvl: 1, byLine: [[[5, 10]]] },
      { ilvl: 1, byLine: [[[5, 10]]] },
    ]
    expect(hasValueConflict(rows)).toBe(false)
  })

  it('같은 요구 레벨에 값이 다르면 충돌이다 (JewelArmour vs JewelRadiusArmour)', () => {
    const rows = [
      { ilvl: 1, byLine: [[[10, 20]]] },
      { ilvl: 1, byLine: [[[2, 3]]] },
    ]
    expect(hasValueConflict(rows)).toBe(true)
  })

  it('문장이 여럿일 때 뒤 문장만 달라도 충돌로 잡는다', () => {
    const rows = [
      { ilvl: 30, byLine: [[[15, 15]], [[41, 60]]] },
      { ilvl: 30, byLine: [[[15, 15]], [[21, 40]]] },
    ]
    expect(hasValueConflict(rows)).toBe(true)
  })
})

describe('preferLadder — 같은 거래소 id 에 계열이 여럿 걸릴 때', () => {
  // 극성 치환(감소→증가)을 넣으면 '증가' 계열과 '감소' 계열이 같은 거래소 id 로 몰린다.
  // 실측(2026-09-13): poe2 스냅샷에서 2건 — 생명력·마나 플라스크의 `회복량 #% 증가` 에
  // 양수 `회복량 (41-45)% 증가` 와 음수 `회복량 -50% 감소` 가 같이 걸린다.
  const two = [{ t: 1 }, { t: 2 }]
  const three = [{ t: 1 }, { t: 2 }, { t: 3 }]

  it('비어 있으면 무엇이든 받는다', () => {
    expect(preferLadder(null, false, two, true)).toBe(true)
  })
  it('추론은 직접 매칭을 덮지 않는다 — 사다리가 더 길어도', () => {
    expect(preferLadder(two, false, three, true)).toBe(false)
  })
  it('직접 매칭은 추론을 덮는다 — 사다리가 더 짧아도', () => {
    expect(preferLadder(three, true, two, false)).toBe(true)
  })
  it('둘 다 직접이면 사다리가 긴 쪽', () => {
    expect(preferLadder(two, false, three, false)).toBe(true)
    expect(preferLadder(three, false, two, false)).toBe(false)
  })
  it('둘 다 추론이면 사다리가 긴 쪽', () => {
    expect(preferLadder(two, true, three, true)).toBe(true)
    expect(preferLadder(three, true, two, true)).toBe(false)
  })
  it('길이가 같으면 먼저 온 것을 지킨다 — 순서에 따라 표가 달라지지 않게', () => {
    expect(preferLadder(two, false, two, false)).toBe(false)
    expect(preferLadder(two, true, two, true)).toBe(false)
  })
})
