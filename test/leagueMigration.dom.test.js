// @vitest-environment jsdom
// 리그 이관 — 지난 리그 북마크를 열 때의 제안 흐름과 ⋯ 액션(저장된 조건으로 현재 리그 재검색).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { addBookmark, listByKind } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

const QUERY = { query: { status: { option: 'online' }, type: '반지' }, sort: { price: 'asc' } }
const baseRec = (over) => ({
  game: 'poe2', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], statGroups: [], otherFilters: [], priceFilter: null,
  url: 'https://poe.kakaogames.com/trade2/search/poe2/Old/hash1', league: 'Old', dedupeKey: 'k1', ...over,
})

// ui 목 — showConflict는 사용자가 고를 값을 미리 정해둔다(호출 인자도 기록)
function makeUi(choice, migrateResult = { ok: true, url: 'https://poe.kakaogames.com/trade2/search/poe2/New/newhash' }) {
  const calls = { conflict: [], migrate: [], toast: [] }
  return {
    calls,
    ui: {
      game: 'poe2',
      league: 'New',
      getLeagueMap: () => ({ Old: '지난 리그', New: '현재 리그' }),
      toast: (m) => calls.toast.push(m),
      showConflict: async (...args) => { calls.conflict.push(args); return choice },
      migrateSearch: async (...args) => { calls.migrate.push(args); return migrateResult },
    },
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

describe('리그 이관 — 행 표시', () => {
  it('저장 리그가 현재 리그와 다르면 data-past, 같으면 없음', async () => {
    await addBookmark(baseRec({ league: 'Old' }), '지난것')
    await addBookmark(baseRec({ league: 'New', dedupeKey: 'k2' }), '현재것')
    const list = await render(makeUi('cancel').ui)
    const rows = [...list.querySelectorAll('.ba-row[data-kind="bookmark"]')]
    const byName = (n) => rows.find((r) => r.querySelector('.ba-open b').textContent === n)
    expect(byName('지난것').dataset.past).toBe('1')
    expect(byName('현재것').dataset.past).toBeUndefined()
  })

  it('⋯ 액션은 조건(query)을 가진 북마크에만 노출된다', async () => {
    await addBookmark(baseRec({ query: QUERY }), '조건있음')
    await addBookmark(baseRec({ dedupeKey: 'k2' }), '조건없음') // 구 북마크
    const list = await render(makeUi('cancel').ui)
    const rows = [...list.querySelectorAll('.ba-row[data-kind="bookmark"]')]
    const has = rows.find((r) => r.querySelector('.ba-open b').textContent === '조건있음')
    const none = rows.find((r) => r.querySelector('.ba-open b').textContent === '조건없음')
    expect(has.querySelector('.ba-migrate')).toBeTruthy()
    expect(none.querySelector('.ba-migrate')).toBeNull()
  })
})

describe('리그 이관 — 열기 시 제안', () => {
  it('지난 리그 + 조건 있음 → 다시 검색 선택 시 API 호출 후 북마크 링크·리그 갱신', async () => {
    const b = await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('migrate')
    const list = await render(ui)
    list.querySelector('.ba-open').click()
    await tick(); await tick()
    expect(calls.conflict).toHaveLength(1)
    expect(calls.conflict[0][2]).toContain('현재 리그') // 어느 리그로 가는지 문구에 명시
    expect(calls.migrate).toEqual([[QUERY, 'New']]) // 저장된 조건 그대로 + 현재 리그
    const after = (await listByKind('bookmark', 'poe2')).find((x) => x.id === b.id)
    expect(after.url).toBe('https://poe.kakaogames.com/trade2/search/poe2/New/newhash')
    expect(after.league).toBe('New')
    expect(after.name).toBe('내 북마크') // 이름 보존
  })

  it('"그대로 열기"를 고르면 이관하지 않고 기존 링크 유지', async () => {
    const b = await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('open')
    const list = await render(ui)
    list.querySelector('.ba-open').click()
    await tick(); await tick()
    expect(calls.migrate).toHaveLength(0)
    expect((await listByKind('bookmark', 'poe2')).find((x) => x.id === b.id).url).toBe(baseRec({}).url)
  })

  it('취소(팝오버 밖 클릭·ESC)면 아무 일도 없다', async () => {
    await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('cancel')
    const list = await render(ui)
    list.querySelector('.ba-open').click()
    await tick(); await tick()
    expect(calls.migrate).toHaveLength(0)
  })

  it('조건 없는 구 북마크는 이관 버튼 대신 저장된 조건을 보여준다', async () => {
    await addBookmark(baseRec({ stats: ['화염 저항 #%'] }), '구 북마크')
    const { ui, calls } = makeUi('open')
    const list = await render(ui)
    list.querySelector('.ba-open').click()
    await tick(); await tick()
    const [, , message, buttons] = calls.conflict[0]
    expect(message).toContain('화염 저항') // (b)안의 가치 — 조건을 알려줘 사용자가 직접 재구성 가능
    expect(buttons.map((x) => x.value)).toEqual(['open']) // 다시 검색 버튼 없음
    expect(calls.migrate).toHaveLength(0)
  })

  it('현재 리그 북마크는 제안 없이 바로 연다', async () => {
    await addBookmark(baseRec({ league: 'New', query: QUERY }), '현재것')
    const { ui, calls } = makeUi('migrate')
    const list = await render(ui)
    list.querySelector('.ba-open').click()
    await tick(); await tick()
    expect(calls.conflict).toHaveLength(0)
  })

  it('Ctrl 클릭(새 탭)은 제안 없이 원본을 연다', async () => {
    await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('migrate')
    const list = await render(ui)
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    list.querySelector('.ba-open').dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }))
    await tick(); await tick()
    expect(calls.conflict).toHaveLength(0)
    expect(opened).toHaveBeenCalledWith(baseRec({}).url, '_blank', 'noopener')
    opened.mockRestore()
  })
})

