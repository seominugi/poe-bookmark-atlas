// src/lib/tradeRate.js
// 거래소 요청 제한(rate limit) 다루기 — 응답 헤더가 정책을 그대로 알려준다.
//
// 실측 (2026-08-13, /api/trade/fetch 응답 헤더, 정책명 `trade-fetch-request-limit`):
//   x-rate-limit-account : 6:4:10                                   ← 4초에 6요청, 넘으면 10초 정지
//   x-rate-limit-ip      : 12:4:60,16:12:60,100:300:300,1000:10800:1800
//   x-rate-limit-*-state : 같은 형식으로 **현재 사용량**을 돌려준다 (예: 1:4:0)
//   → 형식은 `요청수:기간(초):정지(초)`.
//
// ⚠ 병목은 계정 규칙 6요청/4초다. 그리고 이 예산은 **거래소 사이트 자신과 공유**한다 —
//   검색 결과를 보여줄 때 사이트도 같은 /api/trade/fetch 를 쓴다. 우리가 예산을 태우면
//   사용자의 실제 검색이 막힌다(429 정지는 엔드포인트 단위라 검색 조회까지 멈춘다).

/** 계정 규칙(6요청/4초)을 절대 넘지 않는 최소 간격. 4000/6 = 667ms → 여유를 둬 700. */
export const MIN_GAP_MS = 700

/** `6:4:10` 같은 규칙 문자열 하나를 파싱. 형식이 다르면 null. */
export function parseRule(s) {
  const m = /^(\d+):(\d+):(\d+)$/.exec(String(s || '').trim())
  if (!m) return null
  return { hits: +m[1], period: +m[2], restricted: +m[3] }
}

/** 헤더 값(`a,b,c`)의 규칙들을 배열로. 빈 값이면 빈 배열. */
export function parseRules(headerValue) {
  return String(headerValue || '').split(',').map(parseRule).filter(Boolean)
}

/**
 * 지금 요청을 보내려면 몇 ms 기다려야 하는가.
 * @param {number} lastAt 마지막 요청 시각(ms). 없으면 0.
 * @param {number} now 현재 시각(ms)
 * @param {number} blockedUntil 429 로 막힌 시각(ms). 없으면 0.
 * @returns {{wait:number, blocked:boolean}} blocked=true 면 사용자에게 알려야 한다(그냥 기다리면 너무 길다)
 */
export function nextDelay(lastAt, now, blockedUntil = 0) {
  if (blockedUntil > now) return { wait: blockedUntil - now, blocked: true }
  const since = now - (lastAt || 0)
  return { wait: since >= MIN_GAP_MS ? 0 : MIN_GAP_MS - since, blocked: false }
}

/**
 * 429 응답에서 "얼마나 막혔는지"(ms)를 뽑는다.
 * Retry-After(초)가 있으면 그것이 정본이고, 없으면 state 헤더들의 정지 시간 중 가장 큰 값을 쓴다.
 * 아무것도 못 읽으면 정책 최소치(계정 10초)로 떨어진다 — 0 을 돌려주면 즉시 재시도해 더 오래 막힌다.
 */
export function retryAfterMs(headers) {
  const get = (k) => (headers && typeof headers.get === 'function' ? headers.get(k) : headers && headers[k])
  const ra = Number(get('retry-after'))
  if (Number.isFinite(ra) && ra > 0) return ra * 1000
  let max = 0
  for (const key of ['x-rate-limit-account-state', 'x-rate-limit-ip-state']) {
    for (const r of parseRules(get(key))) if (r.restricted > max) max = r.restricted
  }
  return (max || 10) * 1000
}

/** 사용자에게 보여줄 남은 시간 — 초 단위 올림(0초라고 말하지 않게). */
export const waitSeconds = (ms) => Math.max(1, Math.ceil(ms / 1000))
