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
// 투어를 끝까지 넘기며 제목을 모은다.
// ⚠ **개수·순서를 고정하지 않는다.** 새 기능 안내에는 다른 세션이 넣는 스텝도 섞이므로
//    (예: 티어 칩 — game:'poe2'), "N번째가 무엇인가" 로 쓰면 남의 작업에 깨진다.
//    여기서 볼 것은 하나다: **찜 스텝이 목록에 있는가 없는가.**
const tourTitles = async (max = 12) => {
  const seen = []
  for (let i = 0; i < max; i++) {
    const card = root.querySelector('.ba-tour-card')
    if (!card) break
    seen.push(card.querySelector('.ba-tour-title').textContent)
    card.querySelector('.ba-tour-next').click()
    await new Promise((r) => setTimeout(r, 40))
  }
  return seen
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

const WATCH_STEP = '찜한 매물, 한 번에 확인하기'

describe('찜을 안 쓰는 사람', () => {
  it("'전체 확인' 버튼이 없으면 그 스텝을 통째로 뺀다", async () => {
    await mount()
    expect(root.querySelector('.ba-wcheck-all'), '전제: 찜이 없으니 버튼도 없다').toBeNull()
    expect(await waitForTour(), '새 기능 안내 자체는 떠야 한다').not.toBeNull()
    const titles = await tourTitles()
    expect(titles.length, '남은 스텝이 있어야 한다').toBeGreaterThan(0)
    expect(titles, `가리킬 대상도 없는 찜 스텝이 남았다: ${titles.join(' / ')}`).not.toContain(WATCH_STEP)
  })
})

describe('찜을 쓰는 사람', () => {
  it("'전체 확인' 버튼이 있으면 그 스텝이 살아 있다", async () => {
    await seedWatches(2)
    await mount()
    expect(root.querySelector('.ba-wcheck-all'), '전제: 찜 2개면 버튼이 그려진다').not.toBeNull()
    await waitForTour()
    expect(await tourTitles()).toContain(WATCH_STEP)
  })

  it('설명이 **왜 느린가**를 말한다 — 도중에 멈추는 걸 고장으로 읽지 않게', async () => {
    await seedWatches(2)
    await mount()
    await waitForTour()
    // 찜 스텝까지 넘겨 가며 본문을 찾는다(앞에 다른 세션의 스텝이 섞일 수 있다)
    let body = null
    for (let i = 0; i < 12; i++) {
      const card = root.querySelector('.ba-tour-card')
      if (!card) break
      if (card.querySelector('.ba-tour-title').textContent === WATCH_STEP) { body = card.querySelector('p').textContent; break }
      card.querySelector('.ba-tour-next').click()
      await new Promise((r) => setTimeout(r, 40))
    }
    expect(body, '찜 스텝을 못 찾았다').not.toBeNull()
    expect(body).toContain('천천히')
    expect(body).toContain('멈추')
  })

  it('찜이 하나뿐이면 안 뜬다 — 그건 행의 개별 확인으로 충분하다', async () => {
    await seedWatches(1)
    await mount()
    expect(root.querySelector('.ba-wcheck-all')).toBeNull()
    await waitForTour()
    expect(await tourTitles()).not.toContain(WATCH_STEP)
  })
})
