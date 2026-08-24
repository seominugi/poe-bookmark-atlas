// @vitest-environment jsdom
// 폭 밴드가 기대는 **마크업 구조** 회귀 방지.
//
// jsdom 은 레이아웃을 계산하지 않으므로 "정말 한 줄인가"는 여기서 못 잰다(그건 하네스 실측이 정본이고
// 경계 숫자는 src/lib/panelWidth.js 주석에 남겨 뒀다). 대신 **CSS 가 붙잡을 후크가 사라지지 않았는지**를
// 지킨다 — 밴드 규칙은 전부 특정 구조를 전제하고 있어서, 그 구조가 조용히 바뀌면 넓혀도 아무 일이 없어진다.
//
// 이 테스트가 깨지면 panel.css 의 '폭 밴드' 블록도 같이 고쳐야 한다는 신호다.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { addBookmark } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

const ui = { game: 'poe2', league: 'A', getLeagueMap: () => ({ A: 'Alpha 리그' }) }
// ⚠ game 이 없으면 listByKind('bookmark', 'poe2') 가 걸러내 카드가 아예 안 그려진다.
const rec = (over) => ({
  game: 'poe2', title: '반지', stats: [], statGroups: [], otherFilters: [], priceFilter: null,
  url: 'https://poe.kakaogames.com/trade2/search/poe2/A/h1', league: 'A', dedupeKey: 'k1', ...over,
})

async function render() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  await renderList(el, document.body, ui)
  return el
}

describe('m 밴드 — 목록 머리 합류가 기대는 구조', () => {
  it('섹션 머리와 검색이 .ba-list-head 한 부모 아래 형제로 있다', async () => {
    await addBookmark(rec({}), '반지')
    const el = await render()
    const head = el.querySelector('.ba-list-head')
    expect(head).not.toBeNull()
    // display:contents 로 .ba-sec-head 를 풀어 제목·검색·정렬을 같은 줄에 세운다.
    // 셋 다 이 부모 안에 있어야 order 로 순서를 섞을 수 있다.
    expect(head.querySelector(':scope > .ba-sec-head')).not.toBeNull()
    expect(head.querySelector(':scope > .ba-search-row')).not.toBeNull()
    expect(head.querySelector('.ba-sec-head > .ba-sec-title')).not.toBeNull()
    expect(head.querySelector('.ba-sec-head > .ba-sec-actions')).not.toBeNull()
  })

  it('히스토리 섹션 머리는 감싸지 않는다 — 거긴 합칠 검색이 없다', async () => {
    await addBookmark(rec({}), '반지')
    const el = await render()
    const hist = el.querySelector('.ba-sec-head.ba-sec-hist')
    if (hist) expect(hist.closest('.ba-list-head')).toBeNull()
  })

  // .ba-list-head 가 m 밴드에서 가로 flex 줄이 되므로, 안내문이 그 안에 들어가면
  // 검색칸 옆에 끼어 제목·정렬을 밀어낸다.
  it('검색 결과 없음 안내는 .ba-list-head 바깥에 붙는다', async () => {
    await addBookmark(rec({}), '반지')
    const el = await render()
    const inp = el.querySelector('.ba-search-input[data-scope="bm"]')
    inp.value = '있을리없는검색어zzz'
    inp.dispatchEvent(new Event('input', { bubbles: true }))
    const noRes = el.querySelector('.ba-no-result')
    expect(noRes).not.toBeNull()
    expect(noRes.closest('.ba-list-head')).toBeNull()
  })
})

// 2026-08-23: 수치 요약을 모든 폭에서 접었다. 칩에는 '조건 N개' 만 남고 전체는 호버 툴팁이 갖는다.
// 이 계약이 깨지면(요약 span 이 되살아나면) 카드 높이가 다시 카드마다 들쭉날쭉해진다.
describe('조건 칩 — 모든 폭에서 개수만', () => {
  it('요약 텍스트는 렌더하지 않고, 개수와 툴팁만 남는다', async () => {
    await addBookmark(rec({}), '반지')
    const chip = (await render()).querySelector('.ba-cond--summary')
    expect(chip.querySelector('.ba-cond-n').textContent).toMatch(/^조건 \d+개$/)
    expect(chip.querySelector('.ba-cond-tx')).toBeNull()
    expect(chip.getAttribute('data-tip')).toBeTruthy() // 조건 전체가 닿는 유일한 경로
  })
})

