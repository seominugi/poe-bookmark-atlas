// 찜 일괄 확인 — 언제 멈추는가.
//
// 이 기능은 한 번 뺐던 것이다(2026-08-13). 그때 실패의 값이 컸다: 429 정지가 엔드포인트 단위라
// **사용자의 실제 거래소 검색까지 멈췄다.** 그래서 이 파일이 지키는 건 "돈다" 가 아니라 "멈춘다" 다.
//   ① 간격을 지킨다 ② 예산이 마르기 전에 스스로 멈춘다 ③ 중단이 즉시 듣는다 ④ 429 면 더 안 보낸다
import { describe, it, expect } from 'vitest'
import {
  longWindowHeadroom, canSendMore, runBulkWatchCheck,
  LONG_WINDOW_MIN_S, USER_RESERVE, MAX_PER_RUN_UNKNOWN,
  watchNudge, WATCH_STALE_MS, NUDGE_SNOOZE_MS,
} from '../src/lib/watchRefresh.js'
import { MIN_GAP_MS } from '../src/lib/tradeRate.js'

// 실측된 헤더 형식(2026-08-13, tradeRate.js 주석 참조)
const H = (over = {}) => ({
  'x-rate-limit-account': '6:4:10',
  'x-rate-limit-account-state': '1:4:0',
  'x-rate-limit-ip': '12:4:60,16:12:60,100:300:300,1000:10800:1800',
  'x-rate-limit-ip-state': '1:4:0,1:12:0,10:300:0,10:10800:0',
  ...over,
})

describe('longWindowHeadroom — 남은 예산을 헤더에서 읽는다', () => {
  it('긴 창(300초/100)의 잔량을 돌려준다', () => {
    // ip 300초 창: 한도 100, 사용 10 → 90 남음. 10800초 창은 990 남아 더 크다.
    expect(longWindowHeadroom(H())).toEqual({ known: true, remaining: 90 })
  })

  it('짧은 창은 보지 않는다 — 그건 요청 간격이 이미 막고 있다', () => {
    // 4초 창은 12중 1만 남아도 무시해야 한다. 그걸 세면 첫 요청 직후 멈춘다.
    const h = H({ 'x-rate-limit-ip-state': '11:4:0,1:12:0,10:300:0,10:10800:0' })
    expect(longWindowHeadroom(h).remaining).toBe(90)
    expect(LONG_WINDOW_MIN_S).toBeGreaterThan(4)
  })

  it('여러 긴 창이 있으면 가장 빡빡한 쪽을 따른다', () => {
    const h = H({ 'x-rate-limit-ip-state': '1:4:0,1:12:0,10:300:0,995:10800:0' })
    expect(longWindowHeadroom(h).remaining).toBe(5) // 3시간 창이 5개밖에 안 남았다
  })

  it('계정 긴 창도 함께 본다', () => {
    const h = H({
      'x-rate-limit-account': '6:4:10,50:600:60',
      'x-rate-limit-account-state': '1:4:0,48:600:0',
    })
    expect(longWindowHeadroom(h).remaining).toBe(2)
  })

  it('기간이 같은 것끼리 짝짓는다 — 순서가 바뀌어도 엉뚱한 창끼리 빼지 않는다', () => {
    const h = H({ 'x-rate-limit-ip-state': '10:300:0,1:4:0,1:12:0,10:10800:0' })
    expect(longWindowHeadroom(h).remaining).toBe(90)
  })

  it('헤더가 없으면 모른다고 한다 — 추측하지 않는다', () => {
    expect(longWindowHeadroom(null)).toEqual({ known: false, remaining: Infinity })
    expect(longWindowHeadroom({})).toEqual({ known: false, remaining: Infinity })
    expect(longWindowHeadroom(H({ 'x-rate-limit-ip-state': '' })).known).toBe(false)
  })

  it('짝이 안 맞으면(한도만 있고 사용량 없음) 모른다고 한다', () => {
    const h = { 'x-rate-limit-ip': '100:300:300' }
    expect(longWindowHeadroom(h).known).toBe(false)
  })

  it('Headers 객체(get 메서드)도 그대로 읽는다', () => {
    const map = new Map(Object.entries(H()))
    expect(longWindowHeadroom({ get: (k) => map.get(k) }).remaining).toBe(90)
  })

  it('음수로 내려가지 않는다 — 이미 초과했어도 0 이다', () => {
    const h = H({ 'x-rate-limit-ip-state': '1:4:0,1:12:0,120:300:0,10:10800:0' })
    expect(longWindowHeadroom(h).remaining).toBe(0)
  })
})

