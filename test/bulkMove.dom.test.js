// @vitest-environment jsdom
// 선택 모드 — 여러 북마크를 골라 한 번에 폴더로 이동 (사용자 제보: 하나씩 ⋯ → 이동은 반복이 심하다)
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { addBookmark, addFolder, listByKind, listFolders } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

let onChanged = null
beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })
// selectMode 등은 모듈 레벨 상태라 테스트 간에 남는다(실제로는 페이지 로드마다 초기화되므로 제품 문제는 아니다).
// 리스너를 매번 떼고, render()에서 선택 모드를 꺼진 상태로 정규화해 테스트 순서 의존을 없앤다.
afterEach(() => { if (onChanged) { document.removeEventListener('ba:records-changed', onChanged); onChanged = null } })

const baseRec = (over) => ({
  game: 'poe2', title: 'T', itemType: '반지', stats: [], statGroups: [], otherFilters: [], priceFilter: null,
  url: 'https://poe.kakaogames.com/trade2/search/poe2/A/x', league: 'A', dedupeKey: 'k', ...over,
})

let list
async function render(pickFolderId) {
  const calls = { toast: [], pick: 0 }
  const ui = {
    game: 'poe2', league: 'A', getLeagueMap: () => ({ A: 'Alpha' }),
    toast: (m) => calls.toast.push(m),
    showFolderPick: async () => { calls.pick++; return pickFolderId },
  }
  const el = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(el)
  document.body.appendChild(root)
  // 재렌더(ba:records-changed)를 실제 패널처럼 연결 — 선택 모드 토글이 재렌더로 반영된다
  onChanged = () => renderList(el, root, ui)
  document.addEventListener('ba:records-changed', onChanged)
  await renderList(el, root, ui)
  list = el
  const stale = el.querySelector('.ba-select-bar') && el.querySelector('.ba-select-toggle')
  if (stale) { stale.click(); await tick(); await tick() } // 앞 테스트가 켜둔 선택 모드를 끄고 시작
  calls.toast.length = 0
  calls.pick = 0
  return calls
}
const tick = () => new Promise((r) => setTimeout(r, 0))
const rows = () => [...list.querySelectorAll('.ba-row[data-kind="bookmark"]')]
const enterSelect = async () => { list.querySelector('.ba-select-toggle').click(); await tick(); await tick() }

describe('선택 모드 진입·해제', () => {
  it('평소엔 체크박스가 없고 드래그 손잡이가 보인다', async () => {
    await addBookmark(baseRec(), 'A')
    await render(null)
    expect(list.querySelectorAll('.ba-pick')).toHaveLength(0)
    expect(list.querySelectorAll('.ba-grip').length).toBeGreaterThan(0)
    expect(list.querySelector('.ba-select-bar')).toBeNull()
  })

  it('선택 버튼을 누르면 체크박스와 선택 바가 나온다', async () => {
    await addBookmark(baseRec({ dedupeKey: 'k1' }), 'A')
    await addBookmark(baseRec({ dedupeKey: 'k2' }), 'B')
    await render(null)
    await enterSelect()
    expect(list.querySelectorAll('.ba-pick')).toHaveLength(2)
    expect(list.querySelector('.ba-select-bar')).toBeTruthy()
    expect(list.querySelector('.ba-select-count b').textContent).toBe('0')
  })

  it('북마크가 없으면 선택 버튼 자체가 없다', async () => {
    await render(null)
    expect(list.querySelector('.ba-select-toggle')).toBeNull()
  })
})

