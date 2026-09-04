import { describe, it, expect } from 'vitest'
import { tiersFor, CHIP_COUNT } from '../src/lib/statTiers.js'

// 실제 표(160KB)가 아니라 손으로 만든 작은 표로 검증한다 — 게임 패치에 테스트가 흔들리지 않게.
const table = {
  Ring: {
    'stat.fire_res': [
      { t: 1, l: 82, v: [[41, 45]] },
      { t: 2, l: 71, v: [[36, 40]] },
      { t: 3, l: 60, v: [[31, 35]] },
      { t: 4, l: 48, v: [[26, 30]] },
    ],
    'stat.added_fire': [
      { t: 1, l: 75, v: [[25, 29], [37, 45]] }, // 슬롯이 둘
    ],
  },
}

describe('tiersFor', () => {
  it('부위를 모르면 no-class', () => {
    expect(tiersFor({ table, itemClass: null, statId: 'stat.fire_res' }).status).toBe('no-class')
  })
  it('표에 없는 부위도 no-class', () => {
    expect(tiersFor({ table, itemClass: 'Focus', statId: 'stat.fire_res' }).status).toBe('no-class')
  })
  it('그 부위에 없는 능력치는 no-stat', () => {
    expect(tiersFor({ table, itemClass: 'Ring', statId: 'stat.nope' }).status).toBe('no-stat')
  })
  it('슬롯이 둘인 능력치는 아직 다루지 않는다', () => {
    expect(tiersFor({ table, itemClass: 'Ring', statId: 'stat.added_fire' }).status).toBe('multi-slot')
  })
  it('상한이 없으면 상위 세 티어', () => {
    const r = tiersFor({ table, itemClass: 'Ring', statId: 'stat.fire_res' })
    expect(r.status).toBe('ok')
    expect(r.tiers.map((x) => x.t)).toEqual([1, 2, 3])
    expect(r.tiers[0].min).toBe(41)
  })
  it('아이템 레벨 상한이 걸리면 도달 가능한 것만', () => {
    const r = tiersFor({ table, itemClass: 'Ring', statId: 'stat.fire_res', ilvlMax: 65 })
    expect(r.tiers.map((x) => x.t)).toEqual([3, 4]) // T1(82)·T2(71) 탈락
    expect(r.tiers[0].min).toBe(31)
  })
  it('상한이 모든 티어를 걸러내면 none', () => {
    expect(tiersFor({ table, itemClass: 'Ring', statId: 'stat.fire_res', ilvlMax: 10 }).status).toBe('none')
  })
  it('칩 개수는 세 개다', () => {
    expect(CHIP_COUNT).toBe(3)
  })
})
