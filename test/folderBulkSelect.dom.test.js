// @vitest-environment jsdom
// 폴더 선택 모드 — 골라서 옮기거나 지우기 · 폴더 「전부 이동」 (사용자 요청 2026-09-15: 미분류 일괄 삭제·이동).
//
// 파괴적 UI라 확인·되돌리기가 실제로 붙어 있는지까지 본다(bulkDelete.dom.test.js 와 같은 기준).
// 선택 상태는 renderList 모듈에 남으므로, 테스트마다 「완료」·삭제·이동 중 하나로 끝내 다음 테스트를 오염시키지 않는다.
import { describe, it, expect, beforeEach } from 'vitest'
import { addBookmark, addFolder, listByKind, removeBookmarks, restoreRecords } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

const LIVE = { Standard: '스탠다드' }
const rec = (over) => ({
  game: 'poe2', title: '반지', itemType: '반지', stats: [], statGroups: [], otherFilters: [], priceFilter: null,
  url: 'https://poe.kakaogames.com/trade2/search/poe2/hash1', league: 'Standard', dedupeKey: 'k1', ...over,
})
const tick = () => new Promise((r) => setTimeout(r, 0))
const names = (l) => l.map((b) => b.name).sort()

let list, ui, toasts, moveCalls
async function mount(over = {}) {
  toasts = []
  moveCalls = []
  ui = {
    game: 'poe2', league: 'Standard', getLeagueMap: () => LIVE,
    toast: (m, a) => toasts.push({ m, a }),
    bulkMove: async (ids) => { moveCalls.push(ids); return over.moveResult ?? 0 },
    ...over,
  }
  list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.innerHTML = ''
  document.body.appendChild(root)
  await renderList(list, root, ui)
  // 패널처럼 records-changed 에 다시 그린다
  document.removeEventListener('ba:records-changed', rerender)
  document.addEventListener('ba:records-changed', rerender)
  return list
}
async function rerender() { await renderList(list, list.parentElement, ui) }
const settle = async () => { await tick(); await tick(); await tick() }
const folder = (fid = '') => list.querySelector(`.ba-folder[data-folder="${fid}"]`)
const rowsIn = (fid = '') => [...folder(fid).querySelectorAll('.ba-row')]
const rowByName = (name, fid = '') => rowsIn(fid).find((r) => r.textContent.includes(name))

beforeEach(() => { globalThis.__resetChromeMock() })

describe('removeBookmarks (store)', () => {
  it('고른 북마크만 지우고, 지운 것은 restoreRecords 로 그대로 되살아난다', async () => {
    const a = await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    await addBookmark(rec({ dedupeKey: 'b' }), 'B')
    const c = await addBookmark(rec({ dedupeKey: 'c' }), 'C')
    const removed = await removeBookmarks([a.id, c.id, 'nope'])
    expect(names(removed)).toEqual(['A', 'C'])
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['B'])
    await restoreRecords(removed)
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['A', 'B', 'C'])
  })
  it('빈 목록이면 아무것도 안 한다', async () => {
    await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    expect(await removeBookmarks([])).toEqual([])
    expect(await listByKind('bookmark', 'poe2')).toHaveLength(1)
  })
})

describe('폴더 헤더 — 선택 · 전부 이동', () => {
  it('담긴 게 있는 폴더(미분류 포함)에만 두 버튼이 뜬다', async () => {
    const empty = await addFolder('빈폴더', 'poe2')
    await addBookmark(rec({ dedupeKey: 'a' }), '미분류것')
    await mount()
    expect(folder('').querySelector('.ba-folder-select')).toBeTruthy()
    expect(folder('').querySelector('.ba-folder-moveall')).toBeTruthy()
    expect(folder(empty.id).querySelector('.ba-folder-select')).toBeNull()
    expect(folder(empty.id).querySelector('.ba-folder-moveall')).toBeNull()
  })

  it('전부 이동은 그 폴더 북마크 id 를 모두 넘긴다 — 다른 폴더 것은 넘기지 않는다', async () => {
    const f = await addFolder('세팅', 'poe2')
    const a = await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    const b = await addBookmark(rec({ dedupeKey: 'b' }), 'B')
    await addBookmark(rec({ dedupeKey: 'c', folderId: f.id }), 'C')
    await mount()
    folder('').querySelector('.ba-folder-moveall').click()
    await settle()
    expect(moveCalls).toHaveLength(1)
    expect([...moveCalls[0]].sort()).toEqual([a.id, b.id].sort())
  })
})

