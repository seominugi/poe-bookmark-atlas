// src/lib/watchRefresh.js
// 찜한 매물 **일괄 확인** — 순차로 돌면서 언제 멈춰야 하는지를 정한다.
//
// ⚠ 이 기능은 한 번 뺐던 것이다(2026-08-13). 그때 버튼은 10개씩 묶어 **대기 없이** 쏘았고,
//   계정 규칙이 6요청/4초라 찜 61개를 넘으면 7번째가 429 를 맞았다. 그 정지는 **엔드포인트 단위**라
//   확장뿐 아니라 **사용자의 실제 거래소 검색까지 멈췄다.** 그래서 다시 넣을 때의 전제는 셋이다 —
//   순차 · 간격 강제 · 언제든 중단. 그 전제를 코드로 강제하는 곳이 여기다.
//
// ── 진짜 병목은 짧은 창이 아니라 긴 창이다 ──────────────────────────────
// 짧은 창(계정 6요청/4초, IP 12/4초)은 `tradeRate.MIN_GAP_MS`(700ms) 간격이 구조적으로 막는다.
// 막지 못하는 건 **IP 100요청/300초**다. 700ms 간격으로 100개를 돌면 69초가 걸리는데, 그 100요청이
// 곧 5분치 예산 **전부**다. 그리고 그 예산은 거래소 사이트 자신과 공유한다 — 다 태우면 사용자가
// 검색을 못 한다. 찜 상태를 알려주려고 거래소를 못 쓰게 만드는 건 앞뒤가 바뀐 것이다.
//
// 그래서 **응답 헤더가 알려주는 남은 예산**을 매번 읽고, 사용자 몫을 남긴 채 멈춘다.
// 헤더를 못 읽으면 추측하지 않고 보수적인 고정 상한으로 스스로를 묶는다.
import { nextDelay, retryAfterMs, parseRules } from './tradeRate.js'

/** 이보다 긴 주기의 규칙만 '긴 창'으로 본다. 짧은 창은 700ms 간격이 이미 막고 있다. */
export const LONG_WINDOW_MIN_S = 60

// ── '지금 확인할까요?' 권유 ──────────────────────────────────────────────
// 자동 주기(④-b) 대신 채택한 방식이다(사용자 결정 2026-09-05). 자동 주기의 값어치 대부분은
// **잊지 않고 갱신되는 것**인데, 그건 "지금 오래됐다"고 알려 주기만 해도 얻어진다.
// 그러면서 「기능 수용 기준」의 *백그라운드 상시 동작*에는 걸리지 않는다 — 사용자가 눌러야 돌고,
// 안 돌면 그 자리에서 보인다.

/**
 * 이보다 오래 확인 안 한 찜을 '오래됐다'고 본다.
 * ⚠ **측정값이 아니라 고른 값이다.** 매물은 분~시간 단위로 팔리므로 하루는 너무 길고, 몇 분은
 * 같은 세션 안에서 계속 뜬다. 한 시간은 "페이지를 다시 열었을 때쯤"에 해당한다.
 */
export const WATCH_STALE_MS = 60 * 60 * 1000

/**
 * ✕ 로 닫았을 때 다시 안 뜨는 기간. **영구 숨김은 두지 않는다** —
 * 한 번 잘못 누르면 기능이 영영 사라지는데, 사용자는 그걸 되돌릴 방법을 못 찾는다.
 */
export const NUDGE_SNOOZE_MS = 24 * 60 * 60 * 1000

/**
 * 권유를 띄울까.
 *
 * @param {object} o
 * @param {Array<{checkedAt?:number}>} o.items **여기서 확인할 수 있는** 찜만 넘길 것
 *   (다른 거래소 매물은 눌러도 확인되지 않으므로 권유의 근거가 될 수 없다)
 * @param {number} [o.now]
 * @param {number} [o.snoozeUntil] ✕ 로 닫은 시각 + NUDGE_SNOOZE_MS
 * @param {number} [o.staleMs]
 * @returns {{show:boolean, count:number}}
 */
export function watchNudge({ items, now = Date.now(), snoozeUntil = 0, staleMs = WATCH_STALE_MS } = {}) {
  // 확인한 적 없는 것도 '오래됐다'로 본다 — 그게 가장 모르는 상태다.
  const count = (items || []).filter((w) => !w.checkedAt || now - w.checkedAt > staleMs).length
  // 하나뿐이면 안 띄운다. 그건 행의 개별 '확인' 버튼으로 충분하고,
  // 한 건 때문에 배너를 띄우면 그 배너가 목록보다 커 보인다.
  return { show: count >= 2 && now >= (snoozeUntil || 0), count }
}

/**
 * 사용자 몫으로 남겨 둘 요청 수. 거래소 검색 한 번이 `/fetch` 를 1~3회 부르므로
 * 30이면 남은 창 동안 최소 열 번쯤은 검색할 수 있다.
 */
export const USER_RESERVE = 30

/**
 * 헤더에서 남은 예산을 못 읽을 때의 상한. **측정값이 아니라 보수적 선택이다** —
 * 문서화된 IP 한도(100/300초)의 절반 아래로 잡아, 못 읽는 상황에서도 사용자 몫이 남게 한다.
 */
export const MAX_PER_RUN_UNKNOWN = 40

