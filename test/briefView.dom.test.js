// @vitest-environment jsdom
// 간략 보기 — 카드를 한 줄로 '접는' 모드가 기대는 마크업 계약.
// 높이(83→47px)는 레이아웃 엔진이 필요해 jsdom 으로 못 잰다 — 하네스 실측으로 검증했다.
// 여기서 지키는 건 CSS 가 접을 수 있게 **글자에 손잡이가 달려 있는가**다. 그게 없으면
// 규칙이 조용히 아무것도 안 하고, 화면에서 눈치채기 전까지 통과해 버린다.
import { describe, it, expect, beforeEach } from 'vitest'
import { addBookmark, addHistory } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

const rec = (over) => ({
  game: 'poe2', title: '반지', stats: ['화염 저항 #%'], statGroups: [], otherFilters: [{ label: '아이템 레벨', value: '80' }],
  priceFilter: null, url: 'https://poe.kakaogames.com/trade2/search/poe2/New/h1', league: 'New', dedupeKey: 'k1', ...over,
})
const ui = { game: 'poe2', league: 'New', getLeagueMap: () => ({ New: '현재 리그' }), toast: () => {} }

async function render() {
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}

describe('간략 보기가 기대는 마크업', () => {
  it('북마크 조건 칩 — 글자가 접기 가능한 요소 안에 있다', async () => {
    await addBookmark(rec({}), '반지')
    const chip = (await render()).querySelector('.ba-cond--summary')
    expect(chip.querySelector('.ba-cond-n')).not.toBeNull() // '조건 N개'
    expect(chip.querySelector('.ba-cond-tx')).not.toBeNull() // 요약 텍스트
  })

  it('히스토리 조건 칩도 같은 손잡이를 갖는다 — 없으면 히스토리만 안 접혀 두 배로 남는다', async () => {
    await addHistory(rec({ dedupeKey: 'h1' }))
    const chip = (await render()).querySelector('.ba-row[data-kind="history"] .ba-cond')
    expect(chip).not.toBeNull()
    expect(chip.querySelector('.ba-cond-n')?.textContent).toMatch(/조건 \d+개/)
  })

  it('접어도 카드 액션(⋯)과 조건 툴팁은 남는다 — 숨기는 게 아니라 접는 것이다', async () => {
    await addBookmark(rec({}), '반지')
    const row = (await render()).querySelector('.ba-row[data-kind="bookmark"]')
    const meta = row.querySelector('.ba-meta-row')
    expect(meta.querySelector('.ba-more')).not.toBeNull()
    // 툴팁에는 리그와 조건 상세가 그대로 들어 있다 — 글자를 접어도 정보는 여기 남는다
    const tip = meta.querySelector('.ba-cond--summary').getAttribute('data-tip')
    expect(tip).toContain('현재 리그')
    expect(tip).toContain('아이템 레벨')
    expect(tip).toContain('화염 저항')
  })

  // 가격을 조건 칩 안으로 넣는 건 순수 CSS 로는 못 한다(부모가 다르다) — 마크업이 양쪽에 있어야
  // 재렌더 없이 토글된다. 이 span 이 빠지면 간략 보기에서 **가격이 통째로 사라진다**.
  it('간략용 가격이 조건 칩 안에 함께 렌더된다 (평소엔 CSS 로 숨김)', async () => {
    await addBookmark(rec({ snapshot: { valueDiv: 2.3, capturedAt: Date.now(), sampleN: 12 } }), '반지')
    const row = (await render()).querySelector('.ba-row[data-kind="bookmark"]')
    expect(row.querySelector('.ba-price-pill')).not.toBeNull() // 기본 보기용
    const inChip = row.querySelector('.ba-cond--summary .ba-cond-price') // 간략 보기용
    expect(inChip).not.toBeNull()
    // 가격 위에 호버하면 시세 설명이 뜨도록 자기 툴팁을 갖는다(칩의 조건 툴팁을 덮지 않는다)
    expect(inChip.getAttribute('data-tip')).toContain('검색 시점 시세')
  })

  it('조건이 없는 히스토리는 가격이 시각 칩에 얹힌다 — 갈 곳이 항상 있어야 한다', async () => {
    await addHistory(rec({ dedupeKey: 'h2', stats: [], otherFilters: [], snapshot: { valueDiv: 5, capturedAt: Date.now() } }))
    const row = (await render()).querySelector('.ba-row[data-kind="history"]')
    expect(row.querySelector('.ba-cond')).toBeNull() // 조건 칩 자체가 없다
    expect(row.querySelector('.ba-hist-when .ba-cond-price')).not.toBeNull()
  })

  it('주의 배지는 접는 대상이 아니다 — 문제 있는 카드는 눈에 띄어야 한다', async () => {
    await addBookmark(rec({ url: 'https://evil.example.com/trade2/search/poe2/New/x', dedupeKey: 'k9' }), '차단링크')
    const row = (await render()).querySelector('.ba-row[data-kind="bookmark"]')
    const attn = row.querySelector('.ba-attn')
    expect(attn).not.toBeNull()
    // 배지 글자에는 .ba-cond-n/.ba-cond-tx 같은 접기 손잡이를 달지 않는다
    expect(attn.querySelector('.ba-cond-n, .ba-cond-tx')).toBeNull()
    expect(attn.textContent).toContain('차단된 링크')
  })
})
