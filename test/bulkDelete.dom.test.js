// @vitest-environment jsdom
// 일괄 삭제 UI — 비우기 버튼 · 가져오기의 합치기/교체 분기.
//
// 배경(제보 2026-08-24): 미분류 폴더 헤더에는 액션이 0개였다(`g.id !== null` 가드). 폴더를 지울 때마다
// 북마크가 미분류로 밀려 쌓이는데 비울 방법이 없어서, 두 PC 손 동기화가 거듭될수록 지저분해졌다.
//
// 파괴적 UI라 확인·되돌리기가 실제로 붙어 있는지까지 본다 — 버튼이 그려지는 것만으로는 안전하지 않다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { addBookmark, addFolder, listByKind, listFolders } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }
beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

const LIVE = { Standard: '스탠다드' }
const rec = (over) => ({
  game: 'poe2', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], statGroups: [], otherFilters: [], priceFilter: null,
  url: 'https://poe.kakaogames.com/trade2/search/poe2/hash1', league: 'Standard', dedupeKey: 'k1', ...over,
})

function makeUi(over = {}) {
  const toasts = []
  return { toasts, ui: { game: 'poe2', league: 'Standard', getLeagueMap: () => LIVE, toast: (m, a) => toasts.push({ m, a }), ...over } }
}
async function render(ui) {
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}
const tick = () => new Promise((r) => setTimeout(r, 0))
const clearBtn = (list, fid = '') => list.querySelector(`.ba-folder[data-folder="${fid}"] .ba-folder-clear`)
const names = (l) => l.map((b) => b.name).sort()

describe('폴더 비우기 버튼', () => {
  it('미분류에도 비우기가 뜬다 — 지금껏 여기만 액션이 없었다', async () => {
    await addBookmark(rec({ dedupeKey: 'a' }), '미분류것')
    const list = await render(makeUi().ui)
    expect(clearBtn(list)).toBeTruthy()
  })

  it('빈 폴더에는 그리지 않는다 — 눌러도 아무 일 없는 버튼은 고장으로 읽힌다', async () => {
    const f = await addFolder('빈폴더', 'poe2')
    const list = await render(makeUi().ui)
    expect(clearBtn(list, f.id)).toBeNull()
  })

  it('실폴더에서는 삭제(휴지통)와 나란히 뜬다 — 둘은 다른 동작이다', async () => {
    const f = await addFolder('세팅용', 'poe2')
    await addBookmark(rec({ dedupeKey: 'a', folderId: f.id }), '폴더것')
    const list = await render(makeUi().ui)
    expect(clearBtn(list, f.id)).toBeTruthy()
    expect(list.querySelector(`.ba-folder[data-folder="${f.id}"] .ba-folder-del`)).toBeTruthy()
  })

  it('1클릭에 지워지지 않고 몇 개를 지우는지 먼저 알린다', async () => {
    await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    await addBookmark(rec({ dedupeKey: 'b' }), 'B')
    const { ui, toasts } = makeUi()
    const list = await render(ui)

    clearBtn(list).click()
    await tick()

    expect(await listByKind('bookmark', 'poe2')).toHaveLength(2) // 아직 살아 있다
    expect(toasts.at(-1).m).toContain('2개')
    expect(clearBtn(list).classList.contains('armed')).toBe(true)
  })

  it('두 번째 클릭에 지우고, 실행취소로 그대로 되살아난다', async () => {
    const f = await addFolder('세팅용', 'poe2')
    await addBookmark(rec({ dedupeKey: 'a' }), '미분류것')
    await addBookmark(rec({ dedupeKey: 'b', folderId: f.id }), '폴더것')
    const { ui, toasts } = makeUi()
    const list = await render(ui)

    clearBtn(list).click(); await tick()
    clearBtn(list).click(); await tick()

    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['폴더것']) // 미분류만 지워졌다
    const undo = toasts.at(-1).a
    expect(undo.label).toBe('실행취소')

    await undo.onClick()
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['미분류것', '폴더것'])
  })
})

