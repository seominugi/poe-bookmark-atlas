// @vitest-environment jsdom
// 저장 충돌 판정(resolveSaveConflict)·기존 북마크 focus(highlightBookmark)·요약 칩(개수 배지 + 수치) 통합 검증.
// 라이브 거래소는 로그인 세션이 필요해 실검색은 못 하지만, UI 로직은 jsdom에서 실제 코드로 검증한다.
import { describe, it, expect, beforeEach } from 'vitest'
import { addBookmark } from '../src/store/store.js'
import { resolveSaveConflict, highlightBookmark, overwriteSource, renderList } from '../src/content/panel/renderList.js'

// jsdom 미구현/미노출 API 스텁 (실제 브라우저 content script엔 존재)
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

// .ba-root > .ba-list > .ba-row[data-id] — highlightBookmark가 대상 행을 찾을 수 있게
function mkList(ids) {
  const root = document.createElement('div'); root.className = 'ba-root'
  const list = document.createElement('div'); list.className = 'ba-list'
  for (const id of ids) { const row = document.createElement('div'); row.className = 'ba-row'; row.dataset.id = id; list.appendChild(row) }
  root.appendChild(list); document.body.appendChild(root)
  return list
}
// 스크립트된 선택을 돌려주는 가짜 충돌 팝오버 — 호출 인자 기록. (실제 spotlight는 panel.js showConflict + 브라우저 하네스에서 검증)
function mkUi(ret) {
  const calls = []
  return { calls, showConflict: (rowId, title, message, buttons) => { calls.push({ rowId, title, message, buttons }); return Promise.resolve(ret) } }
}
const baseRec = (over) => ({
  game: 'poe2', league: 'S', url: 'https://poe.kakaogames.com/trade2/x', title: 'T', itemType: '반지', name: null,
  stats: ['화염 저항 #%'], statGroups: [{ type: 'and', label: '및', filters: [{ text: '화염 저항 #%', value: '≥40' }] }],
  otherFilters: [{ key: 'ilvl', label: '아이템 레벨', value: '≥80' }], priceFilter: null, dedupeKey: 'kExact', ...over,
})

describe('resolveSaveConflict — 저장 충돌 판정 (통합)', () => {
  it('완전 동일(exact): 덮어쓰기 선택 → overwriteId, 대상 rowId·덮어쓰기 버튼(새로 만들기 없음)', async () => {
    const bm = await addBookmark(baseRec({ dedupeKey: 'kExact' }), '기존')
    const ui = mkUi('overwrite')
    const action = await resolveSaveConflict(baseRec({ dedupeKey: 'kExact' }), 'poe2', ui)
    expect(action).toEqual({ overwriteId: bm.id })
    expect(ui.calls[0].rowId).toBe(bm.id) // 대상 북마크 id → 팝오버가 그 옆에 뜸
    expect(ui.calls[0].title).toBe('이미 저장된 검색')
    expect(ui.calls[0].buttons.map((b) => b.value)).toEqual(['overwrite']) // exact는 '새로 만들기' 없음(완전 복제 방지)
  })
  it('완전 동일(exact): 취소 → cancel + highlightId(기존 북마크)', async () => {
    const bm = await addBookmark(baseRec({ dedupeKey: 'kExact' }), '기존')
    const action = await resolveSaveConflict(baseRec({ dedupeKey: 'kExact' }), 'poe2', mkUi('cancel'))
    expect(action).toEqual({ cancel: true, highlightId: bm.id })
  })
  it('수치만 다름(near-dup): 새로 만들기 → new, 덮어쓰기·새로 만들기 버튼', async () => {
    const bm = await addBookmark(baseRec({ dedupeKey: 'kA' }), '기존')
    const ui = mkUi('new')
    const action = await resolveSaveConflict(baseRec({ dedupeKey: 'kB' }), 'poe2', ui)
    expect(action).toEqual({ new: true })
    expect(ui.calls[0].rowId).toBe(bm.id)
    expect(ui.calls[0].title).toBe('수치만 다른 북마크')
    expect(ui.calls[0].buttons.map((b) => b.value).sort()).toEqual(['new', 'overwrite'])
  })
  it('수치만 다름(near-dup): 덮어쓰기 → overwriteId', async () => {
    const bm = await addBookmark(baseRec({ dedupeKey: 'kA' }), '기존')
    const action = await resolveSaveConflict(baseRec({ dedupeKey: 'kB' }), 'poe2', mkUi('overwrite'))
    expect(action).toEqual({ overwriteId: bm.id })
  })
  it('무관: 팝오버 없이 바로 새로 저장', async () => {
    await addBookmark(baseRec({ dedupeKey: 'kA', stats: ['냉기 저항 #%'] }), '무관') // 구조 다름
    const ui = mkUi('overwrite')
    const action = await resolveSaveConflict(baseRec({ dedupeKey: 'kZ' }), 'poe2', ui)
    expect(action).toEqual({ new: true })
    expect(ui.calls.length).toBe(0) // 충돌 없음 → 팝오버 안 뜸
  })
})

