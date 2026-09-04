// @vitest-environment jsdom
// 섹션 순서·접기 — 목록이 실제로 그 순서로 그려지고, 접으면 본문만 사라지는가.
//
// 배경(제보 2026-09-04): 시즌 끝물엔 북마크보다 **찜한 매물을 더 자주 본다.**
// 순서가 `북마크 → 찜 → 히스토리`로 고정돼 있어서 "눈이 높아져 찜 리스트가 한 창에 안 보인다"가 됐다.
//
// 여기서 지키는 계약은 셋이다.
//   ① 섹션은 저장된 순서대로 그려진다
//   ② 접으면 **본문만** 사라지고 헤더·개수는 남는다 — 개수가 사라지면 '없어졌다'로 읽힌다
//   ③ 북마크를 접어도 **검색행은 남는다** — 그 검색창은 히스토리도 훑는다
import { describe, it, expect, beforeEach } from 'vitest'
import { addBookmark, addHistory, addWatch } from '../src/store/store.js'
import { renderList, setSecOrder, getSecOrder } from '../src/content/panel/renderList.js'
import { DEFAULT_SEC_ORDER } from '../src/lib/secOrder.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

const LIVE = { Standard: '스탠다드' }
const ui = { game: 'poe2', league: 'Standard', getLeagueMap: () => LIVE, toast: () => {} }

async function seedAll() {
  await addBookmark({
    game: 'poe2', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], statGroups: [], otherFilters: [], priceFilter: null,
    url: 'https://poe.kakaogames.com/trade2/search/poe2/h1', league: 'Standard', dedupeKey: 'b1',
  }, '내 반지')
  await addHistory({
    game: 'poe2', title: '갑옷', itemType: '갑옷', stats: [], statGroups: [], otherFilters: [], priceFilter: null,
    url: 'https://poe.kakaogames.com/trade2/search/poe2/h2', league: 'Standard', dedupeKey: 'h1',
  })
  await addWatch({
    listingId: 'L1', origin: 'poe.kakaogames.com', game: 'poe2', league: 'Standard',
    name: '고상한 오만', baseType: '무궁한 주얼', price: { amount: 10, currency: 'divine' },
    sourceUrl: 'https://poe.kakaogames.com/trade2/search/poe2/Standard/abc',
  })
}

async function render() {
  document.body.innerHTML = ''
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}
const order = (list) => [...list.querySelectorAll('.ba-sec')].map((s) => s.dataset.sec)
const sec = (list, key) => list.querySelector(`.ba-sec[data-sec="${key}"]`)
const title = (list, key) => list.querySelector(`.ba-sec-title[data-sec="${key}"]`)
// 접힘은 모듈 상태라 파일 안에서 이어진다 — 켠 테스트가 스스로 되돌린다.
const expandAll = (list) => list.querySelectorAll('.ba-sec--collapsed .ba-sec-title').forEach((t) => t.click())

beforeEach(async () => {
  globalThis.__resetChromeMock()
  document.body.innerHTML = ''
  setSecOrder(DEFAULT_SEC_ORDER)
  await seedAll()
})

describe('섹션 순서', () => {
  it('기본은 북마크 → 찜한 매물 → 히스토리', async () => {
    expect(order(await render())).toEqual(['bookmarks', 'watch', 'history'])
  })

  it('찜을 맨 위로 올리면 목록도 그 순서로 그려진다 — 제보의 요구가 이것 하나다', async () => {
    setSecOrder(['watch', 'bookmarks', 'history'])
    expect(order(await render())).toEqual(['watch', 'bookmarks', 'history'])
  })

  it('북마크를 맨 아래로 내릴 수도 있다', async () => {
    setSecOrder(['history', 'watch', 'bookmarks'])
    expect(order(await render())).toEqual(['history', 'watch', 'bookmarks'])
  })

  it('순서를 바꿔도 각 섹션의 내용은 그대로 따라간다', async () => {
    setSecOrder(['watch', 'history', 'bookmarks'])
    const list = await render()
    expect(sec(list, 'bookmarks').querySelector('.ba-row[data-kind="bookmark"]')).toBeTruthy()
    expect(sec(list, 'watch').querySelector('.ba-wrow')).toBeTruthy()
    expect(sec(list, 'history').querySelector('.ba-row[data-kind="history"]')).toBeTruthy()
  })

  it('순서는 storage 에 남는다 — 다음 세션에도 유지돼야 한다', async () => {
    setSecOrder(['watch', 'bookmarks', 'history'])
    expect((await chrome.storage.local.get('uiSecOrder')).uiSecOrder).toEqual(['watch', 'bookmarks', 'history'])
    expect(getSecOrder()).toEqual(['watch', 'bookmarks', 'history'])
  })

  it('빈 섹션은 아예 그리지 않는다 — 순서를 바꿔도 마찬가지', async () => {
    globalThis.__resetChromeMock()
    await addBookmark({
      game: 'poe2', title: '반지', itemType: '반지', stats: [], statGroups: [], otherFilters: [], priceFilter: null,
      url: 'https://poe.kakaogames.com/trade2/search/poe2/h1', league: 'Standard', dedupeKey: 'only',
    }, '하나뿐')
    setSecOrder(['watch', 'history', 'bookmarks'])
    expect(order(await render())).toEqual(['bookmarks'])
  })
})

