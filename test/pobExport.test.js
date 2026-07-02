// 작업3 — 영문 PoB 조립기 핵심 로직. 캡처한 실제 아이템(공허 경고 · 사원 서판)의 mod로 검증.
// stat id → 번들 EN 맵 조회 → 값 치환 → 영문 라인. 다중변형(Area/Map)은 KR 설명으로 택1.
import { describe, it, expect } from 'vitest'
import { stripTags, digitsToHash, extractValues, fillValues, pickTemplate, translateMod } from '../src/lib/pobExport.js'
import map from '../src/lib/pobStatMap.json'

describe('stripTags — [Key|표시텍스트] 마크업 제거', () => {
  it('[Rarity|희귀도] → 희귀도', () => {
    expect(stripTags('지도에서 발견하는 아이템 [Rarity|희귀도] 8% 증가')).toBe('지도에서 발견하는 아이템 희귀도 8% 증가')
  })
  it('여러 태그 + [단일] 형태도 처리', () => {
    expect(stripTags('지도 내 [ContainsIncursion|바알 등대] 상자가 [Rarity|희귀] 등급')).toBe('지도 내 바알 등대 상자가 희귀 등급')
  })
})

describe('digitsToHash / extractValues — 값 정규화·추출', () => {
  it('숫자를 #로 정규화(변형 매칭용)', () => {
    expect(digitsToHash('성소가 등장할 확률 88% 증가')).toBe('성소가 등장할 확률 #% 증가')
  })
  it('음수·소수 포함 값 추출(순서 유지)', () => {
    expect(extractValues('5에서 10 화염, -3% 저항')).toEqual(['5', '10', '-3'])
  })
})

describe('fillValues — EN 템플릿의 #를 값으로 순서대로 치환', () => {
  it('단일 값', () => expect(fillValues('#% increased Rarity', ['8'])).toBe('8% increased Rarity'))
  it('다중 값', () => expect(fillValues('Adds # to # Fire', ['5', '10'])).toBe('Adds 5 to 10 Fire'))
  it('# 없으면 그대로', () => expect(fillValues('an additional Chest', ['2'])).toBe('an additional Chest'))
})

describe('pickTemplate — 다중변형(Area/Map)을 KR 설명으로 택1', () => {
  it('지도 → Map 변형 선택', () => {
    expect(pickTemplate('explicit.stat_689816330', '지도에 성소가 등장할 확률 88% 증가', map))
      .toBe('Map has #% increased chance to contain Shrines')
  })
  it('단일 변형은 그대로 문자열', () => {
    expect(pickTemplate('explicit.stat_2306002879', '아무 설명', map)).toBe('#% increased Rarity of Items found in Map')
  })
})

describe('translateMod — 캡처 아이템(공허 경고)의 실제 mod → 영문 라인', () => {
  const cases = [
    ['explicit.stat_2306002879', '지도에서 발견하는 아이템 [Rarity|희귀도] 8% 증가', '8% increased Rarity of Items found in Map'],
    ['explicit.stat_2514439422', '지도 내 [ContainsIncursion|바알 등대] 상자가 [Rarity|희귀] 등급일 확률 42% 증가', '42% increased chance Vaal Beacon Chests are Rare in Map'],
    ['explicit.stat_689816330', '지도에 [Shrine|성소]가 등장할 확률 88% 증가', 'Map has 88% increased chance to contain Shrines'],
    ['explicit.stat_231864447', '지도에 [Rarity|희귀] 상자 2개 추가 등장', 'Map contains an additional Rare Chest'], // 값 손실: 필터 텍스트에 #가 없음(MVP 비-gear 한계)
    ['implicit.stat_3035440454', '지도에 [ContainsIncursion|바알 등대] 추가\n잔여 사용 횟수 10회', 'Adds Vaal Beacons to a Map \n10 use remaining'],
  ]
  for (const [id, ko, en] of cases) {
    it(`${id} → "${en.split('\n')[0]}..."`, () => expect(translateMod(id, ko, map).en).toBe(en))
  }
  it('미매핑 id는 en=null(폴백은 조립기가 처리)', () => {
    expect(translateMod('explicit.stat_does_not_exist', '없음', map).en).toBeNull()
  })
})