describe('선택 조작', () => {
  beforeEach(async () => {
    await addBookmark(baseRec({ dedupeKey: 'k1' }), 'A')
    await addBookmark(baseRec({ dedupeKey: 'k2' }), 'B')
    await addBookmark(baseRec({ dedupeKey: 'k3' }), 'C')
  })

  it('체크박스를 눌러도 재렌더 없이 개수가 갱신된다(스크롤 튐 방지)', async () => {
    await render(null)
    await enterSelect()
    const before = rows()[0]
    list.querySelectorAll('.ba-pick')[0].click()
    await tick()
    expect(list.querySelector('.ba-select-count b').textContent).toBe('1')
    expect(rows()[0]).toBe(before) // 같은 DOM 노드 = 재렌더 안 됨
    expect(rows()[0].classList.contains('ba-row--picked')).toBe(true)
  })

  it('다시 누르면 해제된다', async () => {
    await render(null)
    await enterSelect()
    const cb = list.querySelectorAll('.ba-pick')[0]
    cb.click(); await tick()
    cb.click(); await tick()
    expect(list.querySelector('.ba-select-count b').textContent).toBe('0')
    expect(cb.classList.contains('on')).toBe(false)
  })

  it('전체 선택·해제', async () => {
    await render(null)
    await enterSelect()
    list.querySelector('.ba-select-all').click(); await tick()
    expect(list.querySelector('.ba-select-count b').textContent).toBe('3')
    list.querySelector('.ba-select-none').click(); await tick()
    expect(list.querySelector('.ba-select-count b').textContent).toBe('0')
  })

  it('선택 중에는 이름을 눌러도 검색이 열리지 않고 선택만 토글된다', async () => {
    await render(null)
    await enterSelect()
    list.querySelector('.ba-open').click()
    await tick()
    expect(list.querySelector('.ba-select-count b').textContent).toBe('1')
  })

  it('아무것도 안 골랐으면 이동 버튼이 비활성', async () => {
    await render(null)
    await enterSelect()
    expect(list.querySelector('.ba-select-move').disabled).toBe(true)
    list.querySelectorAll('.ba-pick')[0].click(); await tick()
    expect(list.querySelector('.ba-select-move').disabled).toBe(false)
  })
})

describe('일괄 이동 실행', () => {
  it('고른 북마크만 폴더로 옮기고 선택 모드가 꺼진다', async () => {
    const f = await addFolder('무기', 'poe2')
    await addBookmark(baseRec({ dedupeKey: 'k1' }), 'A')
    await addBookmark(baseRec({ dedupeKey: 'k2' }), 'B')
    await addBookmark(baseRec({ dedupeKey: 'k3' }), 'C')
    const calls = await render(f.id)
    await enterSelect()
    const picks = [...list.querySelectorAll('.ba-pick')]
    picks[0].click(); picks[1].click(); await tick()
    list.querySelector('.ba-select-move').click()
    await tick(); await tick(); await tick()

    const moved = (await listByKind('bookmark', 'poe2')).filter((b) => b.folderId === f.id)
    expect(moved).toHaveLength(2)
    expect(calls.pick).toBe(1) // 폴더 선택 다이얼로그는 한 번만
    expect(calls.toast.some((t) => t.includes('2개를 옮겼습니다'))).toBe(true)
    expect(list.querySelector('.ba-select-bar')).toBeNull() // 끝나면 선택 모드 해제
  })

  it('폴더 선택을 취소하면 아무것도 옮기지 않는다', async () => {
    await addFolder('무기', 'poe2')
    await addBookmark(baseRec({ dedupeKey: 'k1' }), 'A')
    const calls = await render(false) // showFolderPick이 false = 취소
    await enterSelect()
    list.querySelectorAll('.ba-pick')[0].click(); await tick()
    list.querySelector('.ba-select-move').click()
    await tick(); await tick()
    expect((await listByKind('bookmark', 'poe2'))[0].folderId).toBeNull()
    expect(list.querySelector('.ba-select-bar')).toBeTruthy() // 선택 상태 유지
  })

  it('미분류로도 되돌릴 수 있다', async () => {
    const f = await addFolder('무기', 'poe2')
    const a = await addBookmark(baseRec({ dedupeKey: 'k1', folderId: f.id }), 'A')
    const calls = await render(null) // null = 미분류 선택
    await enterSelect()
    list.querySelectorAll('.ba-pick')[0].click(); await tick()
    list.querySelector('.ba-select-move').click()
    await tick(); await tick(); await tick()
    expect((await listByKind('bookmark', 'poe2')).find((b) => b.id === a.id).folderId).toBeNull()
    expect((await listFolders('poe2'))).toHaveLength(1) // 폴더는 그대로 남는다
  })
})
