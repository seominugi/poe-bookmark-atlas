// @vitest-environment jsdom
// 폴더 삭제 안전장치 — 내용이 있으면 한 번 더 묻고, 지웠으면 무엇이 지워졌는지 알리고 되돌릴 수 있어야 한다.
// 배경(제보 2026-08-18): 다른 리그 섹션에 '빈 폴더'로 복제 렌더된 폴더를 지웠더니 원본이 통째로 날아갔다.
// 화면에 0개로 보여도 폴더가 실제로 담고 있는 수를 기준으로 물어야 그 사고를 막는다.
import { describe, it, expect, beforeEach } from 'vitest'
import { addBookmark, addFolder, listFolders, listByKind } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }
beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

const LIVE = { Mirage: '허상', Standard: '스탠다드' }
const rec = (over) => ({
  game: 'poe1', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], statGroups: [], otherFilters: [], priceFilter: null,
  url: 'https://poe.kakaogames.com/trade/search/Mirage/hash1', league: 'Mirage', dedupeKey: 'k1', ...over,
})

function makeUi(over = {}) {
  const toasts = []
  return {
    toasts,
    ui: { game: 'poe1', league: 'Mirage', getLeagueMap: () => LIVE, toast: (m, a) => toasts.push({ m, a }), ...over },
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
const delBtn = (list, fid) => list.querySelector(`.ba-folder[data-folder="${fid}"] .ba-folder-del`)

describe('폴더 삭제 — 확인 + 실행취소', () => {
  it('북마크가 든 폴더는 1클릭에 지워지지 않고 몇 개가 들었는지 알린다', async () => {
    const f = await addFolder('세팅용', 'poe1')
    await addBookmark(rec({ folderId: f.id }), '반지검색')
    const { ui, toasts } = makeUi()
    const list = await render(ui)

    delBtn(list, f.id).click()
    await tick()
    expect(await listFolders('poe1')).toHaveLength(1) // 아직 살아 있다
    expect(delBtn(list, f.id).classList.contains('armed')).toBe(true)
    expect(toasts.at(-1).m).toContain('세팅용')
    expect(toasts.at(-1).m).toContain('1개')
  })

  it('두 번째 클릭에 삭제 + 실행취소로 폴더·북마크가 원상복구', async () => {
    const f = await addFolder('세팅용', 'poe1')
    const b = await addBookmark(rec({ folderId: f.id }), '반지검색')
    const { ui, toasts } = makeUi()
    const list = await render(ui)

    delBtn(list, f.id).click(); await tick()
    delBtn(list, f.id).click(); await tick()
    expect(await listFolders('poe1')).toHaveLength(0)
    expect((await listByKind('bookmark', 'poe1'))[0].folderId).toBeNull()

    const undo = toasts.at(-1).a
    expect(undo.label).toBe('실행취소')
    await undo.onClick()
    const folders = await listFolders('poe1')
    expect(folders).toHaveLength(1)
    expect(folders[0].name).toBe('세팅용')
    expect((await listByKind('bookmark', 'poe1'))[0].folderId).toBe(f.id)
    expect(b.folderId).toBe(f.id)
  })

  it('빈 폴더는 마찰 없이 바로 지우되 실행취소는 준다', async () => {
    const f = await addFolder('빈폴더', 'poe1')
    const { ui, toasts } = makeUi()
    const list = await render(ui)

    delBtn(list, f.id).click(); await tick()
    expect(await listFolders('poe1')).toHaveLength(0)
    expect(toasts.at(-1).a.label).toBe('실행취소')
    await toasts.at(-1).a.onClick()
    expect(await listFolders('poe1')).toHaveLength(1)
  })

  it('화면에 0개로 보이는 복제 폴더를 눌러도 실제 보유 수로 확인을 건다 (제보 사고)', async () => {
    const f = await addFolder('세팅용', 'poe1')
    await addBookmark(rec({ folderId: f.id }), '반지검색')
    // 재부팅 후: 거래소가 스탠다드로 열려 '스탠다드(현재)' 섹션에 빈 복제본이 생긴 상태
    const { ui } = makeUi({ league: 'Standard' })
    const list = await render(ui)
    const empties = [...list.querySelectorAll(`.ba-folder[data-folder="${f.id}"]`)]
      .filter((d) => d.querySelectorAll('.ba-row[data-kind="bookmark"]').length === 0)
    for (const el of empties) {
      el.querySelector('.ba-folder-del').click()
      await tick()
      expect(await listFolders('poe1')).toHaveLength(1) // 한 번의 클릭으로는 절대 안 지워진다
    }
  })
})
