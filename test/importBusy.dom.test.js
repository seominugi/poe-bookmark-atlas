// @vitest-environment jsdom
// 가져오기 진행 표시 — 제보(2026-09-04) "파일 불러오고 리스트 갱신되는데 약간의 딜레이가 있어 중간에 꼬인다".
//
// 여기서 막는 건 '느린 것' 자체가 아니다. 느린 건 데이터가 많으면 어쩔 수 없다.
// 막아야 하는 건 **그동안 아무 표시가 없고, 다시 눌러도 막히지 않는 것**이다 —
// 파일 대화상자가 두 번 열리면 두 번째 가져오기가 첫 번째와 겹쳐 무엇이 반영됐는지 알 수 없게 된다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { listByKind } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

const BACKUP = {
  game: 'poe2',
  folders: [],
  bookmarks: [{
    game: 'poe2', league: 'Standard', title: '반지', itemType: '반지', name: '가져온 반지',
    stats: [], statGroups: [], otherFilters: [], priceFilter: null,
    url: 'https://poe.kakaogames.com/trade2/search/poe2/hash1', dedupeKey: 'imported-1',
  }],
}

let dialogs = 0
let origCreate
beforeEach(() => {
  globalThis.__resetChromeMock()
  document.body.innerHTML = ''
  dialogs = 0
  // 파일 대화상자를 흉내 낸다 — click() 이 곧 '사용자가 파일을 골랐다'가 된다.
  origCreate = document.createElement.bind(document)
  document.createElement = (tag, ...rest) => {
    const el = origCreate(tag, ...rest)
    if (String(tag).toLowerCase() === 'input') {
      el.click = () => {
        if (el.type !== 'file') return
        dialogs++
        Object.defineProperty(el, 'files', {
          value: [new File([JSON.stringify(BACKUP)], 'bm.json', { type: 'application/json' })],
          configurable: true,
        })
        el.onchange && el.onchange()
      }
    }
    return el
  }
})
afterEach(() => { document.createElement = origCreate })

const toasts = []
const ui = {
  game: 'poe2', league: 'Standard', getLeagueMap: () => ({ Standard: '스탠다드' }),
  toast: (m) => toasts.push(m),
  showChoice: async () => 'ok', // 합치기
}

async function render() {
  document.body.innerHTML = ''
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}
const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)) }

describe('가져오기 진행 표시', () => {
  it('파일을 고르면 버튼이 진행 상태로 잠긴다', async () => {
    const list = await render()
    toasts.length = 0
    list.querySelector('.ba-import').click()
    const btn = list.querySelector('.ba-import')
    expect(btn.classList.contains('ba-busy'), '진행 표시가 없다').toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    await settle()
  })

  it('진행 중에 다시 눌러도 파일 대화상자가 두 번 열리지 않는다 — 이게 "꼬인다"의 실체다', async () => {
    const list = await render()
    toasts.length = 0
    list.querySelector('.ba-import').click()
    expect(dialogs).toBe(1)
    list.querySelector('.ba-import').click()
    list.querySelector('.ba-import').click()
    expect(dialogs, '두 번째 가져오기가 겹쳤다').toBe(1)
    // 말없이 무시하지 않는다 — 아무 반응이 없으면 고장으로 읽힌다
    expect(toasts.some((t) => t.includes('가져오는 중'))).toBe(true)
    await settle()
  })

  it('끝나면 잠금이 풀리고 결과를 알린다', async () => {
    const list = await render()
    toasts.length = 0
    list.querySelector('.ba-import').click()
    await settle()
    expect((await listByKind('bookmark', 'poe2')).length).toBe(1)
    expect(toasts.some((t) => t.includes('가져왔습니다')), `토스트: ${toasts.join(' | ')}`).toBe(true)
    // 재렌더 뒤 새 버튼도 풀려 있어야 한다 — 잠금이 모듈 레벨이라 여기서 새어 나오면 영구히 막힌다
    const after = await render()
    expect(after.querySelector('.ba-import').classList.contains('ba-busy')).toBe(false)
  })

  it('진행 중에 목록이 다시 그려져도 잠금이 유지된다', async () => {
    const list = await render()
    toasts.length = 0
    list.querySelector('.ba-import').click()
    const mid = await render() // 그 사이 다른 이유로 재렌더가 일어난 상황
    expect(mid.querySelector('.ba-import').classList.contains('ba-busy'), '재렌더가 잠금을 풀어버렸다').toBe(true)
    await settle()
  })

  it('파일 선택을 취소하면 잠기지 않는다 — 취소하면 onchange 가 아예 오지 않는다', async () => {
    // 대화상자는 열리지만 아무것도 고르지 않은 상황. 여기서 잠그면 버튼이 영영 잠긴 채로 남는다.
    document.createElement = (tag, ...rest) => {
      const el = origCreate(tag, ...rest)
      if (String(tag).toLowerCase() === 'input') el.click = () => { if (el.type === 'file') dialogs++ }
      return el
    }
    const list = await render()
    list.querySelector('.ba-import').click()
    expect(dialogs, '대화상자는 열렸어야 한다').toBe(1)
    expect(list.querySelector('.ba-import').classList.contains('ba-busy'), '고르지도 않았는데 잠겼다').toBe(false)
    // 그리고 다시 누를 수 있어야 한다
    list.querySelector('.ba-import').click()
    expect(dialogs).toBe(2)
  })

  it('JSON 이 깨져 있으면 잠금이 풀린다 — 한 번 실패하면 영영 못 누르게 되면 안 된다', async () => {
    document.createElement = (tag, ...rest) => {
      const el = origCreate(tag, ...rest)
      if (String(tag).toLowerCase() === 'input') {
        el.click = () => {
          if (el.type !== 'file') return
          dialogs++
          Object.defineProperty(el, 'files', { value: [new File(['{ not json'], 'x.json')], configurable: true })
          el.onchange && el.onchange()
        }
      }
      return el
    }
    const list = await render()
    toasts.length = 0
    list.querySelector('.ba-import').click()
    await settle()
    expect(toasts.some((t) => t.includes('JSON 형식'))).toBe(true)
    const after = await render()
    expect(after.querySelector('.ba-import').classList.contains('ba-busy'), '실패 후에도 잠긴 채로 남았다').toBe(false)
  })
})