// 가져오기는 파일 선택 → 확인 모달 → (교체면) 백업 다운로드 → 반영 순이다.
// jsdom에는 파일 선택기도 createObjectURL도 없어서 그 둘만 흉내 낸다 — 분기 자체는 실제 코드가 탄다.
describe('가져오기 — 합치기 / 교체', () => {
  let origClick, origFileReader, pending
  beforeEach(() => {
    pending = null
    origClick = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file' && pending) {
        Object.defineProperty(this, 'files', { value: [pending], configurable: true })
        if (this.onchange) this.onchange({ target: this })
        return
      }
      return origClick.call(this)
    }
    origFileReader = globalThis.FileReader
    globalThis.FileReader = class { readAsText(f) { this.result = f.__text; if (this.onload) this.onload() } }
    globalThis.__downloads = []
    URL.createObjectURL = () => { globalThis.__downloads.push(1); return 'blob:x' }
    URL.revokeObjectURL = () => {}
  })
  afterEach(() => { HTMLInputElement.prototype.click = origClick; globalThis.FileReader = origFileReader })

  const jsonFile = (bookmarks, folders = [], over = {}) => ({
    name: 'bookmark-atlas-2026-08-24.json',
    __text: JSON.stringify({ app: 'poe-bookmark-atlas', version: 1, game: 'poe2', folders, bookmarks, ...over }),
  })
  const incoming = [{ ...rec({ dedupeKey: 'new' }), name: '새것' }]

  async function runImport(choice, file) {
    await addBookmark(rec({ dedupeKey: 'old' }), '기존것')
    const seen = []
    const { ui, toasts } = makeUi({ showChoice: async (o) => { seen.push(o); return choice } })
    const list = await render(ui)
    pending = file
    list.querySelector('.ba-import').click()
    await tick(); await tick()
    return { seen, toasts }
  }

  it('확인 모달에 지금 있는 수와 가져올 수를 함께 보여준다', async () => {
    const { seen } = await runImport(null, jsonFile(incoming))
    expect(seen).toHaveLength(1)
    expect(seen[0].message).toContain('가져올 것: 북마크 1개')
    expect(seen[0].message).toContain('지금 있는 것: 북마크 1개')
    expect(seen[0].alt).toContain('1개 삭제')
  })

  it('취소하면 아무것도 바뀌지 않는다', async () => {
    await runImport(null, jsonFile(incoming))
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['기존것'])
    expect(globalThis.__downloads).toHaveLength(0)
  })

  it('합치기는 기존을 남긴다 — 백업 파일도 만들지 않는다', async () => {
    await runImport('ok', jsonFile(incoming))
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['기존것', '새것'])
    expect(globalThis.__downloads).toHaveLength(0)
  })

  it('교체는 기존을 지우고, 지우기 전에 백업 파일을 내려받고, 실행취소를 준다', async () => {
    const { toasts } = await runImport('alt', jsonFile(incoming))

    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['새것'])
    expect(globalThis.__downloads).toHaveLength(1) // 백업이 실제로 나갔다
    const undo = toasts.at(-1).a
    expect(undo.label).toBe('실행취소')

    await undo.onClick()
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['기존것'])
  })

  // 파일의 game이 지금 화면과 다르면 교체가 엉뚱한 게임을 날린다. 숫자만 보고 누르지 않도록 문장으로 경고한다.
  it('다른 게임 백업이면 경고 문구가 붙는다', async () => {
    const { seen } = await runImport(null, jsonFile(incoming, [], { game: 'poe1' }))
    expect(seen[0].message).toContain('POE1')
    expect(seen[0].message).toContain('POE2')
  })

  it('폴더만 있고 북마크가 0개인 파일도 확인 모달을 띄운다 (폴더 구조만 옮기는 경우)', async () => {
    const { seen } = await runImport(null, jsonFile([], [{ id: 'f1', name: '가져온폴더' }]))
    expect(seen[0].message).toContain('폴더 1개')
  })
})
