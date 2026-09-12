import { describe, it, expect } from 'vitest'
import { normalizeTradeText, normalizeModText, modTextKeys, polarityFlipped } from '../src/lib/statTextNorm.js'

describe('normalizeTradeText — 거래소 문구', () => {
  it('부호를 뗀다', () => {
    expect(normalizeTradeText('화염 저항 +#%')).toBe('화염 저항 #%')
    expect(normalizeTradeText('생명력 최대치 +#')).toBe('생명력 최대치 #')
  })
  it('공백을 정리한다', () => {
    expect(normalizeTradeText('  화염 저항  #% ')).toBe('화염 저항 #%')
  })
})

describe('normalizeModText — 게임 문구', () => {
  it('괄호 범위를 슬롯으로 바꾼다', () => {
    expect(normalizeModText('화염 저항 (30-35)%', 1)).toBe('화염 저항 #%')
  })
  it('물결 범위는 슬롯 둘', () => {
    expect(normalizeModText('공격 시 화염 피해 1~2 추가', 2)).toBe('공격 시 화염 피해 #~# 추가')
  })
  it('고정 숫자와 괄호 범위가 섞인 물결도 슬롯 둘 (PoE2 흔한 형태)', () => {
    expect(normalizeModText('공격 시 냉기 피해 1~(2-3) 추가', 2)).toBe('공격 시 냉기 피해 #~# 추가')
  })
  it('범위 앞에 상수가 있어도 물결에 붙은 쪽을 슬롯으로 본다', () => {
    expect(normalizeModText('10초마다 냉기 피해 1~(2-3) 추가', 2)).toBe('10초마다 냉기 피해 #~# 추가')
  })
  it('슬롯 수가 모자라면 남은 상수를 슬롯으로 올린다', () => {
    expect(normalizeModText('모든 근접 스킬 레벨 1', 1)).toBe('모든 근접 스킬 레벨 #')
  })
  it('슬롯이 이미 찼으면 남은 상수는 건드리지 않는다', () => {
    expect(normalizeModText('1초마다 생명력 (60-120) 재생', 1)).toBe('1초마다 생명력 # 재생')
  })
  it('슬롯 수를 모르면(0) 상수 승격을 하지 않는다', () => {
    expect(normalizeModText('지역에 심연 1개 추가 등장', 0)).toBe('지역에 심연 1개 추가 등장')
  })
})

describe('normalizeModText — 게임 데이터에 남은 {} 플레이스홀더', () => {
  // 게임 데이터가 치환하지 못한 채 내보낸 자리다(poe2 스냅샷 실측 6건, 전부 맨몸 '{}').
  // 거래소에는 같은 문구가 '#%' 로 있으므로 값 슬롯으로 인정하면 그대로 붙는다.
  it('{} 를 값 슬롯으로 인정한다', () => {
    expect(normalizeModText('활 스킬로 주는 피해 {}% 증가', 1)).toBe('활 스킬로 주는 피해 #% 증가')
  })
  it('{} 가 슬롯을 채우면 남은 상수를 승격하지 않는다', () => {
    expect(normalizeModText('1초마다 생명력 {} 재생', 1)).toBe('1초마다 생명력 # 재생')
  })
})

describe('modTextKeys — 어느 숫자가 값인지 모를 때의 후보', () => {
  it('첫 후보는 normalizeModText 와 같다', () => {
    expect(modTextKeys('화염 저항 (30-35)%', 1)[0]).toBe(normalizeModText('화염 저항 (30-35)%', 1))
  })
  it('왼쪽부터 채우면 틀리는 문구의 올바른 키도 후보에 있다', () => {
    // 값은 9 다. 왼쪽부터면 '1초마다' 의 1 을 값으로 잡아 거래소에 없는 키가 된다.
    expect(modTextKeys('1초마다 충전 9 획득', 1)).toContain('1초마다 충전 # 획득')
  })
  it('거래소가 상수를 리터럴로 갖는 문구는 승격하지 않은 키도 후보에 있다', () => {
    expect(modTextKeys('유탄 스킬이 투사체 1개 추가 발사', 1)).toContain('유탄 스킬이 투사체 1개 추가 발사')
  })
  it('숫자가 하나뿐이면 후보는 승격형과 리터럴형 둘이다', () => {
    expect(modTextKeys('모든 근접 스킬 레벨 1', 1)).toEqual(['모든 근접 스킬 레벨 #', '모든 근접 스킬 레벨 1'])
  })
  it('범위가 슬롯을 다 채우면 후보는 하나다', () => {
    expect(modTextKeys('화염 저항 (30-35)%', 1)).toEqual(['화염 저항 #%'])
  })
  it('후보에 중복은 없다', () => {
    const keys = modTextKeys('1초마다 충전 9 획득', 1)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('polarityFlipped — 음수 모드가 거래소의 「증가」 항목에 걸리게', () => {
  // 거래소는 부호 있는 stat 하나로 통합하고 「증가」 문구만 갖는다. 게임은 값이 음수일 때
  // 문장을 「감소」로 뒤집어 쓴다. 실측(poe2 스냅샷): 거래소에 「감소」/「증가」 두 형태가
  // 모두 있는 문구는 0개 → 치환이 다른 stat 으로 넘어갈 수 없다.
  it('감소를 증가로 바꾼다', () => {
    expect(polarityFlipped('능력치 요구사항 -15% 감소')).toBe('능력치 요구사항 -15% 증가')
  })
  it('한 문장에 여러 번 나오면 모두 바꾼다', () => {
    expect(polarityFlipped('공격 속도 감소, 시야 감소')).toBe('공격 속도 증가, 시야 증가')
  })
  it('감소가 없으면 null — 부를 이유가 없다는 뜻', () => {
    expect(polarityFlipped('화염 저항 (30-35)%')).toBeNull()
  })
  it('증가를 감소로 바꾸지는 않는다', () => {
    // 실측에서 반대 방향은 한 건도 붙지 않았다. 안 쓰이는 경로를 만들지 않는다.
    expect(polarityFlipped('화염 저항 30% 증가')).toBeNull()
  })
})