describe('canSendMore — 사용자 몫을 남긴다', () => {
  it('예산을 아는 동안은 남은 양으로 판단한다', () => {
    expect(canSendMore({ sent: 0, headroomKnown: true, remaining: USER_RESERVE + 1 })).toEqual({ go: true })
    expect(canSendMore({ sent: 0, headroomKnown: true, remaining: USER_RESERVE })).toEqual({ go: false, reason: 'budget' })
  })

  it('예산을 모르면 보수적인 고정 상한으로 스스로를 묶는다', () => {
    expect(canSendMore({ sent: MAX_PER_RUN_UNKNOWN - 1, headroomKnown: false }).go).toBe(true)
    expect(canSendMore({ sent: MAX_PER_RUN_UNKNOWN, headroomKnown: false })).toEqual({ go: false, reason: 'cap' })
  })

  it('모를 때의 상한은 문서화된 IP 한도(100/300초)의 절반 아래다 — 사용자 몫이 반 이상 남는다', () => {
    expect(MAX_PER_RUN_UNKNOWN).toBeLessThan(50)
  })
})

// ── 루프 ────────────────────────────────────────────────────────────────
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: 'w' + i, listingId: 'L' + i }))

/** 실시간을 기다리지 않는다 — 가짜 시계를 sleep 이 직접 밀어 준다. */
function harness(opts = {}) {
  let t = 1_000_000
  const slept = []
  const calls = []
  const gate = { lastAt: 0, blockedUntil: 0, ...(opts.gate || {}) }
  return {
    gate, slept, calls,
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms },
    tick: (ms) => { t += ms },
    fetchOne: opts.fetchOne || (async (w) => {
      calls.push(w.id)
      t += 5 // 요청 자체에 걸리는 시간
      return { ok: true, status: 200, headers: H(), alive: true }
    }),
  }
}

