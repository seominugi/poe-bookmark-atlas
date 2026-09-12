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

  // 값이 음수인 능력치는 거래소에서 **작을수록 좋다**. 최소칸에 -25 를 넣으면 "-25 이상"이라
  // 더 나쁜 아이템까지 다 걸리므로, 넣어야 하는 칸은 최대칸이다.
  // 부호는 값 안에 있으므로 표 스키마를 바꿀 필요가 없다.
  describe('fill — 어느 입력칸에 넣어야 하는가', () => {
    const negTable = {
      Belt: {
        'stat.charges_used': [
          { t: 1, l: 68, v: [[-25, -23]] },
          { t: 2, l: 55, v: [[-22, -20]] },
        ],
        'stat.mixed': [
          { t: 1, l: 68, v: [[-5, 3]] }, // 범위가 0 을 걸친다 — 작을수록 좋다고 단정할 수 없다
        ],
        'stat.zero': [{ t: 1, l: 68, v: [[0, 0]] }],
      },
    }
    it('값이 전부 음수면 최대칸', () => {
      const r = tiersFor({ table: negTable, itemClass: 'Belt', statId: 'stat.charges_used' })
      expect(r.status).toBe('ok')
      expect(r.fill).toBe('max')
      expect(r.tiers[0].max).toBe(-23)
    })
    it('평범한 양수 능력치는 최소칸', () => {
      expect(tiersFor({ table, itemClass: 'Ring', statId: 'stat.fire_res' }).fill).toBe('min')
    })
    it('부호가 섞이면 최소칸 — 기존 동작을 유지한다', () => {
      expect(tiersFor({ table: negTable, itemClass: 'Belt', statId: 'stat.mixed' }).fill).toBe('min')
    })
    it('0 은 음수가 아니다', () => {
      expect(tiersFor({ table: negTable, itemClass: 'Belt', statId: 'stat.zero' }).fill).toBe('min')
    })
    it('아이템 레벨 상한과 무관하게 같은 칸을 가리킨다 — 상한을 바꿔도 칸이 흔들리면 안 된다', () => {
      const wide = tiersFor({ table: negTable, itemClass: 'Belt', statId: 'stat.charges_used' })
      const narrow = tiersFor({ table: negTable, itemClass: 'Belt', statId: 'stat.charges_used', ilvlMax: 60 })
      expect(narrow.tiers.map((x) => x.t)).toEqual([2])
      expect(narrow.fill).toBe(wide.fill)
    })
  })

  // 표는 JSON 에서 온 평범한 객체다 — 프로토타입 속성 이름이 들어와도 자기 속성만 봐야 한다.
  // (itemClass.js 가 같은 이유로 own() 을 쓴다)
  describe('프로토타입 속성 이름이 들어와도 안전하다', () => {
    const PROTO_KEYS = ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']

    it('부위 자리에 오면 no-class 다 (no-stat 이 아니다 — 부르는 쪽이 부위를 물어봐야 한다)', () => {
      for (const key of PROTO_KEYS) {
        expect(tiersFor({ table, itemClass: key, statId: 'stat.fire_res' }).status).toBe('no-class')
      }
    })

    it('능력치 자리에 오면 no-stat 이고 예외를 던지지 않는다', () => {
      for (const key of PROTO_KEYS) {
        expect(() => tiersFor({ table, itemClass: 'Ring', statId: key })).not.toThrow()
        expect(tiersFor({ table, itemClass: 'Ring', statId: key }).status).toBe('no-stat')
      }
    })
  })
})