describe('선택 모드', () => {
  it('선택을 켜면 카드에 체크칸과 선택 바가 뜨고, 카드를 눌러도 열리지 않고 골라진다', async () => {
    await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    await addBookmark(rec({ dedupeKey: 'b' }), 'B')
    await mount()
    folder('').querySelector('.ba-folder-select').click()
    await settle()
    expect(folder('').classList.contains('ba-folder--selecting')).toBe(true)
    expect(folder('').querySelector('.ba-folder-savechip')).toBeNull() // 저장 칩 자리를 선택 바가 쓴다
    const bar = folder('').querySelector('.ba-bulkbar')
    expect(bar.querySelector('.ba-bulk-move').disabled).toBe(true)
    expect(rowsIn('').every((r) => r.querySelector('.ba-bsel'))).toBe(true)

    // 이름 칩(평소엔 거래소를 여는 곳)을 눌러도 선택만 된다
    const openSpy = []
    const origOpen = window.open; window.open = (...a) => { openSpy.push(a) }
    rowByName('A').querySelector('.ba-open').click()
    window.open = origOpen
    expect(openSpy).toHaveLength(0)
    expect(rowByName('A').classList.contains('is-selected')).toBe(true)
    expect(bar.querySelector('.ba-bulkcount b').textContent).toBe('1')
    expect(bar.querySelector('.ba-bulk-move').disabled).toBe(false)

    rowByName('A').click() // 다시 누르면 해제
    expect(rowByName('A').classList.contains('is-selected')).toBe(false)

    bar.querySelector('.ba-bulk-done').click()
    await settle()
    expect(folder('').classList.contains('ba-folder--selecting')).toBe(false)
  })

  it('전체는 보이는 카드를 모두 고르고, 다시 누르면 모두 푼다', async () => {
    await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    await addBookmark(rec({ dedupeKey: 'b' }), 'B')
    await mount()
    folder('').querySelector('.ba-folder-select').click(); await settle()
    const bar = () => folder('').querySelector('.ba-bulkbar')
    bar().querySelector('.ba-bulk-all').click()
    expect(bar().querySelector('.ba-bulkcount b').textContent).toBe('2')
    expect(bar().querySelector('.ba-bulk-all').textContent).toBe('모두 해제')
    bar().querySelector('.ba-bulk-all').click()
    expect(bar().querySelector('.ba-bulkcount b').textContent).toBe('0')
    bar().querySelector('.ba-bulk-done').click(); await settle()
  })

  it('삭제는 1클릭에 지우지 않고, 두 번째에 고른 것만 지운 뒤 실행취소를 준다', async () => {
    await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    await addBookmark(rec({ dedupeKey: 'b' }), 'B')
    await addBookmark(rec({ dedupeKey: 'c' }), 'C')
    await mount()
    folder('').querySelector('.ba-folder-select').click(); await settle()
    rowByName('A').click(); rowByName('C').click()
    const del = folder('').querySelector('.ba-bulk-del')
    del.click(); await settle()
    expect(await listByKind('bookmark', 'poe2')).toHaveLength(3) // 아직 살아 있다
    expect(toasts.at(-1).m).toContain('2개')
    expect(del.classList.contains('armed')).toBe(true)

    del.click(); await settle()
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['B'])
    expect(folder('')?.classList.contains('ba-folder--selecting')).toBe(false) // 선택 모드도 끝난다
    const undo = toasts.at(-1).a
    expect(undo.label).toBe('실행취소')
    await undo.onClick()
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['A', 'B', 'C'])
  })

  it('이동은 고른 id 를 넘기고, 옮겼으면 선택 모드를 끝낸다 — 취소하면 고른 것을 남긴다', async () => {
    const a = await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    await addBookmark(rec({ dedupeKey: 'b' }), 'B')
    await mount({ moveResult: 0 }) // 첫 번째는 취소
    folder('').querySelector('.ba-folder-select').click(); await settle()
    rowByName('A').click()
    folder('').querySelector('.ba-bulk-move').click(); await settle()
    expect(moveCalls).toEqual([[a.id]])
    expect(folder('').classList.contains('ba-folder--selecting')).toBe(true)
    expect(rowByName('A').classList.contains('is-selected')).toBe(true)

    ui.bulkMove = async (ids) => { moveCalls.push(ids); return ids.length } // 이번엔 옮긴다
    folder('').querySelector('.ba-bulk-move').click(); await settle()
    expect(folder('').classList.contains('ba-folder--selecting')).toBe(false)
  })
})
