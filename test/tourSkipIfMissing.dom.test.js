// @vitest-environment jsdom
// 투어의 `skipIfMissing` — 대상이 없는 스텝을 아예 빼는 장치.
//
// 왜 필요한가: `place()` 는 대상을 못 찾으면 **스포트라이트만 숨기고 카드는 그대로 띄운다.**
// 에러도 안 난다. 그래서 "찜을 한 번도 안 한 사람에게 찜 설명이 뜨는데 아무 데도 안 가리키는"
// 상태가 조용히 생긴다 — 이 저장소가 여러 번 겪은 '조용히 죽는 실패' 와 같은 모양이다.
//
// 다른 스텝들은 데모 데이터(seedDemoData·seedDemoSets)가 대상을 만들어 준다. 찜은 그렇게 하지
// 않는다 — **안 쓰는 사람에게는 설명 자체가 무의미**하기 때문이다. 그래서 심는 대신 뺀다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mountPanel } from '../src/content/panel/panel.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

let root
const mount = async () => {
  mountPanel({
    game: 'poe2', league: 'New',
    getLeagueMap: () => ({ New: '현재 리그' }),
    getCurrentSearch: () => null,
    migrateSearch: async () => null,
    applyConditionSet: async () => ({ ok: true }),
    getStatMap: () => ({}),
    tourDemo: { show() {}, hide() {} },
  })
  root = document.getElementById('ba-panel-host').shadowRoot
  await new Promise((r) => setTimeout(r, 30))
  return root
}
// 새 기능 안내는 1.2초 뒤에 뜬다
const waitForTour = async (ms = 2500) => {
  for (let t = 0; t < ms; t += 20) {
    if (root.querySelector('.ba-tour-card')) return root.querySelector('.ba-tour-card')
    await new Promise((r) => setTimeout(r, 20))
  }
  return null
}
const seedWatches = async (n) => {
  const list = Array.from({ length: n }, (_, i) => ({
    id: 'w' + i, listingId: 'L' + i, origin: location.host, game: 'poe2', league: 'New',
    name: '고상한 오만', baseType: '무궁한 주얼', savedAt: Date.now(), status: 'alive',
    sourceUrl: 'https://poe.kakaogames.com/trade2/search/poe2/New/abc',
  }))
  await chrome.storage.local.set({ watchlist: list })
}

beforeEach(async () => {
  globalThis.__resetChromeMock()
  localStorage.clear()
  document.body.innerHTML = ''
  // 이미 투어를 본 기존 사용자 = 새 기능 안내만 뜨는 상태
  await chrome.storage.local.set({ tourDone: true, whatsNewSeen: '0.9.0', settingsTourSeen: true })
})
afterEach(() => { document.body.innerHTML = '' })

describe('찜을 안 쓰는 사람', () => {
  it("'전체 확인' 버튼이 없으면 그 스텝을 통째로 뺀다", async () => {
    await mount()
    expect(root.querySelector('.ba-wcheck-all'), '전제: 찜이 없으니 버튼도 없다').toBeNull()
    const card = await waitForTour()
    expect(card, '새 기능 안내 자체는 떠야 한다').not.toBeNull()
    // 찜 스텝이 빠져 남은 둘(섹션 → 설정)만 돈다
    expect(card.querySelector('.ba-tour-step').textContent).toContain('1 / 2')
    expect(card.querySelector('.ba-tour-title').textContent).toContain('섹션')
  })

  it('빠진 스텝의 설명이 화면 어디에도 안 남는다 — 카드만 뜨는 상태를 막는 게 목적이다', async () => {
    await mount()
    const card = await waitForTour()
    card.querySelector('.ba-tour-next').click()
    await new Promise((r) => setTimeout(r, 40))
    const all = root.querySelector('.ba-tour-card').textContent
    expect(all).not.toContain('한 번에 확인하기')
  })
})

describe('찜을 쓰는 사람', () => {
  it("'전체 확인' 버튼이 있으면 그 스텝이 살아 있고 맨 앞에 온다", async () => {
    await seedWatches(2)
    await mount()
    expect(root.querySelector('.ba-wcheck-all'), '전제: 찜 2개면 버튼이 그려진다').not.toBeNull()
    const card = await waitForTour()
    expect(card.querySelector('.ba-tour-step').textContent).toContain('1 / 3')
    expect(card.querySelector('.ba-tour-title').textContent).toContain('찜한 매물')
  })

  it('설명이 **왜 느린가**를 말한다 — 도중에 멈추는 걸 고장으로 읽지 않게', async () => {
    await seedWatches(2)
    await mount()
    const body = (await waitForTour()).querySelector('p').textContent
    expect(body).toContain('천천히')
    expect(body).toContain('멈추')
  })

  it('찜이 하나뿐이면 안 뜬다 — 그건 행의 개별 확인으로 충분하다', async () => {
    await seedWatches(1)
    await mount()
    expect(root.querySelector('.ba-wcheck-all')).toBeNull()
    const card = await waitForTour()
    expect(card.querySelector('.ba-tour-step').textContent).toContain('1 / 2')
  })
})
