import { describe, it, expect } from 'vitest'
import { valuesByKoTemplate, translateMod, buildPobText } from '../src/lib/pobExport.js'

// 제보 2026-08-17: "pob 복사에 전체 방어도, 생명력 재생 등 일부 항목이 잘못 복사됩니다."
//
// 원인: 값 추출이 KR 설명의 **모든 숫자**를 순서대로 걷었다. 그런데 KR 문구에는 값이 아닌 숫자가
// 박혀 있는 경우가 많다 — "1초마다", "3초마다", "사용 1회당". 그러면 # 하나짜리 템플릿에
// 엉뚱한 숫자가 들어간다. 라이브 실측(2026-08-17) 기준 그런 KR stat 이 1,239개다.
//
// 아래 KR 템플릿·설명은 전부 라이브 거래소에서 그대로 가져온 실제 값이다.
const KO = {
  'explicit.stat_3325883026': '1초마다 생명력 # 재생',
  'explicit.stat_4291461939': '1초마다 마나 # 재생',
  'explicit.stat_836936635': '1초마다 생명력의 #% 재생',
  'explicit.stat_2451402625': '방어도 및 회피 #% 증가(특정)',
  'explicit.stat_3299347043': '생명력 최대치 +#',
  'explicit.stat_388617051': '사용 1회당 충전 소모량 #% 증가',
}
const EN = {
  'explicit.stat_3325883026': 'Regenerate # Life per second',
  'explicit.stat_4291461939': 'Regenerate # Mana per second',
  'explicit.stat_836936635': 'Regenerate #% of Life per second',
  'explicit.stat_2451402625': '#% increased Armour and Evasion (Local)',
  'explicit.stat_3299347043': '+# to maximum Life',
  'explicit.stat_388617051': '#% increased Charges used',
}

describe('valuesByKoTemplate — KR 템플릿의 # 자리에서만 값을 뽑는다', () => {
  it('문구에 박힌 숫자를 값으로 오인하지 않는다 (제보 재현)', () => {
    expect(valuesByKoTemplate(KO['explicit.stat_3325883026'], '1초마다 생명력 26.8 재생')).toEqual(['26.8'])
    expect(valuesByKoTemplate(KO['explicit.stat_4291461939'], '1초마다 마나 4.2 재생')).toEqual(['4.2'])
    expect(valuesByKoTemplate(KO['explicit.stat_388617051'], '사용 1회당 충전 소모량 15% 증가')).toEqual(['15'])
  })

  it('거래소 전용 접미 "(특정)"이 붙은 템플릿도 실제 아이템 문구와 맞춘다', () => {
    expect(valuesByKoTemplate(KO['explicit.stat_2451402625'], '방어도 및 회피 53% 증가')).toEqual(['53'])
  })

  it('음수·소수도 그대로 잡는다', () => {
    expect(valuesByKoTemplate('냉기 저항 +#%', '냉기 저항 +-12%')).toEqual(['-12'])
    expect(valuesByKoTemplate(KO['explicit.stat_836936635'], '1초마다 생명력의 1.2% 재생')).toEqual(['1.2'])
  })

  it('템플릿이 없거나 문구가 어긋나면 null — 호출부가 기존 방식으로 폴백한다', () => {
    expect(valuesByKoTemplate(undefined, '1초마다 생명력 26.8 재생')).toBeNull()
    expect(valuesByKoTemplate('전혀 다른 문구 #', '1초마다 생명력 26.8 재생')).toBeNull()
    expect(valuesByKoTemplate('숫자 없는 템플릿', '아무 값')).toBeNull()
  })
})

describe('translateMod — KR 템플릿을 받으면 값이 제자리에 들어간다', () => {
  const t = (id, ko) => translateMod(id, ko, EN, {}, KO).en

  it('생명력 재생 (제보 항목)', () => {
    expect(t('explicit.stat_3325883026', '1초마다 생명력 26.8 재생')).toBe('Regenerate 26.8 Life per second')
  })

  it('마나 재생·비율 재생도 같은 부류다', () => {
    expect(t('explicit.stat_4291461939', '1초마다 마나 4.2 재생')).toBe('Regenerate 4.2 Mana per second')
    expect(t('explicit.stat_836936635', '1초마다 생명력의 1.2% 재생')).toBe('Regenerate 1.2% of Life per second')
  })

  it('방어도 계열 (제보 항목)', () => {
    expect(t('explicit.stat_2451402625', '방어도 및 회피 53% 증가')).toBe('53% increased Armour and Evasion')
  })

  it('원래 정상이던 것은 그대로다 — 회귀 없음', () => {
    expect(t('explicit.stat_3299347043', '생명력 최대치 +136')).toBe('+136 to maximum Life')
  })

  // koMap 을 안 넘기면 예전 동작(모든 숫자 순서대로) — 이게 버그였음을 못 박아 둔다.
  it('KR 템플릿이 없으면 예전처럼 첫 숫자를 쓴다 (버그 재현)', () => {
    expect(translateMod('explicit.stat_3325883026', '1초마다 생명력 26.8 재생', EN).en)
      .toBe('Regenerate 1 Life per second')
  })
})

describe('buildPobText — 아이템 전체 경로', () => {
  const item = {
    baseType: '전신 가죽 갑옷', rarity: 'Rare', name: '솔 외투', ilvl: 42,
    explicitMods: [
      { description: '방어도 및 회피 53% 증가', hash: 'stat.explicit.stat_2451402625' },
      { description: '1초마다 생명력 26.8 재생', hash: 'stat.explicit.stat_3325883026' },
      { description: '생명력 최대치 +136', hash: 'stat.explicit.stat_3299347043' },
    ],
  }

  it('KR 템플릿을 넘기면 값이 전부 제자리에 들어간다', () => {
    const { text } = buildPobText(item, EN, {}, {}, {}, KO)
    expect(text).toContain('Regenerate 26.8 Life per second')
    expect(text).toContain('53% increased Armour and Evasion')
    expect(text).toContain('+136 to maximum Life')
    expect(text).not.toContain('Regenerate 1 Life per second')
  })
})
