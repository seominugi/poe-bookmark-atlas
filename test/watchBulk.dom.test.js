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
