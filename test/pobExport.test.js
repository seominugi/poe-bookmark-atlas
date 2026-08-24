// 영문 PoB 조립기. 번역 계층을 걷어낸 뒤(2026-08-23)의 계약을 고정한다.
//
// 핵심은 **두 경로 다 설명을 손대지 않는다**는 것이다.
//   ① 영문 원본 `{ en: true }` — 영문 거래소에서 같은 매물 id 로 받아온 아이템
//   ② 최소 폴백 (기본)        — KR 아이템. 베이스 이름·Item Class 만 baseMap 으로 영문화
// 조립기가 책임지는 건 **섹션 순서·구분선·접미 표기**이지 번역이 아니다.
import { describe, it, expect } from 'vitest'
import { stripTags, radiusLine, qualityLine, socketsLine, influenceLines, buildPobText } from '../src/lib/pobExport.js'
import baseMap from '../src/lib/pobBaseMap.json'
import poe1BaseMap from '../src/lib/pobBaseMap.poe1.json'

describe('stripTags — [Key|표시텍스트] 마크업 제거', () => {
  it('[Rarity|희귀도] → 희귀도', () => {
    expect(stripTags('지도에서 발견하는 아이템 [Rarity|희귀도] 8% 증가')).toBe('지도에서 발견하는 아이템 희귀도 8% 증가')
  })
  it('여러 태그 + [단일] 형태도 처리', () => {
    expect(stripTags('지도 내 [ContainsIncursion|바알 등대] 상자가 [Rarity|희귀] 등급')).toBe('지도 내 바알 등대 상자가 희귀 등급')
  })
})

describe('개별 라인 조립기', () => {
  const prop = (name, v) => ({ properties: [{ name, values: [[v, 0]] }] })

  it('반경 — 실측한 KR 표기만 영문으로 바꾼다', () => {
    expect(radiusLine(prop('반경', '대형'))).toBe('Radius: Large')
    expect(radiusLine(prop('적용 반경', '작게'))).toBe('Radius: Small') // 실측(불가능한 탈출, 2026-08-06 제보)
    expect(radiusLine(prop('적용 반경', '변수'))).toBe('Radius: Variable') // 실측(희망의 실타래, 2026-08-23)
  })
  it('반경 — 모르는 KR 표기는 추측해 채우지 않고 그대로 내보낸다', () => {
    expect(radiusLine(prop('반경', '초대형'))).toBe('Radius: 초대형')
  })
  it('반경 — 영문 경로의 값은 표에 없어도 그대로 통과한다', () => {
    expect(radiusLine({ properties: [{ name: 'Radius', values: [['Variable', 0]] }] })).toBe('Radius: Variable')
  })
  it('반경 속성이 없으면 줄을 만들지 않는다', () => {
    expect(radiusLine({})).toBeNull()
    expect(radiusLine({ properties: [{ name: '품질', values: [['+20%', 1]] }] })).toBeNull()
  })

  it('품질 — 숫자만 뽑아 PoB 포맷으로', () => {
    expect(qualityLine(prop('품질', '+20%'))).toBe('Quality: +20%')
    expect(qualityLine(prop('Quality', '+13%'))).toBe('Quality: +13%')
    expect(qualityLine({})).toBeNull()
  })

  it('소켓 — 같은 group은 "-", 다른 group은 공백', () => {
    const sockets = [{ group: 0, sColour: 'R' }, { group: 0, sColour: 'G' }, { group: 0, sColour: 'B' }, { group: 1, sColour: 'W' }]
    expect(socketsLine({ sockets })).toBe('Sockets: R-G-B W')
    expect(socketsLine({})).toBeNull()
  })
  it('소켓 — 색 미상은 W로 대체한다(링크 구조가 더 중요하다)', () => {
    expect(socketsLine({ sockets: [{ group: 0 }, { group: 0, sColour: 'R' }] })).toBe('Sockets: W-R')
  })

  it('영향력 — 켜진 것만 "<이름> Item" 줄로', () => {
    expect(influenceLines({ influences: { shaper: true, elder: true } })).toEqual(['Shaper Item', 'Elder Item'])
    expect(influenceLines({})).toEqual([])
  })
})

