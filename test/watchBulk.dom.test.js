// @vitest-environment jsdom
// 찜 일괄 확인 — 패널 쪽 배선.
//
// 규칙(간격·예산·중단)은 test/watchRefresh.test.js 가 지킨다. 여기서 보는 건 화면 쪽 계약이다:
//   ① 눌러도 아무 일 없는 버튼을 그리지 않는가 ② 도는 동안 진행이 보이는가
//   ③ 다시 누르면 멈추는가 ④ 도는 중에 개별 '확인' 이 끼어들지 않는가
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { addWatch, listWatched } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

const HERE = () => location.host
const OK_HEADERS = {
  'x-rate-limit-ip': '12:4:60,16:12:60,100:300:300,1000:10800:1800',
  'x-rate-limit-ip-state': '1:4:0,1:12:0,5:300:0,5:10800:0',
}
const headers = (o) => ({ get: (k) => o[k] })

const toasts = []
const ui = { game: 'poe2', league: 'Standard', getLeagueMap: () => ({ Standard: '스탠다드' }), toast: (m) => toasts.push(m) }

const watch = ({ listingId, ...over } = {}) => ({
  listingId: 'L' + (listingId || Math.random().toString(36).slice(2, 7)),
  origin: HERE(), game: 'poe2', league: 'Standard',
  name: '고상한 오만', baseType: '무궁한 주얼',
  sourceUrl: 'https://poe.kakaogames.com/trade2/search/poe2/Standard/abc',
  ...over,
})

async function render() {
  document.body.innerHTML = ''
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}
const bulkBtn = (list) => list.querySelector('.ba-wcheck-all')
// 끝을 **토스트로** 판정한다 — 모든 종료 경로가 정확히 하나를 남긴다.
// 버튼 라벨로 판정했더니 진행 표시가 그려지기 전(<20ms)에 '끝났다'로 새어 나갔다.
const waitToast = async (n = 1, ms = 5000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms && toasts.length < n) await new Promise((r) => setTimeout(r, 20))
  expect(toasts.length, `토스트 ${n}개를 기다렸는데 ${toasts.length}개: ${toasts.join(' | ')}`).toBeGreaterThanOrEqual(n)
}

let fetchCalls
beforeEach(() => {
  globalThis.__resetChromeMock()
  document.body.innerHTML = ''
  toasts.length = 0
  fetchCalls = []
  globalThis.fetch = vi.fn(async (url) => {
    fetchCalls.push(String(url))
    return { ok: true, status: 200, headers: headers(OK_HEADERS), json: async () => ({ result: [{ listing: { price: { amount: 7, currency: 'divine' } } }] }) }
  })
})
afterEach(() => { document.body.innerHTML = '' })

describe('전체 확인 버튼이 뜨는 조건', () => {
  it('여기서 확인할 수 있는 찜이 2개 이상이면 뜬다', async () => {
    await addWatch(watch({ listingId: '1' }))
    await addWatch(watch({ listingId: '2' }))
    expect(bulkBtn(await render())).toBeTruthy()
  })

  it('1개뿐이면 안 뜬다 — 행의 개별 확인으로 충분하다', async () => {
    await addWatch(watch({ listingId: '1' }))
    expect(bulkBtn(await render())).toBeNull()
  })

  it('다른 거래소 매물뿐이면 안 뜬다 — 눌러도 아무 일 없는 버튼은 고장으로 읽힌다', async () => {
    await addWatch(watch({ listingId: '1', origin: 'www.pathofexile.com' }))
    await addWatch(watch({ listingId: '2', origin: 'www.pathofexile.com' }))
    const list = await render()
    expect(list.querySelector('.ba-wrow')).toBeTruthy() // 찜 자체는 보인다
    expect(bulkBtn(list)).toBeNull()
  })

  it('다른 거래소 것이 섞여 있으면 여기 것만 센다', async () => {
    await addWatch(watch({ listingId: '1' }))
    await addWatch(watch({ listingId: '2', origin: 'www.pathofexile.com' }))
    expect(bulkBtn(await render())).toBeNull() // 여기 것은 1개뿐
  })
})