describe('xl 밴드 — 카드 액션바', () => {
  it('북마크 카드에 라이브·복사·갱신 셋이, 팝오버와 같은 클래스로 붙는다', async () => {
    await addBookmark(rec({}), '반지')
    const el = await render()
    const bar = el.querySelector('.ba-row[data-kind="bookmark"] .ba-actbar')
    expect(bar).not.toBeNull()
    // 같은 클래스여야 bindAll 의 기존 핸들러가 그대로 잡는다 — 핸들러를 새로 쓰지 않는 게 요점이다.
    expect(bar.querySelector('.ba-live')).not.toBeNull()
    expect(bar.querySelector('.ba-copy')).not.toBeNull()
    expect(bar.querySelector('.ba-over')).not.toBeNull()
    expect(bar.querySelectorAll('.ba-act-ic').length).toBe(3)
  })

  // 오폭이 곧 데이터 손실이다. 팝오버 안에만 있어야 한다.
  it('삭제는 절대 꺼내지 않는다', async () => {
    await addBookmark(rec({}), '반지')
    const el = await render()
    const bar = el.querySelector('.ba-actbar')
    expect(bar.querySelector('.ba-del')).toBeNull()
    expect(bar.querySelector('.ba-rename')).toBeNull()
    expect(bar.querySelector('.ba-move')).toBeNull()
  })

  // 히스토리 카드는 **행 전체 클릭으로 열린다**. 여기 액션바를 붙이려면 그 클릭 가드에
  // .ba-actbar 를 먼저 추가해야 한다(안 그러면 버튼을 눌러도 카드가 같이 열린다).
  it('히스토리 카드에는 붙이지 않는다', async () => {
    await addBookmark(rec({}), '반지')
    const el = await render()
    el.querySelectorAll('.ba-row[data-kind="history"]').forEach((r) => {
      expect(r.querySelector('.ba-actbar')).toBeNull()
    })
  })

  // 오른쪽 정렬은 CSS(margin-left:auto)가 하지만, 그게 통하려면 액션바가 ⋯ **앞**에 있어야 한다.
  // 순서가 뒤집히면 버튼이 카드 맨 끝으로 밀려 ⋯ 와 자리가 바뀐다.
  it('액션바는 ⋯ 바로 앞에 온다 — 오른쪽 끝에 둘이 붙어 있어야 한다', async () => {
    await addBookmark(rec({}), '반지')
    const el = await render()
    const meta = el.querySelector('.ba-row[data-kind="bookmark"] .ba-meta-row')
    const kids = [...meta.children].map((c) => c.className.split(' ')[0])
    expect(kids.slice(-2)).toEqual(['ba-actbar', 'ba-more'])
  })

  it('아이콘이 서로 다르다 — 라벨 없이 아이콘만 남는 행이라 같은 그림 둘은 구분이 안 된다', async () => {
    await addBookmark(rec({}), '반지')
    const el = await render()
    const bar = el.querySelector('.ba-actbar')
    const paths = [...bar.querySelectorAll('.ba-act-ic')].map((b) => b.innerHTML)
    expect(new Set(paths).size).toBe(3)
  })
})

// ── 헤더 후원 문구 — 밴드 게이트가 사라지면 **조용히** 제목이 죽는다 ──
// .ba-brand 는 nowrap flex 이고 .ba-brand-tx 는 min-width:0 이라, 헤더가 넘치면 줄바꿈이 아니라
// **제목이 0px 로 찌그러진다.** 화면에서 제목만 없어지고 콘솔에도 아무 흔적이 없다.
// 실측(2026-08-25 하네스): 문구를 항상 켜면 384px 제목 0px · 500px 66px · 600px 부터 정상.
// jsdom 은 레이아웃을 안 재므로 폭은 못 지킨다 — 대신 **게이트가 붙어 있는지**를 지킨다.
describe('헤더 후원 문구 — 좁은 폭에서 숨는 게이트', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

  it('마크업에 문구 후크(.ba-donate-tx)가 있다', () => {
    expect(read('../src/content/panel/panel.js')).toContain('ba-donate-tx')
  })

  it('기본값은 숨김이다 — s·m 밴드에서 제목을 밀어내지 않게', () => {
    const css = read('../src/content/panel/panel.css')
    expect(css).toMatch(/\.ba-donate-tx\s*\{[^}]*display:\s*none/)
  })

  it('l·xl 밴드에서만 켜진다 — m 이하를 켜면 제목이 잘린다(실측)', () => {
    const css = read('../src/content/panel/panel.css')
    const on = css.match(/\.ba-root\[data-band="(\w+)"\] \.ba-donate-tx/g) || []
    const bands = on.map((s) => s.match(/"(\w+)"/)[1]).sort()
    expect(bands).toEqual(['l', 'xl'])
  })

  it('단축키 칩은 오른쪽으로 밀리지 않는다 — 제목 바로 뒤 좌측 정렬', () => {
    const css = read('../src/content/panel/panel.css')
    const rule = css.match(/\.ba-kbd-wrap\s*\{[^}]*\}/)[0]
    expect(rule).not.toContain('margin-left: auto')
  })
})