describe('buildPobText — 최소 폴백(KR 아이템, 기본 경로)', () => {
  // 2026-07-03 라이브 캡처: 공허 경고 · 사원 서판 (필드는 사용분만 축약)
  const captured = {
    name: '공허 경고', baseType: '사원 서판', rarity: 'Rare', ilvl: 80,
    implicitMods: ['지도에 [ContainsIncursion|바알 등대] 추가\n잔여 사용 횟수 10회'],
    explicitMods: [
      { description: '지도에서 발견하는 아이템 [Rarity|희귀도] 8% 증가', hash: 'stat.explicit.stat_2306002879' },
      { description: '지도에 [Rarity|희귀] 상자 2개 추가 등장', hash: 'stat.explicit.stat_231864447' },
    ],
  }

  it('전체 조립 — 베이스만 영문, mod 는 KR 원문 그대로(태그만 제거)', () => {
    const { text, missing } = buildPobText(captured, baseMap)
    expect(text).toBe([
      'Item Class: Tablet',
      'Rarity: Rare',
      'seominugi-bookmark-item-tablet', // 희귀 이름은 절차 생성(KR↔EN 데이터 부재) → ASCII 플레이스홀더(PoB 폰트에 한글 없음)
      'Temple Tablet',
      '--------',
      'Item Level: 80',
      '--------',
      '지도에 바알 등대 추가 (implicit)',
      '잔여 사용 횟수 10회 (implicit)',
      '--------',
      '지도에서 발견하는 아이템 희귀도 8% 증가',
      '지도에 희귀 상자 2개 추가 등장',
    ].join('\n'))
    expect(missing).toEqual([])
  })

  it('여러 줄 mod 는 줄을 잃지 않는다 — 번역 경로가 첫 줄을 삼키던 버그(제보 2026-08-23)', () => {
    const jewel = {
      name: '희망의 실타래', baseType: '진홍색 주얼', rarity: 'Unique', ilvl: 87, corrupted: true,
      properties: [{ name: '적용 반경', values: [['변수', 0]] }],
      explicitMods: [
        { description: '거대한 반경의 패시브 스킬에만 영향을 미침', hash: 'stat.explicit.stat_3642528642.5' },
        { description: '반경 내 패시브 스킬이 트리와 연결되지 않아도 할당 가능\n모든 원소 저항 -16%\n통로', hash: 'stat.explicit.stat_2901986750' },
      ],
    }
    const { text } = buildPobText(jewel, poe1BaseMap)
    const lines = text.split('\n')
    expect(lines).toContain('Radius: Variable')
    // 3줄이 3줄로 — 그리고 부호가 겹치지 않는다(번역 경로는 '+-16%'를 만들었다)
    expect(lines).toContain('반경 내 패시브 스킬이 트리와 연결되지 않아도 할당 가능')
    expect(lines).toContain('모든 원소 저항 -16%')
    expect(lines).toContain('통로')
    expect(text).not.toContain('+-16%')
  })

  it('유니크 이름은 번역하지 않는다 — 사전을 지웠다', () => {
    const { text, missing } = buildPobText({ ...captured, rarity: 'Unique', name: '이그니페리스' }, baseMap)
    expect(text).toContain('Rarity: Unique')
    expect(text.split('\n')[2]).toBe('이그니페리스')
    expect(missing).toEqual([]) // '미변환'으로 세지 않는다 — 고칠 대상이 없으므로 제보해도 소용없다
  })

  it('미매핑 base — KR 그대로 두고 missing에 기록(PoB가 아이템을 식별 못 하는 유일한 경우)', () => {
    const { text, missing } = buildPobText({ ...captured, baseType: '존재하지않는베이스' }, baseMap)
    expect(text).toContain('존재하지않는베이스')
    expect(text).not.toContain('Item Class:') // classId 없음 → 라인 생략
    expect(missing).toContain('base:존재하지않는베이스')
  })

  it('이름 없는 아이템(마법 등) — 이름 라인 생략', () => {
    const { text } = buildPobText({ ...captured, name: '' }, baseMap)
    expect(text.split('\n')[1]).toBe('Rarity: Rare')
    expect(text.split('\n')[2]).toBe('Temple Tablet')
  })

  it('타락(corrupted) — 마지막 섹션에 Corrupted', () => {
    const { text } = buildPobText({ ...captured, corrupted: true }, baseMap)
    expect(text.endsWith('--------\nCorrupted')).toBe(true)
  })

  it('희귀 + base 미매핑 — 슬러그 폴백 item', () => {
    const { text } = buildPobText({ ...captured, baseType: '없는베이스' }, baseMap)
    expect(text).toContain('seominugi-bookmark-item-item')
  })

  it('classId 공백은 하이픈 슬러그로 (Body Armours → body-armours)', () => {
    const { text } = buildPobText({ ...captured, baseType: '전사의 갑옷' }, { '전사의 갑옷': ['Warrior Plate', 'Body Armours'] })
    expect(text.split('\n')[2]).toBe('seominugi-bookmark-item-body-armours')
  })

  it('enchant·fractured·crafted — 접미 표기와 섹션 배치', () => {
    const it2 = {
      name: '테스트', baseType: '사원 서판', rarity: 'Rare', ilvl: 60,
      enchantMods: ['인챈트 라인 5'], fracturedMods: ['10% 분열 라인'],
      explicitMods: [{ description: '20% 명시 라인', hash: 'stat.explicit.stat_3' }], craftedMods: ['+7 제작 라인'],
    }
    const { text } = buildPobText(it2, baseMap)
    const lines = text.split('\n')
    expect(lines).toContain('인챈트 라인 5 (enchant)')
    expect(lines).toContain('10% 분열 라인 (fractured)')
    expect(lines).toContain('20% 명시 라인')
    expect(lines).toContain('+7 제작 라인 (crafted)')
    // 섹션 배치: enchant는 별도 섹션(implicit 자리), fractured→explicit→crafted는 한 섹션에 이 순서
    expect(text.indexOf('(enchant)')).toBeLessThan(text.indexOf('분열'))
    expect(text.indexOf('분열')).toBeLessThan(text.indexOf('명시'))
    expect(text.indexOf('명시')).toBeLessThan(text.indexOf('제작'))
  })

  it('품질·소켓·영향력이 인게임 Ctrl+C 순서로 들어간다', () => {
    const gear = {
      name: '', baseType: '녹슨 손도끼', rarity: 'Rare', ilvl: 84,
      properties: [{ name: '품질', values: [['+20%', 1]] }],
      sockets: [{ group: 0, sColour: 'R' }, { group: 0, sColour: 'G' }, { group: 0, sColour: 'B' }, { group: 1, sColour: 'W' }],
      influences: { shaper: true, elder: true },
      corrupted: true,
    }
    const { text } = buildPobText(gear, poe1BaseMap)
    expect(text).toBe([
      'Item Class: One Hand Axes',
      'Rarity: Rare',
      'Rusted Hatchet', // name이 빈 문자열이라 이름 줄은 안 나온다(기존 동작)
      '--------',
      'Quality: +20%',
      '--------',
      'Sockets: R-G-B W',
      '--------',
      'Item Level: 84',
      '--------',
      'Shaper Item',
      'Elder Item',
      '--------',
      'Corrupted',
    ].join('\n'))
  })

  it('품질·반경이 있으면 한 속성 섹션에 함께 들어간다', () => {
    const jewel = { name: '고상한 오만', baseType: '무궁한 주얼', rarity: 'Unique', ilvl: 84,
      properties: [{ name: '품질', values: [['+10%', 1]] }, { name: '반경', values: [['대형', 0]] }] }
    const { text } = buildPobText(jewel, poe1BaseMap)
    expect(text).toContain('Quality: +10%\nRadius: Large')
  })

  it('해당 필드가 없으면 줄을 만들지 않는다(회귀)', () => {
    const { text } = buildPobText({ name: '', baseType: '녹슨 손도끼', rarity: 'Rare', ilvl: 84 }, poe1BaseMap)
    expect(text).not.toContain('Quality:')
    expect(text).not.toContain('Sockets:')
    expect(text).not.toContain('Radius:')
    expect(text).not.toContain('Shaper Item')
    expect(text).not.toContain('Corrupted')
  })
})

