// @vitest-environment jsdom
// 리그 이관 — 지난 리그 북마크를 열 때의 제안 흐름과 ⋯ 액션(저장된 조건으로 현재 리그 재검색).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { addBookmark, addHistory, listByKind } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

const QUERY = { query: { status: { option: 'online' }, type: '반지' }, sort: { price: 'asc' } }
const baseRec = (over) => ({
  game: 'poe2', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], statGroups: [], otherFilters: [], priceFilter: null,
  url: 'https://poe.kakaogames.com/trade2/search/poe2/Old/hash1', league: 'Old', dedupeKey: 'k1', ...over,
})

// 거래소 리그 목록 = 지금 열려 있는 리그만. 'Old'가 없다 = 이미 끝난 리그(예: Settlers).
const LIVE = { New: '현재 리그', HC: '하드코어' }

// ui 목 — showConflict는 사용자가 고를 값을 미리 정해둔다(호출 인자도 기록)
function makeUi(choice, migrateResult = { ok: true, url: 'https://poe.kakaogames.com/trade2/search/poe2/New/newhash' }, over = {}) {
  const calls = { conflict: [], migrate: [], toast: [] }
  return {
    calls,
    ui: {
      game: 'poe2',
      league: 'New',
      getLeagueMap: () => LIVE,
      toast: (m) => calls.toast.push(m),
      showConflict: async (...args) => { calls.conflict.push(args); return choice },
      migrateSearch: async (...args) => { calls.migrate.push(args); return migrateResult },
      ...over,
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
  const byName = (list, n) => [...list.querySelectorAll('.ba-row[data-kind="bookmark"]')]
    .find((r) => r.querySelector('.ba-open b').textContent === n)

  it('끝난 리그(목록에 없음)만 data-past — 살아있는 다른 리그는 깨진 게 아니다', async () => {
    await addBookmark(baseRec({ league: 'Old' }), '끝난리그')
    await addBookmark(baseRec({ league: 'New', dedupeKey: 'k2' }), '지금리그')
    await addBookmark(baseRec({ league: 'HC', dedupeKey: 'k3' }), '하드코어') // 살아있지만 다른 리그
    const list = await render(makeUi('cancel').ui)
    expect(byName(list, '끝난리그').dataset.past).toBe('1')
    expect(byName(list, '지금리그').dataset.past).toBeUndefined()
    expect(byName(list, '하드코어').dataset.past).toBeUndefined()
  })

  it('리그 목록을 아직 못 받았으면 판정 보류 — 성급한 경고 없음', async () => {
    await addBookmark(baseRec({ league: 'Old' }), '끝난리그')
    const { ui } = makeUi('cancel', undefined, { getLeagueMap: () => ({}) })
    const list = await render(ui)
    expect(byName(list, '끝난리그').dataset.past).toBeUndefined()
  })

  it('리그 섹션 배지: 끝난 리그 "지난" / 보고 있는 리그 "현재" / 살아있는 다른 리그는 배지 없음', async () => {
    await addBookmark(baseRec({ league: 'Old' }), '끝난리그')
    await addBookmark(baseRec({ league: 'New', dedupeKey: 'k2' }), '지금리그')
    await addBookmark(baseRec({ league: 'HC', dedupeKey: 'k3' }), '하드코어')
    const list = await render(makeUi('cancel').ui)
    const badgeOf = (lgKey) => {
      const sec = list.querySelector(`.ba-league[data-league="${lgKey}"]`)
      const b = sec.querySelector('.ba-league-badge')
      return { text: b ? b.textContent : null, collapsed: sec.classList.contains('ba-league--collapsed') }
    }
    expect(badgeOf('Old')).toEqual({ text: '지난', collapsed: true }) // 끝난 리그만 접어둔다
    expect(badgeOf('New')).toEqual({ text: '현재', collapsed: false })
    expect(badgeOf('HC')).toEqual({ text: null, collapsed: false })
  })

  it('⋯ 액션은 검색 해시나 조건이 있으면 노출 — 조건 없는 구 북마크도 URL 치환으로 되살릴 수 있다', async () => {
    await addBookmark(baseRec({ query: QUERY }), '조건있음')
    await addBookmark(baseRec({ dedupeKey: 'k2' }), '해시만있음') // 구 북마크(조건 미저장)
    await addBookmark(baseRec({ dedupeKey: 'k3', url: 'https://poe.kakaogames.com/trade2/search/poe2/Old' }), '둘다없음')
    const list = await render(makeUi('cancel').ui)
    expect(byName(list, '조건있음').querySelector('.ba-migrate')).toBeTruthy()
    expect(byName(list, '해시만있음').querySelector('.ba-migrate')).toBeTruthy()
    expect(byName(list, '둘다없음').querySelector('.ba-migrate')).toBeNull()
  })
})

describe('내 리그 결정 (설정 → 페이지 → 최근 검색)', () => {
  it('설정에서 고른 리그가 페이지 리그보다 우선한다', async () => {
    await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('cancel', undefined, { league: 'New', userLeague: 'HC' })
    const list = await render(ui)
    list.querySelector('.ba-migrate').click()
    await tick(); await tick()
    expect(calls.migrate.map((c) => c[1])).toEqual(['HC'])
  })

  it('설정 리그가 이미 끝난 리그면 무시하고 자동 판정으로 넘어간다', async () => {
    await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('cancel', undefined, { league: 'New', userLeague: 'Old' })
    const list = await render(ui)
    list.querySelector('.ba-migrate').click()
    await tick(); await tick()
    expect(calls.migrate.map((c) => c[1])).toEqual(['New'])
  })

  it("설정 리그 섹션이 '현재'로 표시된다(보고 있는 페이지가 다른 리그여도)", async () => {
    await addBookmark(baseRec({ league: 'HC' }), '하드코어것')
    await addBookmark(baseRec({ league: 'New', dedupeKey: 'k2' }), '지금리그')
    const { ui } = makeUi('cancel', undefined, { league: 'New', userLeague: 'HC' })
    const list = await render(ui)
    const badge = (l) => list.querySelector(`.ba-league[data-league="${l}"] .ba-league-badge`)?.textContent || null
    expect(badge('HC')).toBe('현재')
    expect(badge('New')).toBeNull()
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
    expect(calls.migrate).toHaveLength(1)
    expect(calls.migrate[0][0].query).toEqual(QUERY) // 레코드째 넘긴다(URL 해시 재사용 → 조건 폴백 순서)
    expect(calls.migrate[0][1]).toBe('New')
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

  it('해시도 조건도 없으면 이관 버튼 대신 저장된 조건을 보여준다', async () => {
    await addBookmark(baseRec({ stats: ['화염 저항 #%'], url: 'https://poe.kakaogames.com/trade2/search/poe2/Old' }), '복구불가')
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

  it('끝난 리그 페이지에서 열어도 이관 대상은 그 죽은 리그가 아니라 최근 검색한 살아있는 리그', async () => {
    // 오래된 북마크 링크로 들어오면 URL(=ui.league)이 이미 끝난 리그다 — 그리로 다시 검색하면 안 된다
    await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    await addHistory(baseRec({ league: 'New', dedupeKey: 'h1', title: '최근검색' }))
    const { ui, calls } = makeUi('migrate', undefined, { league: 'Old' })
    const list = await render(ui)
    list.querySelector('.ba-migrate').click()
    await tick(); await tick()
    expect(calls.migrate.map((c) => c[1])).toEqual(['New'])
  })

  it('끝난 리그 페이지 + 참고할 최근 검색도 없으면 요청하지 않고 안내한다', async () => {
    const b = await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('migrate', undefined, { league: 'Old' })
    const list = await render(ui)
    list.querySelector('.ba-migrate').click()
    await tick(); await tick()
    expect(calls.migrate).toHaveLength(0)
    expect(calls.toast.some((t) => t.includes('지금 리그를 알 수 없어요'))).toBe(true)
    expect((await listByKind('bookmark', 'poe2')).find((x) => x.id === b.id).league).toBe('Old')
  })

  it('Ctrl 클릭(새 탭)은 제안 없이 원본을 연다', async () => {
    await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('migrate')
    const list = await render(ui)
    // 새 탭은 서비스 워커가 연다(window.open 은 대화상자 뒤 경로에서 팝업 차단에 걸린다)
    const sent = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({ ok: true })
    list.querySelector('.ba-open').dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }))
    await tick(); await tick()
    expect(calls.conflict).toHaveLength(0)
    expect(sent).toHaveBeenCalledWith({ type: 'ba-open-tab', url: baseRec({}).url })
    sent.mockRestore()
  })
})

describe('리그 이관 — ⋯ 액션과 실패 처리', () => {
  it('⋯ 액션 클릭도 같은 이관을 수행한다', async () => {
    const b = await addBookmark(baseRec({ query: QUERY }), '내 북마크')
    const { ui, calls } = makeUi('cancel')
    const list = await render(ui)
    list.querySelector('.ba-migrate').click()
    await tick(); await tick()
    expect(calls.migrate.map((c) => c[1])).toEqual(['New'])
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
