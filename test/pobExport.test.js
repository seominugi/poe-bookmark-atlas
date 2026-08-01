// 작업3 — 영문 PoB 조립기 핵심 로직. 캡처한 실제 아이템(공허 경고 · 사원 서판)의 mod로 검증.
// stat id → 번들 EN 맵 조회 → 값 치환 → 영문 라인. 다중변형(Area/Map)은 KR 설명으로 택1.
import { describe, it, expect } from 'vitest'
import { stripTags, digitsToHash, extractValues, fillValues, pickTemplate, translateMod, buildPobText, buildReportText } from '../src/lib/pobExport.js'
import map from '../src/lib/pobStatMap.json'
import baseMap from '../src/lib/pobBaseMap.json'
import poe1Map from '../src/lib/pobStatMap.poe1.json'
import poe1BaseMap from '../src/lib/pobBaseMap.poe1.json'

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

describe('translateMod — # 미치환 잔존은 실패로 취급 (텍스트형 옵션 mod)', () => {
  // "Allocates #" 류는 #가 숫자가 아니라 특성 이름 자리 — extractValues는 숫자만 찾아서 못 채운다.
  // 미치환 "#"가 그대로 남으면 PoB가 파싱 못 하므로, en=null(실패)로 처리해 조립기가 KR로 폴백·집계하게 한다.
  // (실제 번들 맵엔 이런 통합 템플릿이 없다 — 아래 '옵션형 stat id' 블록 참조. 그래서 합성 맵으로 동작만 고정한다.)
  it('값 없는 텍스트형 옵션은 en=null', () => {
    expect(translateMod('enchant.stat_x', '할당 골렘의 피', { 'enchant.stat_x': 'Allocates #' }).en).toBeNull()
  })
  it('값이 있는 정상 mod는 그대로 채워짐(회귀 방지)', () => {
    expect(translateMod('explicit.stat_1037193709', '냉기 피해 2~3 추가', poe1Map).en).toBe('Adds 2 to 3 Cold Damage')
  })
})

describe('translateMod — 옵션형 stat id("id|옵션번호") — 2026-08-02 회귀', () => {
  // 거래소 stats API는 선택지가 있는 mod를 "enchant.stat_3948993189|42"처럼 옵션 번호까지 붙은 별개 id로 준다
  // (아이템 extended.hashes도 같은 형태). 번들 맵이 옵션 번호 없는 통합 id만 담고 있던 동안에는 조회가 실패해
  // 클러스터 주얼 인챈트가 통째로 KR로 남았다 — 사용자 제보로 확인된 실제 증상.
  it('소형 클러스터 주얼 인챈트 — 옵션 번호까지 붙은 id로 영문 변환', () => {
    expect(translateMod('enchant.stat_3948993189|42', '추가된 소형 패시브 스킬 효과: 방어도 15% 증가', poe1Map).en)
      .toBe('Added Small Passive Skills grant: 15% increased Armour')
  })
  it('특성 할당 인챈트도 옵션 번호로 해결 — 값이 아니라 이름이라 통합 템플릿으론 불가능했던 케이스', () => {
    expect(translateMod('enchant.stat_2954116742|1325', '할당 골렘의 피', poe1Map).en).toBe("Allocates Golem's Blood")
  })
  it('통합 id는 맵에서 제외 — 그 템플릿의 #는 숫자 자리가 아니라 엉뚱한 값이 채워진다', () => {
    expect(poe1Map['enchant.stat_3948993189']).toBeUndefined()
    expect(poe1Map['enchant.stat_2954116742']).toBeUndefined()
  })
})

describe('translateMod — (Local) 접미사 제거 (poe1 무기 지역 mod)', () => {
  // "(Local)"·KR "(특정)"은 거래소 필터 목록이 로컬/글로벌 동명 mod를 구분하려고 붙인 표시일 뿐 —
  // 실제 인게임 아이템 텍스트엔 없다. PoB는 인게임 텍스트만 파싱해서 이 문구가 있으면 mod를 인식 못 한다.
  it('냉기 피해 로컬 mod — EN 템플릿에서 (Local) 제거', () => {
    expect(translateMod('explicit.stat_1037193709', '냉기 피해 2~3 추가', poe1Map).en).toBe('Adds 2 to 3 Cold Damage')
  })
  it('번개 피해 로컬 mod — EN 템플릿에서 (Local) 제거', () => {
    expect(translateMod('explicit.stat_3336890334', '번개 피해 1~6 추가', poe1Map).en).toBe('Adds 1 to 6 Lightning Damage')
  })
})

