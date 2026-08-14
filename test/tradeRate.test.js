// 거래소 요청 제한 다루기.
//
// 왜 이 계산이 따로 있나: 429 를 맞으면 **거래소 검색 자체가 멈춘다**(정지가 엔드포인트 단위라,
// 확장뿐 아니라 사용자가 지금 하려던 검색도 막힌다). 그래서 '넘지 않는 것'이 '빨리 하는 것'보다
// 훨씬 중요하고, 그 판단을 눈대중이 아니라 실측 정책값에 묶어 둔다.
import { describe, it, expect } from 'vitest'
import { parseRule, parseRules, nextDelay, retryAfterMs, waitSeconds, MIN_GAP_MS } from '../src/lib/tradeRate.js'

describe('규칙 파싱', () => {
  it('요청수:기간:정지 를 읽는다', () => {
    expect(parseRule('6:4:10')).toEqual({ hits: 6, period: 4, restricted: 10 })
  })

  it('쉼표로 이어진 여러 규칙을 전부 읽는다 (IP 규칙은 4개가 온다)', () => {
    const rules = parseRules('12:4:60,16:12:60,100:300:300,1000:10800:1800')
    expect(rules).toHaveLength(4)
    expect(rules[2]).toEqual({ hits: 100, period: 300, restricted: 300 })
  })

  it('형식이 다르면 조용히 버린다 — 헤더가 바뀌어도 터지지 않게', () => {
    expect(parseRule('이상한값')).toBe(null)
    expect(parseRules('')).toEqual([])
    expect(parseRules(undefined)).toEqual([])
    expect(parseRules('6:4:10,망가짐,3:1:5')).toHaveLength(2)
  })
})

describe('요청 간격', () => {
  // 계정 규칙 6요청/4초 = 667ms. 이보다 촘촘하면 7번째에서 10초 정지를 맞는다.
  it('최소 간격은 계정 규칙(6/4초)을 넘지 않는다', () => {
    expect(MIN_GAP_MS).toBeGreaterThanOrEqual(4000 / 6)
  })

  it('충분히 지났으면 기다리지 않는다', () => {
    expect(nextDelay(1000, 1000 + MIN_GAP_MS)).toEqual({ wait: 0, blocked: false })
  })

  it('너무 빠르면 남은 만큼만 기다린다', () => {
    expect(nextDelay(1000, 1200)).toEqual({ wait: MIN_GAP_MS - 200, blocked: false })
  })

  it('첫 요청은 기다리지 않는다', () => {
    expect(nextDelay(0, 5000)).toEqual({ wait: 0, blocked: false })
  })

  // 막힌 동안은 '조금 기다렸다 보내기'가 아니라 **보내지 않고 알린다** — 10초를 말없이 멈춰 있으면
  // 사용자는 고장으로 읽고, 재시도하면 정지가 더 길어진다.
  it('429 로 막혀 있으면 blocked 로 알린다', () => {
    expect(nextDelay(0, 1000, 6000)).toEqual({ wait: 5000, blocked: true })
  })

  it('막힘이 풀렸으면 평소 간격으로 돌아온다', () => {
    expect(nextDelay(0, 7000, 6000)).toEqual({ wait: 0, blocked: false })
  })
})

describe('429 대기 시간', () => {
  const hdr = (o) => ({ get: (k) => o[k] })

  it('Retry-After(초)가 있으면 그것을 쓴다', () => {
    expect(retryAfterMs(hdr({ 'retry-after': '12' }))).toBe(12000)
  })

  it('없으면 state 헤더의 정지 시간 중 가장 큰 값', () => {
    expect(retryAfterMs(hdr({
      'x-rate-limit-account-state': '7:4:10',
      'x-rate-limit-ip-state': '2:12:0,101:300:300',
    }))).toBe(300000)
  })

  // 0 을 돌려주면 즉시 재시도해 정지가 더 길어진다 — 반드시 양수로 떨어져야 한다.
  it('아무것도 못 읽으면 계정 정책 최소치(10초)로 떨어진다', () => {
    expect(retryAfterMs(hdr({}))).toBe(10000)
    expect(retryAfterMs(null)).toBe(10000)
  })

  it('평범한 객체 헤더도 읽는다 (get 없는 경우)', () => {
    expect(retryAfterMs({ 'retry-after': '5' })).toBe(5000)
  })
})

describe('사용자에게 보여줄 초', () => {
  it('올림한다 — 0초라고 말하지 않는다', () => {
    expect(waitSeconds(1)).toBe(1)
    expect(waitSeconds(9400)).toBe(10)
  })
})