describe('buildPobText — 영문 원본 경로 { en: true }', () => {
  // 영문 거래소에서 같은 매물 id 로 받아온 아이템. baseMap 은 KR 키라 쓸 수 없고,
  // Item Class 는 영문 응답에 없어서(2026-08-17 실측) KR 아이템에서 구해 넘긴다.
  const enItem = {
    name: 'Thread of Hope', baseType: 'Crimson Jewel', rarity: 'Unique', ilvl: 87, corrupted: true,
    properties: [{ name: 'Radius', values: [['Variable', 0]] }],
    explicitMods: [
      { description: 'Only affects Passives in Massive Ring' },
      { description: 'Passives in Radius can be Allocated without being connected to your tree\n-16% to all Elemental Resistances\nPassage' },
    ],
  }

  it('설명을 그대로 쓰고 baseMap 을 보지 않는다', () => {
    const { text, missing } = buildPobText(enItem, {}, { en: true, itemClass: 'Jewels' })
    expect(text).toBe([
      'Item Class: Jewels',
      'Rarity: Unique',
      'Thread of Hope',
      'Crimson Jewel',
      '--------',
      'Radius: Variable',
      '--------',
      'Item Level: 87',
      '--------',
      'Only affects Passives in Massive Ring',
      'Passives in Radius can be Allocated without being connected to your tree',
      '-16% to all Elemental Resistances',
      'Passage',
      '--------',
      'Corrupted',
    ].join('\n'))
    // 영문 베이스는 KR 키 맵에 없는 게 정상 — missing 으로 세면 안 된다
    expect(missing).toEqual([])
  })

  it('itemClass 를 안 넘기면 Item Class 줄이 없다 — 영문 응답에 그 필드가 없기 때문', () => {
    const { text } = buildPobText(enItem, {}, { en: true })
    expect(text.split('\n')[0]).toBe('Rarity: Unique')
  })

  it('희귀 아이템 이름은 영문 경로에서도 플레이스홀더 — PoB 폰트·파싱과 무관한 표시용', () => {
    const rare = { name: 'Doom Fang', baseType: 'Rusted Hatchet', rarity: 'Rare', ilvl: 84 }
    const { text } = buildPobText(rare, {}, { en: true, itemClass: 'One Hand Axes' })
    expect(text.split('\n')[2]).toBe('seominugi-bookmark-item-one-hand-axes')
  })
})