describe('섹션 접기', () => {
  it('제목을 누르면 본문이 접히고, 헤더와 개수는 남는다', async () => {
    const list = await render()
    title(list, 'history').click()
    expect(sec(list, 'history').classList.contains('ba-sec--collapsed')).toBe(true)
    // 개수가 사라지면 '없어졌다'로 읽힌다 — 접혀도 몇 개인지는 계속 보여야 한다
    expect(sec(list, 'history').querySelector('.ba-sec-count').textContent).toBe('1')
    expect(sec(list, 'history').querySelector('.ba-sec-body')).toBeTruthy()
    expandAll(list)
  })

  it('다시 누르면 펼쳐진다', async () => {
    const list = await render()
    const t = title(list, 'watch')
    t.click(); expect(sec(list, 'watch').classList.contains('ba-sec--collapsed')).toBe(true)
    t.click(); expect(sec(list, 'watch').classList.contains('ba-sec--collapsed')).toBe(false)
  })

  it('접힘은 storage 에 남고 재렌더 후에도 유지된다', async () => {
    let list = await render()
    title(list, 'watch').click()
    expect((await chrome.storage.local.get('uiCollapsedSecs')).uiCollapsedSecs).toEqual(['watch'])
    list = await render()
    expect(sec(list, 'watch').classList.contains('ba-sec--collapsed')).toBe(true)
    expandAll(list)
  })

  it('북마크를 접어도 검색행은 남는다 — 그 검색창은 히스토리도 훑는다', async () => {
    const list = await render()
    title(list, 'bookmarks').click()
    const bm = sec(list, 'bookmarks')
    expect(bm.classList.contains('ba-sec--collapsed')).toBe(true)
    // 검색행은 .ba-sec-body 밖(.ba-list-head 안)에 있어야 한다
    const search = bm.querySelector('.ba-search-input[data-scope="bm"]')
    expect(search, '검색창이 사라졌다').toBeTruthy()
    expect(search.closest('.ba-sec-body'), '검색창이 접히는 본문 안에 들어갔다').toBeNull()
    // 액션 행(가져오기·폴더 추가)은 본문 안 — 북마크를 접으면 같이 접히는 게 맞다
    expect(bm.querySelector('.ba-action-row').closest('.ba-sec-body')).toBeTruthy()
    expandAll(list)
  })

  it('섹션 접기와 폴더 접기는 서로 독립이다', async () => {
    const list = await render()
    title(list, 'bookmarks').click()
    expect(list.querySelector('.ba-folder').classList.contains('ba-folder--collapsed')).toBe(false)
    expect((await chrome.storage.local.get('uiCollapsedFolders')).uiCollapsedFolders).toBeUndefined()
    expandAll(list)
  })

  it('세 섹션 모두 제목이 접기 버튼이다 — 하나만 되면 나머지는 고장으로 읽힌다', async () => {
    const list = await render()
    for (const k of ['bookmarks', 'watch', 'history']) {
      expect(title(list, k), `${k} 섹션에 접기 제목이 없다`).toBeTruthy()
      expect(title(list, k).querySelector('.ba-sec-chevron'), `${k} 에 chevron 이 없다`).toBeTruthy()
      // 키보드로도 눌러야 한다(role=button + tabindex)
      expect(title(list, k).getAttribute('role')).toBe('button')
      expect(title(list, k).getAttribute('tabindex')).toBe('0')
    }
  })
})

describe('찜만 있는 사용자 — 예전엔 자기 찜을 못 봤다', () => {
  it('북마크·폴더가 없어도 찜 섹션은 그려진다', async () => {
    globalThis.__resetChromeMock()
    await addWatch({
      listingId: 'L9', origin: 'poe.kakaogames.com', game: 'poe2', league: 'Standard',
      name: '고상한 오만', baseType: '무궁한 주얼', sourceUrl: 'https://poe.kakaogames.com/trade2/search/poe2/Standard/abc',
    })
    const list = await render()
    // 예전 구조에선 빈 상태 분기가 else 안에 찜·히스토리를 통째로 품고 있어 여기가 통째로 안 그려졌다
    expect(sec(list, 'watch'), '찜 섹션이 안 그려졌다').toBeTruthy()
    expect(list.querySelector('.ba-empty-bm'), '빈 상태 안내는 그대로 떠야 한다').toBeTruthy()
  })
})