describe('리그 이관 — ⋯ 액션과 실패 처리', () => {
  it('⋯ 액션 클릭도 같은 이관을 수행한다', async () => {
    const b = await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('cancel')
    const list = await render(ui)
    list.querySelector('.ba-migrate').click()
    await tick(); await tick()
    expect(calls.migrate).toEqual([[QUERY, 'New']])
    expect((await listByKind('bookmark', 'poe2')).find((x) => x.id === b.id).league).toBe('New')
  })

  it('요청 제한(429)이면 안내만 하고 북마크는 그대로 둔다', async () => {
    const b = await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('cancel', { ok: false, reason: 'rate' })
    const list = await render(ui)
    list.querySelector('.ba-migrate').click()
    await tick(); await tick()
    expect(calls.toast.some((t) => t.includes('제한'))).toBe(true)
    const after = (await listByKind('bookmark', 'poe2')).find((x) => x.id === b.id)
    expect(after.league).toBe('Old')
    expect(after.url).toBe(baseRec({}).url)
  })

  it('이관 결과 URL이 거래소 도메인이 아니면 저장도 이동도 하지 않는다', async () => {
    const b = await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('cancel', { ok: true, url: 'https://evil.example/trade2/search/poe2/New/x' })
    const list = await render(ui)
    list.querySelector('.ba-migrate').click()
    await tick(); await tick()
    expect(calls.toast.some((t) => t.includes('허용되지 않은'))).toBe(true)
    const after = (await listByKind('bookmark', 'poe2')).find((x) => x.id === b.id)
    expect(after.url).toBe(baseRec({}).url) // 검증 전에 기록되면 안 됨
    expect(after.league).toBe('Old')
  })

  it('연타해도 요청은 한 번만 나간다', async () => {
    await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('cancel')
    // 응답을 지연시켜 두 번째 클릭이 진행 중에 들어오게 한다
    ui.migrateSearch = async (...args) => { calls.migrate.push(args); await new Promise((r) => setTimeout(r, 30)); return { ok: false, reason: 'rate' } }
    const list = await render(ui)
    const btn = list.querySelector('.ba-migrate')
    btn.click(); btn.click(); btn.click()
    await new Promise((r) => setTimeout(r, 60))
    expect(calls.migrate).toHaveLength(1)
  })
})