// ── '지금 확인할까요?' 권유 ──────────────────────────────────────────────
// 자동 주기(④-b) 대신 채택한 방식(사용자 결정 2026-09-05). 판정 규칙은 watchRefresh.test.js 가 지킨다.
// 여기서 보는 건 배선이다: 눌렀을 때 정말 도는가 / ✕ 가 정말 닫는가 / 닫힌 게 남는가.
describe('지금 확인할까요? 배너', () => {
  const OLD = Date.now() - 3 * 60 * 60 * 1000 // 3시간 전 확인 = 오래됨
  const seedStale = async (n) => {
    for (let i = 0; i < n; i++) await addWatch(watch({ listingId: 'S' + i }))
    // addWatch 는 checkedAt 을 일부러 비운다('확인한 적 없음'). 여기선 '오래됨' 을 만들려고 직접 심는다.
    const all = (await chrome.storage.local.get('watchlist')).watchlist
    await chrome.storage.local.set({ watchlist: all.map((w) => ({ ...w, checkedAt: OLD })) })
  }
  const nudge = (list) => list.querySelector('.ba-wnudge')

  it('오래된 찜이 둘 이상이면 뜬다 — 개수를 그대로 말한다', async () => {
    await seedStale(3)
    const list = await render()
    expect(nudge(list)).toBeTruthy()
    expect(nudge(list).textContent).toContain('3개')
  })

  it('방금 확인했으면 안 뜬다', async () => {
    for (const id of ['A', 'B', 'C']) await addWatch(watch({ listingId: id }))
    const all = (await chrome.storage.local.get('watchlist')).watchlist
    await chrome.storage.local.set({ watchlist: all.map((w) => ({ ...w, checkedAt: Date.now() })) })
    expect(nudge(await render())).toBeNull()
  })

  it("'지금 확인' 을 누르면 배너가 사라지고 순회가 돈다", async () => {
    await seedStale(2)
    const list = await render()
    nudge(list).querySelector('.ba-wnudge-go').click()
    expect(nudge(list), '배너가 남아 있으면 다시 눌러 중단이 돼 버린다').toBeNull()
    await waitToast()
    expect(fetchCalls).toHaveLength(2)
    expect(toasts.some((t) => t.includes('확인했어요'))).toBe(true)
  })

  it('확인이 끝나면 더는 안 뜬다 — 방금 봤으니까', async () => {
    await seedStale(2)
    const list = await render()
    nudge(list).querySelector('.ba-wnudge-go').click()
    await waitToast()
    expect(nudge(await render())).toBeNull()
  })

  // ⚠ **스누즈 검증은 한 테스트로 묶는다.** 스누즈는 모듈 레벨이라 한 번 켜지면 이 파일의
  //    뒤 테스트에서도 배너가 안 뜬다 — 나눠 쓰면 두 번째가 "배너 없음" 으로 터진다(실제로 겪었다).
  it('✕ 는 요청 없이 배너만 닫고, 그 상태가 저장돼 다시 그려도 안 뜬다', async () => {
    await seedStale(2)
    const list = await render()
    nudge(list).querySelector('.ba-wnudge-x').click()
    expect(nudge(list)).toBeNull()
    expect(fetchCalls, '✕ 가 조회를 시작하면 안 된다').toHaveLength(0)
    const until = (await chrome.storage.local.get('uiWatchNudgeSnooze')).uiWatchNudgeSnooze
    expect(until, '스누즈가 저장되지 않았다').toBeGreaterThan(Date.now())
    expect(nudge(await render()), '닫았는데 다시 그리니 또 떴다').toBeNull()
  })

  // ⚠ 여기서 켜진 스누즈가 아래 '돌리기' 까지 이어진다. 그래서 아래 테스트는 배너를 쓰지 않고
  //    섹션 머리의 '전체 확인' 버튼만 누른다.
})