describe('runBulkWatchCheck — 순차로 돌고 스스로 멈춘다', () => {
  it('요청 사이에 최소 간격을 강제한다 — 이게 없어서 429 를 맞았다', async () => {
    const h = harness()
    const r = await runBulkWatchCheck({ items: items(4), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r.stopped).toBe('done')
    expect(r.done).toBe(4)
    // 첫 요청은 기다릴 이유가 없고(마지막 요청 시각 0), 나머지 셋은 간격을 채운다
    expect(h.slept.length).toBe(3)
    for (const ms of h.slept) expect(ms).toBeGreaterThan(0)
    expect(h.slept.every((ms) => ms <= MIN_GAP_MS)).toBe(true)
  })

  it('결과는 id·생존·가격을 그대로 담는다', async () => {
    const h = harness({
      fetchOne: async (w) => ({ ok: true, status: 200, headers: H(), alive: w.id !== 'w1', price: { amount: 3, currency: 'divine' } }),
    })
    const r = await runBulkWatchCheck({ items: items(3), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r.results).toEqual([
      { id: 'w0', alive: true, price: { amount: 3, currency: 'divine' } },
      { id: 'w1', alive: false, price: { amount: 3, currency: 'divine' } },
      { id: 'w2', alive: true, price: { amount: 3, currency: 'divine' } },
    ])
  })

  it('예산이 사용자 몫까지 줄면 남겨 두고 멈춘다', async () => {
    // 300초 창을 68 쓴 상태 → 잔량 32. 한 건 더 보내면 31 → 예약분 30 을 넘어서 곧 멈춘다.
    let used = 68
    const h = harness({
      fetchOne: async () => {
        used += 1
        return { ok: true, status: 200, headers: H({ 'x-rate-limit-ip-state': `1:4:0,1:12:0,${used}:300:0,10:10800:0` }), alive: true }
      },
    })
    const r = await runBulkWatchCheck({ items: items(50), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r.stopped).toBe('budget')
    expect(r.done).toBe(2) // 69 → 잔량 31(계속), 70 → 잔량 30(멈춤)
    expect(r.remaining).toBe(USER_RESERVE)
  })

  it('헤더를 못 읽으면 고정 상한에서 멈춘다 — 모르면 적게 쓴다', async () => {
    const h = harness({ fetchOne: async () => ({ ok: true, status: 200, headers: {}, alive: true }) })
    const r = await runBulkWatchCheck({ items: items(80), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r.stopped).toBe('cap')
    expect(r.done).toBe(MAX_PER_RUN_UNKNOWN)
    expect(r.remaining).toBeNull() // 모른다는 걸 숨기지 않는다
  })

  it('429 를 맞으면 그 자리에서 멈추고 정지 시간을 창구에 남긴다', async () => {
    let n = 0
    const h = harness({
      fetchOne: async () => {
        n += 1
        if (n === 3) return { ok: false, status: 429, headers: { 'retry-after': '12' } }
        return { ok: true, status: 200, headers: H(), alive: true }
      },
    })
    const r = await runBulkWatchCheck({ items: items(10), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r.stopped).toBe('blocked')
    expect(r.done).toBe(2)          // 429 를 맞은 건은 결과에 넣지 않는다
    expect(n).toBe(3)               // 맞은 뒤로는 한 건도 더 안 보낸다
    expect(r.blockedMs).toBe(12000)
    expect(h.gate.blockedUntil).toBe(h.now() + 12000)
  })

  it('이미 막혀 있으면 한 건도 안 보낸다 — 정지 중에 보내면 더 길어진다', async () => {
    const h = harness()
    h.gate.blockedUntil = h.now() + 8000
    const r = await runBulkWatchCheck({ items: items(5), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r.stopped).toBe('blocked')
    expect(h.calls).toHaveLength(0)
    expect(r.blockedMs).toBe(8000)
  })

  it('중단은 다음 요청 전에 듣는다', async () => {
    const h = harness()
    let stop = false
    const r = await runBulkWatchCheck({
      items: items(10), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now,
      cancelled: () => stop,
      onProgress: ({ done }) => { if (done === 3) stop = true },
    })
    expect(r.stopped).toBe('cancelled')
    expect(r.done).toBe(3)
    expect(h.calls).toHaveLength(3)
  })

  it('간격을 기다리는 동안 눌러도 그 건은 안 나간다 — 안 그러면 중단이 한 건 늦다', async () => {
    let stop = false
    const h = harness()
    const sleep = async (ms) => { h.slept.push(ms); stop = true; await h.sleep(0) }
    const r = await runBulkWatchCheck({
      items: items(5), fetchOne: h.fetchOne, gate: h.gate, sleep, now: h.now, cancelled: () => stop,
    })
    expect(r.stopped).toBe('cancelled')
    expect(h.calls).toHaveLength(1) // 첫 건만 나가고, 두 번째는 대기 중에 취소됐다
  })

  it('응답이 실패하면 거기까지만 남기고 멈춘다', async () => {
    let n = 0
    const h = harness({
      fetchOne: async () => {
        n += 1
        return n === 2 ? { ok: false, status: 503, headers: H() } : { ok: true, status: 200, headers: H(), alive: true }
      },
    })
    const r = await runBulkWatchCheck({ items: items(6), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r.stopped).toBe('error')
    expect(r.done).toBe(1)
  })

  it('fetch 가 던져도 삼키지 않고 멈춘다', async () => {
    const h = harness({ fetchOne: async () => { throw new Error('offline') } })
    const r = await runBulkWatchCheck({ items: items(3), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r.stopped).toBe('error')
    expect(r.done).toBe(0)
  })

  it('창구는 개별 확인과 공유된다 — 끝난 뒤 마지막 요청 시각이 남는다', async () => {
    const h = harness()
    await runBulkWatchCheck({ items: items(2), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(h.gate.lastAt).toBeGreaterThan(0)
    expect(h.gate.lastAt).toBeLessThanOrEqual(h.now())
  })

  it('빈 목록이면 아무것도 안 한다', async () => {
    const h = harness()
    const r = await runBulkWatchCheck({ items: [], fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now })
    expect(r).toMatchObject({ stopped: 'done', done: 0, total: 0 })
    expect(h.calls).toHaveLength(0)
  })

  it('진행 상황을 건마다 알린다 — 30초 넘게 도는데 표시가 없으면 멈춘 걸로 읽힌다', async () => {
    const h = harness()
    const seen = []
    await runBulkWatchCheck({
      items: items(3), fetchOne: h.fetchOne, gate: h.gate, sleep: h.sleep, now: h.now,
      onProgress: (p) => seen.push(p),
    })
    expect(seen).toEqual([{ done: 1, total: 3 }, { done: 2, total: 3 }, { done: 3, total: 3 }])
  })
})

// ── '지금 확인할까요?' 권유 ──────────────────────────────────────────────
// 자동 주기(④-b) 대신 채택한 방식이다(사용자 결정 2026-09-05).
// 여기가 지키는 건 **안 뜰 때 안 뜨는 것**이다 — 배너가 늘 떠 있으면 그건 잔소리이고,
// 사용자는 배너를 넘어 기능째로 안 보게 된다.
describe('watchNudge — 오래된 것이 쌓였을 때만 말을 건다', () => {
  const T = 10_000_000_000
  const HOUR = 60 * 60 * 1000
  const w = (agoMs) => (agoMs === null ? {} : { checkedAt: T - agoMs })

  it('둘 이상이 오래됐으면 뜬다', () => {
    expect(watchNudge({ items: [w(2 * HOUR), w(3 * HOUR)], now: T })).toEqual({ show: true, count: 2 })
  })

  it('하나뿐이면 안 뜬다 — 그건 행의 개별 확인으로 충분하다', () => {
    expect(watchNudge({ items: [w(2 * HOUR), w(1000)], now: T })).toEqual({ show: false, count: 1 })
  })

  it('전부 방금 확인했으면 안 뜬다', () => {
    expect(watchNudge({ items: [w(1000), w(2000), w(3000)], now: T }).show).toBe(false)
  })

  it('확인한 적 없는 것은 오래된 것으로 센다 — 그게 가장 모르는 상태다', () => {
    expect(watchNudge({ items: [w(null), w(null)], now: T })).toEqual({ show: true, count: 2 })
  })

  it('경계 — 딱 한 시간이면 아직 아니고, 넘으면 오래된 것이다', () => {
    expect(watchNudge({ items: [w(WATCH_STALE_MS), w(WATCH_STALE_MS)], now: T }).count).toBe(0)
    expect(watchNudge({ items: [w(WATCH_STALE_MS + 1), w(WATCH_STALE_MS + 1)], now: T }).count).toBe(2)
  })

  it('✕ 로 닫아 둔 동안은 개수를 세도 안 뜬다', () => {
    // 개수는 그대로 돌려준다 — 숨기는 것이지 없어진 게 아니다
    expect(watchNudge({ items: [w(null), w(null)], now: T, snoozeUntil: T + 1000 })).toEqual({ show: false, count: 2 })
  })

  it('스누즈가 지나면 다시 뜬다 — 영구 숨김은 두지 않는다', () => {
    expect(watchNudge({ items: [w(null), w(null)], now: T, snoozeUntil: T }).show).toBe(true)
    expect(Number.isFinite(NUDGE_SNOOZE_MS)).toBe(true)
    expect(NUDGE_SNOOZE_MS).toBeGreaterThan(0)
  })

  it('빈 목록·인자 없음에도 터지지 않는다', () => {
    expect(watchNudge({ items: [] })).toEqual({ show: false, count: 0 })
    expect(watchNudge()).toEqual({ show: false, count: 0 })
  })
})