/**
 * 긴 창 기준으로 **앞으로 몇 요청이 남았나**.
 *
 * 헤더는 한도(`x-rate-limit-ip`)와 현재 사용량(`x-rate-limit-ip-state`)을 같은 형식
 * (`요청수:기간:정지`)으로 준다. 같은 **기간**끼리 짝지어 빼면 그 창의 잔량이 나온다.
 * 짝을 index 가 아니라 period 로 맞추는 이유: 순서가 바뀌어도 엉뚱한 창끼리 빼지 않게.
 *
 * @returns {{known:boolean, remaining:number}} known=false 면 판단 근거가 없다는 뜻이다(추측하지 않는다).
 */
export function longWindowHeadroom(headers) {
  const get = (k) => (headers && typeof headers.get === 'function' ? headers.get(k) : headers && headers[k])
  let remaining = Infinity
  let known = false
  for (const [limitKey, stateKey] of [
    ['x-rate-limit-ip', 'x-rate-limit-ip-state'],
    ['x-rate-limit-account', 'x-rate-limit-account-state'],
  ]) {
    const limits = parseRules(get(limitKey))
    const states = parseRules(get(stateKey))
    if (!limits.length || !states.length) continue
    for (const lim of limits) {
      if (lim.period < LONG_WINDOW_MIN_S) continue // 짧은 창은 간격이 막는다
      const st = states.find((s) => s.period === lim.period)
      if (!st) continue
      known = true
      const left = lim.hits - st.hits
      if (left < remaining) remaining = left
    }
  }
  return known ? { known: true, remaining: Math.max(0, remaining) } : { known: false, remaining: Infinity }
}

/**
 * 다음 한 건을 더 보내도 되는가. 보내면 안 되는 이유를 **이름으로** 돌려준다 —
 * 화면 문구가 이유마다 달라야 하기 때문이다(멈춘 이유를 모르면 고장으로 읽힌다).
 *
 * @returns {{go:true}|{go:false, reason:'budget'|'cap'}}
 */
export function canSendMore({ sent, headroomKnown, remaining }) {
  if (headroomKnown) {
    return remaining > USER_RESERVE ? { go: true } : { go: false, reason: 'budget' }
  }
  return sent < MAX_PER_RUN_UNKNOWN ? { go: true } : { go: false, reason: 'cap' }
}

/**
 * 찜 목록을 **한 건씩** 확인한다. fetch·시계·잠자기를 전부 주입받아 테스트가 실시간을 기다리지 않게 한다.
 *
 * @param {object} o
 * @param {Array<{id:string}>} o.items 확인할 찜 (같은 거래소 것만 넘길 것 — 다른 거래소는 무조건 null 이 와서 '판매됨'으로 오판한다)
 * @param {(item)=>Promise<{ok:boolean, status:number, headers:any, alive?:boolean, price?:object}>} o.fetchOne
 * @param {{lastAt:number, blockedUntil:number}} o.gate 개별 '확인' 버튼과 **공유하는** 창구. 둘이 각자 세면 함께 한도를 넘는다
 * @param {(ms:number)=>Promise<void>} o.sleep
 * @param {()=>number} [o.now]
 * @param {(p:{done:number,total:number})=>void} [o.onProgress]
 * @param {()=>boolean} [o.cancelled]
 * @returns {Promise<{results:Array, done:number, total:number, stopped:string, blockedMs:number, remaining:number|null}>}
 *   stopped: 'done' | 'cancelled' | 'budget' | 'cap' | 'blocked' | 'error'
 */
export async function runBulkWatchCheck(o) {
  const {
    items, fetchOne, gate, sleep,
    now = () => Date.now(), onProgress = () => {}, cancelled = () => false,
  } = o
  const results = []
  let headroomKnown = false
  let remaining = Infinity
  let stopped = 'done'
  let blockedMs = 0

  for (const item of items) {
    if (cancelled()) { stopped = 'cancelled'; break }

    const budget = canSendMore({ sent: results.length, headroomKnown, remaining })
    if (!budget.go) { stopped = budget.reason; break }

    const gap = nextDelay(gate.lastAt, now(), gate.blockedUntil)
    // 이미 막혀 있으면 기다리지 않는다 — 정지 중에 보내면 정지가 더 길어진다.
    if (gap.blocked) { stopped = 'blocked'; blockedMs = gap.wait; break }
    if (gap.wait) await sleep(gap.wait)
    // 기다리는 동안 중단을 눌렀을 수 있다. 여기서 한 번 더 보지 않으면 '중단'이 한 건 늦게 듣는다.
    if (cancelled()) { stopped = 'cancelled'; break }

    gate.lastAt = now()
    let res
    try {
      res = await fetchOne(item)
    } catch (_) {
      stopped = 'error'; break
    }

    if (res && res.status === 429) {
      gate.blockedUntil = now() + retryAfterMs(res.headers)
      blockedMs = gate.blockedUntil - now()
      stopped = 'blocked'
      break
    }

    // 성공이든 실패든 헤더는 읽는다 — 남은 예산은 실패 응답에도 실려 온다.
    const hr = longWindowHeadroom(res && res.headers)
    if (hr.known) { headroomKnown = true; remaining = hr.remaining }

    if (!res || !res.ok) { stopped = 'error'; break }

    results.push({ id: item.id, alive: !!res.alive, ...(res.price ? { price: res.price } : {}) })
    onProgress({ done: results.length, total: items.length })
  }

  return {
    results,
    done: results.length,
    total: items.length,
    stopped,
    blockedMs,
    remaining: headroomKnown ? remaining : null,
  }
}
