// @vitest-environment jsdom
// 히스토리 통합 — 리그별로 나뉘던 히스토리 섹션을 하나로 합친다(북마크는 기존대로 리그별 유지).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { addBookmark, addHistory, addFolder } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

const baseRec = (over) => ({
  game: 'poe2', title: 'T', itemType: '반지', stats: [], statGroups: [], otherFilters: [], priceFilter: null,
  url: 'https://poe.kakaogames.com/trade2/x', ...over,
})
const leagueMap = { A: 'Alpha 리그', B: 'Beta 리그' }
const ui = { game: 'poe2', league: 'A', getLeagueMap: () => leagueMap }

async function render() {
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}

describe('renderList — 히스토리 통합(모든 리그), 북마크는 리그별 유지', () => {
  it('서로 다른 리그의 히스토리가 단일 섹션에 함께 나온다', async () => {
    await addHistory(baseRec({ league: 'A', title: 'A리그검색', dedupeKey: 'ka', updatedAt: 1000 }))
    await addHistory(baseRec({ league: 'B', title: 'B리그검색', dedupeKey: 'kb', updatedAt: 2000 }))
    const list = await render()
    const secs = list.querySelectorAll('.ba-sec-hist')
    expect(secs.length).toBe(1) // 리그별로 쪼개지지 않고 단일 섹션
    expect(secs[0].querySelector('.ba-sec-count').textContent).toBe('2')
    const rows = list.querySelectorAll('.ba-row[data-kind="history"]')
    expect(rows.length).toBe(2)
  })

  it('시간순 정렬 유지(최신이 위) — 리그 순서와 무관', async () => {
    // addHistory는 updatedAt을 항상 Date.now()로 덮어써 넣는 순서가 곧 시간순이 되므로, Date.now을 모킹해 원하는 시간대로 강제
    const spy = vi.spyOn(Date, 'now')
    spy.mockReturnValueOnce(1000); await addHistory(baseRec({ league: 'A', title: '오래된A', dedupeKey: 'k1' }))
    spy.mockReturnValueOnce(3000); await addHistory(baseRec({ league: 'B', title: '최신B', dedupeKey: 'k2' }))
    spy.mockReturnValueOnce(2000); await addHistory(baseRec({ league: 'A', title: '중간A', dedupeKey: 'k3' }))
    spy.mockRestore()
    const list = await render()
    const titles = [...list.querySelectorAll('.ba-row[data-kind="history"] b')].map((b) => b.textContent)
    expect(titles).toEqual(['최신B', '중간A', '오래된A'])
  })

  it('날짜 칩엔 연월일시분 전체만(리그 텍스트 없음 — 말줄임 문제로 뺐음)', async () => {
    const spy = vi.spyOn(Date, 'now'); spy.mockReturnValue(new Date('2026-07-03T06:41:00').getTime())
    await addHistory(baseRec({ league: 'B', title: 'B검색', dedupeKey: 'kx', otherFilters: [] }))
    spy.mockRestore()
    const list = await render()
    const row = list.querySelector('.ba-row[data-kind="history"]')
    const chip = row.querySelector('.ba-hist-when')
    expect(chip.textContent.trim()).toBe('26/07/03 06:41')
    expect(chip.textContent).not.toContain('Beta')
  })

  it('조건 있으면: 리그가 조건 칩 툴팁 맨 위에 강조 마커로(《...》) 붙는다', async () => {
    await addHistory(baseRec({ league: 'B', title: 'B검색', dedupeKey: 'ky', otherFilters: [{ key: 'ilvl', label: '아이템 레벨', value: '≥80' }] }))
    const list = await render()
    const row = list.querySelector('.ba-row[data-kind="history"]')
    const condTip = row.querySelector('.ba-cond').getAttribute('data-tip')
    expect(condTip.startsWith('[리그] 《Beta 리그》')).toBe(true)
    expect(condTip).toContain('아이템 레벨') // 기존 필터 내용도 그대로 뒤에
    // 조건이 있으면 날짜 칩엔 툴팁을 안 얹음(중복 방지 — 조건 칩에 이미 있음)
    expect(row.querySelector('.ba-hist-when').hasAttribute('data-tip')).toBe(false)
  })

  it('조건 없으면: 날짜 칩에 리그 툴팁이 붙는다(호버할 곳이 그것뿐이므로)', async () => {
    await addHistory(baseRec({ league: 'B', title: 'B검색', dedupeKey: 'kz', otherFilters: [] }))
    const list = await render()
    const row = list.querySelector('.ba-row[data-kind="history"]')
    expect(row.querySelector('.ba-cond')).toBeFalsy() // 조건 칩 자체가 없음
    const whenTip = row.querySelector('.ba-hist-when').getAttribute('data-tip')
    expect(whenTip).toBe('[리그] 《Beta 리그》')
  })

  it('카드 액션(북마크로 저장·링크 복사·삭제)이 ⋯ 팝오버 뒤에 숨어 있다(북마크 카드와 동일 패턴)', async () => {
    await addHistory(baseRec({ league: 'A', title: 'x', dedupeKey: 'kpop' }))
    const list = await render()
    const row = list.querySelector('.ba-row[data-kind="history"]')
    const more = row.querySelector('.ba-more')
    const pop = row.querySelector('.ba-actions-pop')
    expect(more).toBeTruthy()
    expect(pop).toBeTruthy()
    expect(pop.hidden).toBe(true) // 기본 숨김
    // 팝오버 안에 기존 클래스 그대로(star/copy/hist-del) — 기존 bindAll 핸들러가 위치 무관하게 그대로 작동
    expect(pop.querySelector('.ba-star')).toBeTruthy()
    expect(pop.querySelector('.ba-copy')).toBeTruthy()
    expect(pop.querySelector('.ba-hist-del')).toBeTruthy()
    // 카드 표면(팝오버 밖)에는 더 이상 액션 아이콘이 직접 안 보임
    const meta = row.querySelector('.ba-meta')
    expect(meta.querySelector('.ba-star')).toBeFalsy()
    more.click()
    expect(pop.hidden).toBe(false) // 토글 열림
    more.click()
    expect(pop.hidden).toBe(true) // 토글 닫힘
  })

  it('⋯ 클릭은 카드 전체 클릭(URL 열기)으로 새지 않는다', async () => {
    await addHistory(baseRec({ league: 'A', title: 'x', dedupeKey: 'knav' }))
    const list = await render()
    const row = list.querySelector('.ba-row[data-kind="history"]')
    let opened = false
    row.addEventListener('click', () => { if (!row.querySelector('.ba-actions-pop').hidden || row.dataset.__clicked) opened = true })
    row.querySelector('.ba-more').click()
    expect(row.querySelector('.ba-actions-pop').hidden).toBe(false) // 팝오버는 열렸지만
    expect(opened).toBe(false) // 카드 열기(재검색) 핸들러가 별도로 발화하진 않음
  })

  it('북마크도 리그 통합 — 리그가 갈려도 폴더 그룹은 한 벌만 그린다', async () => {
    await addBookmark(baseRec({ league: 'A', title: '북A', dedupeKey: 'bka' }), '북A')
    await addBookmark(baseRec({ league: 'B', title: '북B', dedupeKey: 'bkb' }), '북B')
    const list = await render()
    expect(list.querySelectorAll('.ba-folder').length).toBe(1) // 미분류 하나뿐
    expect(list.querySelectorAll('.ba-row[data-kind="bookmark"]').length).toBe(2) // 둘 다 그 안에
  })

  it('"전체 삭제" 버튼은 리그 무관하게 항상 하나만 노출', async () => {
    await addHistory(baseRec({ league: 'A', title: 'x', dedupeKey: 'kz' }))
    const list = await render()
    expect(list.querySelectorAll('.ba-clear-hist').length).toBe(1)
  })

  it('가격 스냅샷 없는 히스토리 — 빈 가격 칩을 아예 렌더하지 않는다(빈 필 방지)', async () => {
    await addHistory(baseRec({ league: 'A', title: '가격없음', dedupeKey: 'knoprice' })) // snapshot 미지정
    const list = await render()
    const row = [...list.querySelectorAll('.ba-row[data-kind="history"]')].find((r) => r.querySelector('b').textContent === '가격없음')
    expect(row.querySelector('.ba-hist-price')).toBeFalsy()
  })

  it('가격 스냅샷 있는 히스토리 — 가격 칩 정상 렌더', async () => {
    await addHistory(baseRec({ league: 'A', title: '가격있음', dedupeKey: 'kprice', snapshot: { valueDiv: 5, value: 5, unit: 'divine', sampleN: 3 } }))
    const list = await render()
    const row = [...list.querySelectorAll('.ba-row[data-kind="history"]')].find((r) => r.querySelector('b').textContent === '가격있음')
    expect(row.querySelector('.ba-hist-price')).toBeTruthy()
  })

  it('가격 스냅샷 없는 북마크도 동일 — 빈 가격 칩 렌더 안 함(북마크에도 같은 버그가 있었음)', async () => {
    await addBookmark(baseRec({ league: 'A', title: '북마크가격없음', dedupeKey: 'bknoprice' }), '북마크가격없음')
    const list = await render()
    const row = [...list.querySelectorAll('.ba-row[data-kind="bookmark"]')].find((r) => r.querySelector('b')?.textContent === '북마크가격없음')
    expect(row.querySelector('.ba-price-pill')).toBeFalsy()
  })
})