describe('highlightBookmark — 기존 북마크 focus', () => {
  it('대상 행에 스포트라이트 클래스 부여', () => {
    const list = mkList(['a', 'b'])
    highlightBookmark(list, 'b')
    expect(list.querySelector('.ba-row[data-id="b"]').classList.contains('ba-spot-target')).toBe(true)
    expect(list.closest('.ba-root').classList.contains('ba-spotlighting')).toBe(true)
  })
  it('없는 id는 조용히 무시(throw 없음)', () => {
    const list = mkList(['a'])
    expect(() => highlightBookmark(list, 'zzz')).not.toThrow()
  })
  it('접힌 폴더 안의 북마크를 focus하면 폴더를 펼쳐 대상이 보이게 한다', () => {
    const root = document.createElement('div'); root.className = 'ba-root'
    const list = document.createElement('div'); list.className = 'ba-list'
    const folder = document.createElement('div'); folder.className = 'ba-folder ba-folder--collapsed'
    const body = document.createElement('div'); body.className = 'ba-folder-body'
    const row = document.createElement('div'); row.className = 'ba-row'; row.dataset.id = 'inF'
    body.appendChild(row); folder.appendChild(body); list.appendChild(folder); root.appendChild(list); document.body.appendChild(root)
    highlightBookmark(list, 'inF')
    expect(folder.classList.contains('ba-folder--collapsed')).toBe(false) // 접힘 해제 → 대상 행이 0-size가 아니게
    expect(row.classList.contains('ba-spot-target')).toBe(true)
  })
})

describe('overwriteSource — 덮어쓰기 payload', () => {
  it('검색 내용만 담고 name/folderId/order는 제외(overwriteBookmark가 보존)', () => {
    const src = overwriteSource(baseRec({ dedupeKey: 'k', name: '유니크' }))
    expect(src.dedupeKey).toBe('k')
    expect(src.stats).toEqual(['화염 저항 #%'])
    expect('name' in src).toBe(false)
    expect('folderId' in src).toBe(false)
    expect('order' in src).toBe(false)
  })
})

describe('renderList — 요약 칩(개수 배지 + 입력 수치)', () => {
  it('북마크 카드에 개수 배지와 수치 요약을 렌더', async () => {
    await addBookmark(baseRec({ dedupeKey: 'kC' }), '테스트')
    const list = document.createElement('div')
    document.body.appendChild(list)
    await renderList(list, document.createElement('div'), { game: 'poe2', league: 'S', getLeagueMap: () => ({}) })
    const chip = list.querySelector('.ba-cond--summary')
    expect(chip).toBeTruthy()
    expect(chip.querySelector('.ba-cond-n').textContent).toBe('조건 2개') // 필터 ilvl 1 + 능력치 1
    expect(chip.querySelector('.ba-cond-tx').textContent).toContain('화염 저항 ≥40')
  })

  it('북마크 카드: ⋯ 액션 팝오버(복사·갱신·이름·이동·삭제) 렌더 + 열기/닫기 토글', async () => {
    await addBookmark(baseRec({ dedupeKey: 'kD' }), '테스트')
    const root = document.createElement('div'); root.className = 'ba-root'
    const list = document.createElement('div'); root.appendChild(list); document.body.appendChild(root)
    await renderList(list, root, { game: 'poe2', league: 'S', getLeagueMap: () => ({}) })
    const more = list.querySelector('.ba-more')
    const pop = list.querySelector('.ba-actions-pop')
    expect(more).toBeTruthy()
    expect(pop).toBeTruthy()
    expect(pop.hidden).toBe(true) // 기본 숨김
    ;['.ba-copy', '.ba-over', '.ba-rename', '.ba-move', '.ba-del'].forEach((sel) => expect(pop.querySelector(sel)).toBeTruthy())
    more.click()
    expect(pop.hidden).toBe(false) // ⋯ 클릭 → 열림
    more.click()
    expect(pop.hidden).toBe(true) // 다시 클릭 → 닫힘(토글)
  })
})
