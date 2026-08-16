import { describe, it, expect } from 'vitest'
import { tradeApiOrigin, DEFAULT_TRADE_ORIGIN } from '../src/lib/tradeSearch.js'

// 거래소 데이터를 **사용자가 보고 있는 호스트**에서 받기 위한 관문.
// 두 호스트 실측(2026-08-16): filter·option·static·stat 은 id 가 같지만 items 의 type 은
// 로컬라이즈된 이름이라 호스트를 고정하면 유형 이름이 통째로 어긋난다.
describe('tradeApiOrigin', () => {
  it('허용된 두 거래소 출처를 그대로 쓴다', () => {
    expect(tradeApiOrigin('https://poe.kakaogames.com')).toBe('https://poe.kakaogames.com')
    expect(tradeApiOrigin('https://www.pathofexile.com')).toBe('https://www.pathofexile.com')
  })

  it('경로가 붙어 와도 출처만 뽑는다 (content script 가 location.origin 을 보내지만 방어)', () => {
    expect(tradeApiOrigin('https://www.pathofexile.com/trade/search/Standard'))
      .toBe('https://www.pathofexile.com')
  })

  // 서비스 워커는 이 값을 그대로 fetch 한다 — 모르는 출처를 통과시키면 임의 주소로 요청이 나간다.
  it('허용 목록 밖은 기본 출처로 떨어뜨린다', () => {
    for (const bad of [
      'https://evil.example.com',
      'https://pathofexile.com', // www 없는 호스트는 허용 목록에 없다
      'https://poe.kakaogames.com.evil.com',
      'http://poe.kakaogames.com', // https 만 허용
      'javascript:alert(1)',
      '', null, undefined, 42, {},
    ]) {
      expect(tradeApiOrigin(bad)).toBe(DEFAULT_TRADE_ORIGIN)
    }
  })

  it('기본 출처는 카카오 — 출처를 못 받은 옛 경로도 지금까지처럼 동작한다', () => {
    expect(DEFAULT_TRADE_ORIGIN).toBe('https://poe.kakaogames.com')
  })
})