describe('돌리기', () => {
  it('여기 것만 조회하고 결과를 저장한다', async () => {
    await addWatch(watch({ listingId: 'A' }))
    await addWatch(watch({ listingId: 'B' }))
    await addWatch(watch({ listingId: 'C', origin: 'www.pathofexile.com' }))
    const list = await render()
    bulkBtn(list).click()
    await waitToast()

    expect(fetchCalls).toHaveLength(2)
    expect(fetchCalls.join(' ')).toContain('LA')
    expect(fetchCalls.join(' ')).toContain('LB')
    expect(fetchCalls.join(' ')).not.toContain('LC') // 다른 거래소는 조회하면 무조건 null 이 온다

    const saved = await listWatched('poe2')
    const checked = saved.filter((w) => w.checkedAt)
    expect(checked).toHaveLength(2)
    expect(checked.every((w) => w.status === 'alive')).toBe(true)
    expect(checked[0].lastPrice).toEqual({ amount: 7, currency: 'divine' })
    expect(toasts.some((t) => t.includes('전부 아직 있어요'))).toBe(true)
  })

  it('팔린 것이 있으면 몇 개인지 말한다', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      fetchCalls.push(String(url))
      const sold = String(url).includes('LB')
      return { ok: true, status: 200, headers: headers(OK_HEADERS), json: async () => ({ result: sold ? [null] : [{ listing: { price: { amount: 7, currency: 'divine' } } }] }) }
    })
    await addWatch(watch({ listingId: 'A' }))
    await addWatch(watch({ listingId: 'B' }))
    const list = await render()
    bulkBtn(list).click()
    await waitToast()
    expect(toasts.some((t) => t.includes('1개가 판매된 것 같아요'))).toBe(true)
    const saved = await listWatched('poe2')
    expect(saved.find((w) => w.listingId === 'LB').status).toBe('sold')
  })

  it('도는 동안 진행 수가 버튼에 보인다', async () => {
    await addWatch(watch({ listingId: 'A' }))
    await addWatch(watch({ listingId: 'B' }))
    const list = await render()
    const btn = bulkBtn(list)
    btn.click()
    // 첫 건이 끝나고 두 번째를 기다리는 700ms 사이를 잡는다
    await new Promise((r) => setTimeout(r, 120))
    expect(btn.textContent).toMatch(/중단 \(\d\/2\)/)
    await waitToast()
    expect(btn.textContent).toContain('전체 확인') // 끝나면 원래 라벨로
  })

  it('다시 누르면 멈춘다', async () => {
    for (const id of ['A', 'B', 'C', 'D']) await addWatch(watch({ listingId: id }))
    const list = await render()
    const btn = bulkBtn(list)
    btn.click()
    await new Promise((r) => setTimeout(r, 120))
    btn.click() // 중단
    await waitToast()
    expect(fetchCalls.length).toBeLessThan(4)
    expect(toasts.some((t) => t.includes('까지 확인하고 멈췄어요'))).toBe(true)
  })

  it('도는 중에는 개별 확인이 끼어들지 않는다 — 두 경로가 같은 창구를 쓴다', async () => {
    await addWatch(watch({ listingId: 'A' }))
    await addWatch(watch({ listingId: 'B' }))
    const list = await render()
    bulkBtn(list).click()
    await new Promise((r) => setTimeout(r, 120))
    const before = fetchCalls.length
    list.querySelector('.ba-wcheck').click()
    await new Promise((r) => setTimeout(r, 60))
    expect(fetchCalls.length).toBe(before) // 개별 요청이 나가지 않았다
    expect(toasts.some((t) => t.includes('전체 확인이 도는 중'))).toBe(true)
    await waitToast(2)
  })

  it('거래소가 응답하지 않으면 거기까지만 저장하고 멈춘다', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      fetchCalls.push(String(url))
      if (fetchCalls.length === 2) throw new Error('offline')
      return { ok: true, status: 200, headers: headers(OK_HEADERS), json: async () => ({ result: [{ listing: {} }] }) }
    })
    for (const id of ['A', 'B', 'C']) await addWatch(watch({ listingId: id }))
    const list = await render()
    bulkBtn(list).click()
    await waitToast()
    expect(toasts.some((t) => t.includes('거래소가 응답하지 않아'))).toBe(true)
    const saved = await listWatched('poe2')
    expect(saved.filter((w) => w.checkedAt)).toHaveLength(1)
  })

  // ⚠ **이 테스트는 맨 마지막이어야 한다.** 429 를 맞으면 창구(watchGate)에 9초 정지가 남는데,
  //    그 창구는 모듈 레벨이라 다음 테스트까지 이어진다 — 그게 실제 동작이다(정지 중엔 아무 경로도
  //    요청을 안 보낸다). 순서를 바꾸면 뒤 테스트가 "시작하자마자 막힘"으로 끝난다(실제로 겪었다).
  it('429 면 남은 것을 보내지 않고 몇 초 뒤인지 알린다', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      fetchCalls.push(String(url))
      if (fetchCalls.length === 2) return { ok: false, status: 429, headers: headers({ 'retry-after': '9' }) }
      return { ok: true, status: 200, headers: headers(OK_HEADERS), json: async () => ({ result: [{ listing: {} }] }) }
    })
    for (const id of ['A', 'B', 'C', 'D']) await addWatch(watch({ listingId: id }))
    const list = await render()
    bulkBtn(list).click()
    await waitToast()
    expect(fetchCalls).toHaveLength(2) // 맞은 뒤로는 한 건도 더 안 보낸다
    expect(toasts.some((t) => /9초 뒤에 이어서/.test(t))).toBe(true)
  })

})
