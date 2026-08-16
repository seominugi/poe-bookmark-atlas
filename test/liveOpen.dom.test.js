// @vitest-environment jsdom
// '라이브로 열기' — 북마크를 새 탭에서 열고, 그 탭의 content-main 이 거래소의 네이티브
// 라이브 검색 버튼을 대신 눌러 준다. 우리는 WebSocket 을 직접 열지 않는다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { addBookmark } from '../src/store/store.js'
import { renderList, setOpenInNewTab } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

const URL_OK = 'https://poe.kakaogames.com/trade2/search/poe2/New/hash1'
const rec = (over) => ({
  game: 'poe2', title: '반지', stats: [], statGroups: [], otherFilters: [], priceFilter: null,
  url: URL_OK, league: 'New', dedupeKey: 'k1', ...over,
})

let sent
beforeEach(() => {
  globalThis.__resetChromeMock()
  document.body.innerHTML = ''
  setOpenInNewTab(false)
  sent = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({ ok: true })
})
afterEach(() => sent.mockRestore())

function makeUi() {
  const calls = { toast: [] }
  return { calls, ui: { game: 'poe2', league: 'New', getLeagueMap: () => ({ New: '현재 리그' }), toast: (m) => calls.toast.push(m) } }
}
async function render(ui) {
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe("'라이브로 열기'", () => {
  it('북마크 액션에 있고, 새 탭 요청에 #ba-live 표식을 실어 보낸다', async () => {
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    const act = list.querySelector('.ba-live')
    expect(act).not.toBeNull()
    act.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(sent).toHaveBeenCalledWith({ type: 'ba-open-tab', url: URL_OK + '#ba-live' })
  })

  // 현재 탭에서 열면 라이브가 구조적으로 하나로 묶인다(버튼은 그 페이지의 현재 검색에만 붙는다).
  // 그래서 '검색 열기' 설정이 '현재 탭'이어도 라이브는 새 탭이어야 한다.
  it("'검색 열기'가 현재 탭이어도 라이브는 새 탭으로 연다", async () => {
    setOpenInNewTab(false)
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    list.querySelector('.ba-live').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(sent).toHaveBeenCalledWith({ type: 'ba-open-tab', url: URL_OK + '#ba-live' })
  })

  it('표식을 두 번 붙이지 않는다 — 이미 해시가 있는 URL 도 한 번만', async () => {
    await addBookmark(rec({ url: URL_OK + '#something' }), '반지')
    const list = await render(makeUi().ui)
    list.querySelector('.ba-live').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(sent).toHaveBeenCalledWith({ type: 'ba-open-tab', url: URL_OK + '#ba-live' })
  })

  it('허용되지 않은 링크는 열지 않는다', async () => {
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    const act = list.querySelector('.ba-live')
    act.dataset.url = encodeURIComponent('https://evil.example.com/trade2/search/poe2/New/x')
    act.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(sent).not.toHaveBeenCalled()
  })

  it('열지 못하면 조용히 넘어가지 않고 알린다', async () => {
    sent.mockRejectedValue(new Error('Extension context invalidated'))
    await addBookmark(rec({}), '반지')
    const { ui, calls } = makeUi()
    const list = await render(ui)
    list.querySelector('.ba-live').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick(); await tick()
    expect(calls.toast.join(' ')).toContain('새 탭을 열지 못했어요')
  })

  it('이름 Shift 클릭이 같은 일을 한다 (⋯ 를 거치지 않는 지름길)', async () => {
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    list.querySelector('.ba-open').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }))
    await tick()
    expect(sent).toHaveBeenCalledWith({ type: 'ba-open-tab', url: URL_OK + '#ba-live' })
  })

  it('Shift 없이 누르면 라이브가 아니라 평소대로 연다', async () => {
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    list.querySelector('.ba-open').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(sent).not.toHaveBeenCalled() // 기본값은 현재 탭 → 새 탭 요청 자체가 없다
  })

  // 적혀 있지 않은 수식키는 없는 기능이다 — #4 가 정확히 그 제보였다.
  it('툴팁이 Shift 지름길을 알려준다', async () => {
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    const tip = list.querySelector('.ba-open').getAttribute('data-tip')
    expect(tip).toContain('Shift 클릭 → 라이브로 열기')
    expect(tip).toContain('Ctrl 클릭')
  })

  it('히스토리 카드에는 없다 — 라이브는 저장해 둔 검색을 지켜보는 기능이다', async () => {
    await addBookmark(rec({}), '반지')
    const list = await render(makeUi().ui)
    const hist = list.querySelector('.ba-row[data-kind="history"]')
    if (hist) expect(hist.querySelector('.ba-live')).toBeNull()
    expect(list.querySelectorAll('.ba-live').length).toBe(1)
  })
})
