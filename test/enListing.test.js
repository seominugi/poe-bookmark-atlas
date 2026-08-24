import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isSafeListingId, enFetchPath, pickItem, EN_ORIGIN } from '../src/lib/enListing.js'
import { buildPobText } from '../src/lib/pobExport.js'

// 서비스 워커가 돌려주는 reason 과 콘텐츠 스크립트가 분기하는 값이 **문자열로만** 이어져 있다.
// 어긋나면 권한 안내가 영영 안 뜬다(조용히 번역본으로 폴백만 한다) — 타입이 못 잡아주는 자리라
// 소스를 읽어 계약을 지킨다.
describe('권한 없음 안내 — 서비스 워커 ↔ 콘텐츠 스크립트 계약', () => {
  const sw = readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8')
  const cm = readFileSync(new URL('../src/content/content-main.js', import.meta.url), 'utf8')

  it("서비스 워커는 권한이 없을 때 reason: 'no-permission' 을 돌려준다", () => {
    expect(sw).toMatch(/handleFetchEn[\s\S]*?reason: 'no-permission'/)
  })

  it('콘텐츠 스크립트는 그 값으로 안내를 띄운다', () => {
    expect(cm).toContain("reason === 'no-permission'")
    expect(cm).toMatch(/function noticeEnPermission/)
  })

  it('안내는 한 번만 뜬다 — PoB 복사는 반복 동작이라 매번 뜨면 잔소리가 된다', () => {
    expect(cm).toMatch(/enPermNoticed[\s\S]{0,120}return/)
  })
})

describe('영문 매물 조회 — 입력 검증', () => {
  it('거래소가 주는 hex 매물 id 만 받는다 — 서비스 워커가 임의 주소를 부르지 않게', () => {
    expect(isSafeListingId('93e5cc6cce5848d1c11c75e461e92cc36759a4ad6aec999bee04369d666b56e7')).toBe(true)
    expect(isSafeListingId('dcb0cf162020172f0000000000000000')).toBe(true)
    for (const bad of ['../../etc/passwd', 'abc', '', null, undefined, 42, 'zzzz'.repeat(8), 'a/b', 'a?b=1']) {
      expect(isSafeListingId(bad)).toBe(false)
    }
  })

  it('게임별 경로가 갈린다', () => {
    const id = 'a'.repeat(64)
    expect(enFetchPath('poe1', id)).toBe(`/api/trade/fetch/${id}`)
    expect(enFetchPath('poe2', id)).toBe(`/api/trade2/fetch/${id}`)
  })

  it('영문 거래소 출처는 고정이다', () => {
    expect(EN_ORIGIN).toBe('https://www.pathofexile.com')
  })

  it('매물이 팔렸으면 null — 응답은 200 이어도 result 가 빈다', () => {
    expect(pickItem({ result: [] })).toBeNull()
    expect(pickItem({ result: [null] })).toBeNull()
    expect(pickItem(null)).toBeNull()
    expect(pickItem({ result: [{ item: { baseType: 'Carnal Armour' } }] })).toEqual({ baseType: 'Carnal Armour' })
  })
})

// 실제 영문 거래소 응답 형태 (2026-08-17 라이브에서 그대로 가져옴)
const EN_ITEM = {
  baseType: 'Carnal Armour', name: 'Tempest Salvation', rarity: 'Rare', ilvl: 81,
  properties: [{ name: 'Quality', values: [['+7%', 1]] }, { name: 'Evasion Rating', values: [['490', 1]] }],
  sockets: [{ group: 0, sColour: 'G' }, { group: 0, sColour: 'R' }, { group: 1, sColour: 'B' }],
  implicitMods: [{ description: '+21 to maximum Mana', hash: 'stat.implicit.stat_1050105434' }],
  explicitMods: [
    { description: '18% increased Evasion and Energy Shield', hash: 'stat.explicit.stat_1999113824' },
    { description: 'Regenerate 13.8 Life per second', hash: 'stat.explicit.stat_3325883026' },
  ],
}

describe('buildPobText — 영문 원본 경로 (opts.en)', () => {
  // baseMap 은 KR 키라 영문 경로에선 쓰지 않는다 — 빈 객체를 넘겨도 missing 이 생기면 안 된다.
  const out = () => buildPobText(EN_ITEM, {}, { en: true, itemClass: 'Body Armours' })

  it('번역 없이 설명을 그대로 쓴다 — 우리가 값을 다시 채우지 않는다', () => {
    const { text } = out()
    expect(text).toContain('Regenerate 13.8 Life per second')
    expect(text).toContain('18% increased Evasion and Energy Shield')
    expect(text).toContain('+21 to maximum Mana (implicit)')
  })

  it('번역이 없으니 미변환 항목도 없다 — 맵 없이도 깨끗하다', () => {
    expect(out().missing).toEqual([])
  })

  it('영문 베이스·유니크 이름을 그대로 쓴다 (사전 불필요)', () => {
    const { text } = out()
    expect(text).toContain('Carnal Armour')
    const uniq = buildPobText({ ...EN_ITEM, rarity: 'Unique', name: 'Apocalypse Span' }, {}, { en: true, itemClass: 'Shields' })
    expect(uniq.text).toContain('Apocalypse Span')
    expect(uniq.missing).toEqual([])
  })

  it('Item Class 는 넘겨받는다 — 영문 응답에 그 필드가 없다', () => {
    expect(out().text).toContain('Item Class: Body Armours')
    const none = buildPobText(EN_ITEM, {}, { en: true })
    expect(none.text).not.toContain('Item Class:')
    expect(none.missing).toEqual([]) // 없다고 미변환으로 세지 않는다
  })

  it('품질·소켓·아이템 레벨은 기존 조립을 그대로 탄다', () => {
    const { text } = out()
    expect(text).toContain('Quality: +7%')
    expect(text).toContain('Sockets: G-R B')
    expect(text).toContain('Item Level: 81')
  })

  it('PoE2 게임 마크업은 벗긴다', () => {
    const { text } = buildPobText(
      { ...EN_ITEM, explicitMods: [{ description: '18% increased [Block] chance', hash: 'stat.explicit.x' }] },
      {}, { en: true, itemClass: 'Shields' },
    )
    expect(text).toContain('18% increased Block chance')
    expect(text).not.toContain('[Block]')
  })
})