describe('buildPobText — 전체 아이템 → PoB import 텍스트 (캡처 실데이터)', () => {
  // 2026-07-03 라이브 캡처: 공허 경고 · 사원 서판 (필드는 사용분만 축약)
  const captured = {
    name: '공허 경고', baseType: '사원 서판', rarity: 'Rare', ilvl: 80,
    implicitMods: ['지도에 [ContainsIncursion|바알 등대] 추가\n잔여 사용 횟수 10회'],
    explicitMods: [
      { description: '지도에서 발견하는 아이템 [Rarity|희귀도] 8% 증가', hash: 'stat.explicit.stat_2306002879' },
      { description: '지도에 [Rarity|희귀] 상자 2개 추가 등장', hash: 'stat.explicit.stat_231864447' },
      { description: '지도 내 [ContainsIncursion|바알 등대] 상자가 [Rarity|희귀] 등급일 확률 42% 증가', hash: 'stat.explicit.stat_2514439422' },
      { description: '지도에 [Shrine|성소]가 등장할 확률 88% 증가', hash: 'stat.explicit.stat_689816330' },
    ],
    extended: { hashes: { explicit: [['explicit.stat_2306002879', [2]], ['explicit.stat_231864447', [1]], ['explicit.stat_2514439422', [3]], ['explicit.stat_689816330', [0]]], implicit: [['implicit.stat_3035440454', [0]]] } },
  }
  it('캡처 아이템 전체 조립 — Item Class·Rarity·이름·base EN·ilvl·implicit·explicit', () => {
    const { text, missing } = buildPobText(captured, map, baseMap)
    expect(text).toBe([
      'Item Class: Tablet',
      'Rarity: Rare',
      'seominugi-bookmark-item-tablet', // 희귀 이름은 절차 생성(KR↔EN 데이터 부재) → ASCII 플레이스홀더(PoB 폰트에 한글 없음)
      'Temple Tablet',
      '--------',
      'Item Level: 80',
      '--------',
      'Adds Vaal Beacons to a Map (implicit)',
      '10 use remaining (implicit)',
      '--------',
      '8% increased Rarity of Items found in Map',
      'Map contains an additional Rare Chest',
      '42% increased chance Vaal Beacon Chests are Rare in Map',
      'Map has 88% increased chance to contain Shrines',
    ].join('\n'))
    expect(missing).toEqual([])
  })
  it('미매핑 base — KR 그대로 두고 missing에 기록', () => {
    const { text, missing } = buildPobText({ ...captured, baseType: '존재하지않는베이스' }, map, baseMap)
    expect(text).toContain('존재하지않는베이스')
    expect(text).not.toContain('Item Class:') // classId 없음 → 라인 생략
    expect(missing).toContain('base:존재하지않는베이스')
  })
  it('미매핑 mod — KR 라인 유지(태그 제거) + missing 기록', () => {
    const it2 = { ...captured, explicitMods: [{ description: '알 수 없는 [X|속성] 5% 증가', hash: 'stat.explicit.stat_00000' }] }
    const { text, missing } = buildPobText(it2, map, baseMap)
    expect(text).toContain('알 수 없는 속성 5% 증가')
    expect(missing).toContain('explicit:explicit.stat_00000')
  })
  it('이름 없는 아이템(마법 등) — 이름 라인 생략', () => {
    const { text } = buildPobText({ ...captured, name: '' }, map, baseMap)
    expect(text).not.toContain('공허 경고')
    expect(text.split('\n')[1]).toBe('Rarity: Rare')
    expect(text.split('\n')[2]).toBe('Temple Tablet')
  })
  it('타락(corrupted) — 마지막 섹션에 Corrupted', () => {
    const { text } = buildPobText({ ...captured, corrupted: true }, map, baseMap)
    expect(text.endsWith('--------\nCorrupted')).toBe(true)
  })
  it('enchant·fractured·crafted 그룹 — 접미 표기와 섹션 배치(poe1 장비)', () => {
    const tinyMap = {
      'enchant.stat_1': 'Enchant Line #',
      'fractured.stat_2': '#% Fractured Line',
      'explicit.stat_3': '#% Explicit Line',
      'crafted.stat_4': '+# Crafted Line',
    }
    const it2 = {
      name: '테스트', baseType: '사원 서판', rarity: 'Rare', ilvl: 60,
      enchantMods: ['인챈트 라인 5'], fracturedMods: ['10% 분열 라인'],
      explicitMods: [{ description: '20% 명시 라인', hash: 'stat.explicit.stat_3' }], craftedMods: ['+7 제작 라인'],
      extended: { hashes: { enchant: [['enchant.stat_1', [0]]], fractured: [['fractured.stat_2', [0]]], explicit: [['explicit.stat_3', [0]]], crafted: [['crafted.stat_4', [0]]] } },
    }
    const { text, missing } = buildPobText(it2, tinyMap, baseMap)
    const lines = text.split('\n')
    expect(lines).toContain('Enchant Line 5 (enchant)')
    expect(lines).toContain('10% Fractured Line (fractured)')
    expect(lines).toContain('20% Explicit Line')
    expect(lines).toContain('+7 Crafted Line (crafted)')
    // 섹션 배치: enchant는 별도 섹션(implicit 자리), fractured→explicit→crafted는 한 섹션에 이 순서
    expect(text.indexOf('(enchant)')).toBeLessThan(text.indexOf('Fractured'))
    expect(text.indexOf('Fractured')).toBeLessThan(text.indexOf('Explicit'))
    expect(text.indexOf('Explicit')).toBeLessThan(text.indexOf('Crafted'))
    expect(missing).toEqual([])
  })
  it('유니크 이름 — uniqueMap으로 EN 번역(PoB가 유니크를 EN 이름으로 인식)', () => {
    const uniq = { '이그니페리스': 'Igniferis' }
    const { text, missing } = buildPobText({ ...captured, rarity: 'Unique', name: '이그니페리스' }, map, baseMap, uniq)
    expect(text).toContain('Rarity: Unique')
    expect(text.split('\n')[2]).toBe('Igniferis')
    expect(missing.filter((m) => m.startsWith('unique:'))).toEqual([])
  })
  it('유니크 미매핑 이름 — KR 유지 + missing 기록', () => {
    const { text, missing } = buildPobText({ ...captured, rarity: 'Unique', name: '없는유니크' }, map, baseMap, {})
    expect(text).toContain('없는유니크')
    expect(missing).toContain('unique:없는유니크')
  })
  it('희귀 이름 — uniqueMap 무관, ASCII 플레이스홀더로 치환(classId 슬러그)', () => {
    const { text, missing } = buildPobText(captured, map, baseMap, { '공허 경고': 'X' })
    expect(text.split('\n')[2]).toBe('seominugi-bookmark-item-tablet') // rarity Rare → 유니크 맵 무시, 플레이스홀더
    expect(missing.filter((m) => m.startsWith('unique:'))).toEqual([])
  })
  it('희귀 + base 미매핑 — 슬러그 폴백 item', () => {
    const { text } = buildPobText({ ...captured, baseType: '없는베이스' }, map, baseMap)
    expect(text).toContain('seominugi-bookmark-item-item')
  })
  it('classId 공백은 하이픈 슬러그로 (Body Armours → body-armours)', () => {
    const { text } = buildPobText({ ...captured, baseType: '전사의 갑옷' }, map, { '전사의 갑옷': ['Warrior Plate', 'Body Armours'] })
    expect(text.split('\n')[2]).toBe('seominugi-bookmark-item-body-armours')
  })
  it('poe1 무기 로컬 mod("녹슨 손도끼") — 조립 결과에 (Local) 문구가 남지 않는다', () => {
    const hatchet = {
      name: '', baseType: '녹슨 손도끼', rarity: 'Normal', ilvl: 7,
      explicitMods: [
        { description: '냉기 피해 2~3 추가', hash: 'stat.explicit.stat_1037193709' },
        { description: '번개 피해 1~6 추가', hash: 'stat.explicit.stat_3336890334' },
      ],
      extended: { hashes: { explicit: [['explicit.stat_1037193709', [0]], ['explicit.stat_3336890334', [0]]] } },
    }
    const { text, missing } = buildPobText(hatchet, poe1Map, poe1BaseMap)
    expect(text).toContain('Adds 2 to 3 Cold Damage')
    expect(text).toContain('Adds 1 to 6 Lightning Damage')
    expect(text).not.toContain('(Local)') // PoB는 이 문구가 있으면 mod를 인식 못 함
    expect(missing).toEqual([])
  })
})

describe('buildReportText — 미변환 수동 제보용 텍스트(디스코드에 붙여넣기)', () => {
  it('미변환 항목이 있으면 아이템·게임·미변환 목록을 담은 텍스트 생성', () => {
    const text = buildReportText({ name: '공허 경고', baseType: '사원 서판' }, ['base:골절늑골 부적', 'enchant:enchant.stat_2954116742'], 'poe1')
    expect(text).toContain('공허 경고')
    expect(text).toContain('사원 서판')
    expect(text).toContain('poe1')
    expect(text).toContain('base:골절늑골 부적')
    expect(text).toContain('enchant:enchant.stat_2954116742')
  })
  it('이름 없는 아이템(마법 등)도 베이스만으로 식별 가능', () => {
    const text = buildReportText({ name: '', baseType: '녹슨 손도끼' }, ['base:녹슨 손도끼'], 'poe1')
    expect(text).toContain('녹슨 손도끼')
  })
  it('미변환 없으면 null(제보할 게 없음)', () => {
    expect(buildReportText({ name: 'x', baseType: 'y' }, [], 'poe2')).toBeNull()
    expect(buildReportText({ name: 'x', baseType: 'y' }, null, 'poe2')).toBeNull()
  })
})
