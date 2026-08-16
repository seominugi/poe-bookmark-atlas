// @vitest-environment jsdom
// '검색 열기' 설정 — 저장된 검색을 현재 탭에서 열지 새 탭에서 열지. Ctrl/⌘ 는 그 설정을 뒤집는다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { addBookmark, addHistory } from '../src/store/store.js'
import { renderList, setOpenInNewTab, getOpenInNewTab } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

const URL_OLD = 'https://poe.kakaogames.com/trade2/search/poe2/Old/hash1'
const URL_NEW = 'https://poe.kakaogames.com/trade2/search/poe2/New/newhash'
const LIVE = { New: '현재 리그' }
const rec = (over) => ({
  game: 'poe2', title: '반지', stats: [], statGroups: [], otherFilters: [], priceFilter: null,
  url: URL_OLD, league: 'New', dedupeKey: 'k1', ...over,
})

let sent
beforeEach(() => {
  globalThis.__resetChromeMock()
  document.body.innerHTML = ''
  setOpenInNewTab(false)
  sent = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({ ok: true })
})
afterEach(() => sent.mockRestore())

function makeUi(over = {}) {
  const calls = { toast: [] }
  return {
    calls,
    ui: { game: 'poe2', league: 'New', getLeagueMap: () => LIVE, toast: (m) => calls.toast.push(m), ...over },
  }
}
async function render(ui) {
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}
const tick = () => new Promise((r) => setTimeout(r, 0))
const click = (el, ctrl = false) => el.dispatchEvent(new MouseEvent('click', { ctrlKey: ctrl, bubbles: true }))

describe("'검색 열기' 설정", () => {
  it("기본은 현재 탭 — 새 탭 요청이 나가지 않는다", async () => {
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    click(list.querySelector('.ba-open'))
    await tick()
    expect(sent).not.toHaveBeenCalled()
  })

  it("'새 탭'을 켜면 그냥 클릭해도 새 탭으로 연다", async () => {
    setOpenInNewTab(true)
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    click(list.querySelector('.ba-open'))
    await tick()
    expect(sent).toHaveBeenCalledWith({ type: 'ba-open-tab', url: URL_OLD })
  })

  it("'새 탭'일 때 Ctrl 클릭은 반대로 — 현재 탭에서 연다 (수식키가 죽지 않는다)", async () => {
    setOpenInNewTab(true)
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    click(list.querySelector('.ba-open'), true)
    await tick()
    expect(sent).not.toHaveBeenCalled()
  })

  it('설정은 저장되고 다시 읽힌다', async () => {
    setOpenInNewTab(true)
    expect(getOpenInNewTab()).toBe(true)
    expect((await chrome.storage.local.get(['uiOpenInNewTab'])).uiOpenInNewTab).toBe(true)
  })

  it('카드 툴팁이 지금 설정을 그대로 알려준다 — 기능이 있는지 모르는 게 원인이었다', async () => {
    await addBookmark(rec({}), '반지')
    let tip = (await render(makeUi().ui)).querySelector('.ba-open').getAttribute('data-tip')
    expect(tip).toContain('현재 탭에서 다시 검색')
    expect(tip).toContain('Ctrl 클릭 → 새 탭')

    setOpenInNewTab(true)
    document.body.innerHTML = ''
    tip = (await render(makeUi().ui)).querySelector('.ba-open').getAttribute('data-tip')
    expect(tip).toContain('새 탭에서 다시 검색')
    expect(tip).toContain('Ctrl 클릭 → 현재 탭')
  })

  it('허용되지 않은 링크는 새 탭 요청조차 나가지 않는다', async () => {
    setOpenInNewTab(true)
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    const row = list.querySelector('.ba-row[data-kind="bookmark"]')
    row.dataset.url = encodeURIComponent('https://evil.example.com/trade2/search/poe2/New/x')
    click(list.querySelector('.ba-open'))
    await tick()
    expect(sent).not.toHaveBeenCalled()
  })

  // 이 경로가 이번 작업의 진짜 위험이었다: 대화상자를 기다린 뒤 window.open 을 부르면
  // 사용자 제스처 창을 벗어나 팝업 차단에 걸린다. 서비스 워커 경유라 제스처와 무관해야 한다.
  it('지난 리그 팝오버에서 "그대로 열기"를 골라도 새 탭이 열린다 (팝업 차단 회피)', async () => {
    setOpenInNewTab(true)
    await addBookmark(rec({ league: 'Old' }), '반지')
    const { ui } = makeUi({ showConflict: async () => { await tick(); return 'open' } })
    const list = await render(ui)
    click(list.querySelector('.ba-open'))
    await tick(); await tick(); await tick()
    expect(sent).toHaveBeenCalledWith({ type: 'ba-open-tab', url: URL_OLD })
  })

  it('새 탭을 못 열면 조용히 실패하지 않고 알린 뒤 현재 탭에서 연다', async () => {
    setOpenInNewTab(true)
    sent.mockRejectedValue(new Error('Extension context invalidated'))
    await addBookmark(rec({}), '반지')
    const { ui, calls } = makeUi()
    const list = await render(ui)
    click(list.querySelector('.ba-open'))
    await tick(); await tick()
    expect(calls.toast.join(' ')).toContain('새 탭을 열지 못해')
  })

  it('히스토리 행도 같은 설정을 따른다 — 북마크만 바뀌면 일관성이 깨진다', async () => {
    setOpenInNewTab(true)
    await addHistory(rec({ url: URL_NEW, dedupeKey: 'h1' }))
    const list = await render(makeUi().ui)
    click(list.querySelector('.ba-row[data-kind="history"]'))
    await tick()
    expect(sent).toHaveBeenCalledWith({ type: 'ba-open-tab', url: URL_NEW })
  })
})