describe('빈 폴더 표시 (사용자 제보 — 폴더를 추가해도 안 보인다)', () => {
  // 새로 만든 폴더는 당연히 비어 있다. 빈 폴더를 숨기면 '폴더 추가'가 아무 일도 안 한 것처럼 보이고,
  // 드래그해 넣을 대상 자체가 없어 폴더 기능을 시작할 수가 없다.
  it('현재 리그 섹션에는 빈 폴더도 보인다', async () => {
    await addBookmark(baseRec({ league: 'A', title: '북마크' }), '북마크')
    await addFolder('새 폴더', 'poe2')
    const list = await render()
    const names = [...list.querySelectorAll('.ba-folder-name')].map((e) => e.textContent)
    expect(names).toContain('새 폴더')
  })

  it('빈 폴더에도 드롭 타깃(본문)이 렌더된다', async () => {
    await addBookmark(baseRec({ league: 'A' }), '북마크')
    const f = await addFolder('빈폴더', 'poe2')
    const list = await render()
    const body = list.querySelector(`.ba-folder-body[data-folder="${f.id}"]`)
    expect(body).toBeTruthy()
    expect(body.textContent).toContain('여기로 드래그')
  })

  it('다른 리그 북마크가 있어도 폴더는 한 벌 — 이름도 삭제 버튼도 폴더당 하나 (제보 사고 회귀)', async () => {
    await addBookmark(baseRec({ league: 'B', title: '다른리그' }), '다른리그') // 살아있지만 현재(A)가 아닌 리그
    const f = await addFolder('새 폴더', 'poe2')
    const list = await render()
    const names = [...list.querySelectorAll('.ba-folder-name')].map((e) => e.textContent)
    expect(names.filter((n) => n === '새 폴더')).toHaveLength(1) // 빈 폴더는 보이되 딱 한 번만
    expect(list.querySelectorAll(`.ba-folder-del[data-id="${f.id}"]`)).toHaveLength(1)
  })
})

describe('renderList — 변형(discriminator) 아이템 이름', () => {
  it('정규화 이전에 저장된 객체 name/title도 "[object Object]" 대신 아이템명으로 렌더', async () => {
    await addHistory(baseRec({
      league: 'A', dedupeKey: 'kobj',
      name: { discriminator: 'warlord', option: '해안 교두보' },
      title: { discriminator: 'warlord', option: '해안 교두보' },
    }))
    const list = await render()
    const row = list.querySelector('.ba-row[data-kind="history"]')
    expect(row.querySelector('b').textContent).toBe('해안 교두보')
    expect(row.outerHTML).not.toContain('[object Object]')
  })
})
