// @vitest-environment jsdom
// affix-picker.js — 그룹마다 「속성 목록」 버튼, 누르면 접두어·접미어 팝오버에서 골라 넣는다.
// 그룹 마크업은 2026-09-15 라이브 거래소에서 떠온 구조를 줄인 것이다(.filter-group > header/body, 추가 줄은 .filter.filter-padded).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  attachAffixButtons, openAffixPopover, closeAffixPopover, groupToken, groupLabel, groupRowTitles,
  AFFIX_BTN_CLASS, AFFIX_POP_CLASS,
} from '../src/content/affix-picker.js'

function statGroup(title, rows) {
  const g = document.createElement('div')
  g.className = 'filter-group expanded'
  g.innerHTML = `
    <div class="filter-group-header"><div class="filter"><span class="filter-body"><div class="filter-title filter-title-clickable">${title}</div></span></div></div>
    <div class="filter-group-body">
      ${rows.map((r) => `<div class="filter full-span"><span class="filter-body"><div class="filter-title"><i class="mutate-type">비고정</i><span>${r}</span></div><input class="form-control minmax" placeholder="최소"><input class="form-control minmax" placeholder="최대"></span></div>`).join('')}
      <div class="filter filter-padded"><span class="filter-body"><div class="multiselect filter-select"><div class="multiselect__tags"><input class="multiselect__input" placeholder="+ 능력치 필터 추가"></div></div></span></div>
    </div>`
  return g
}

function typeGroup() {
  const g = document.createElement('div')
  g.className = 'filter-group'
  g.innerHTML = '<div class="filter-group-body"><div class="filter"><div class="multiselect"><input class="multiselect__input" placeholder="모두"></div></div></div>'
  return g
}

const list = {
  status: 'ok',
  prefix: [
    { id: 'stat.life', text: '생명력 최대치 #', tiers: 9, topLevel: 60, have: true },
    { id: 'stat.mana', text: '마나 최대치 #', tiers: 9, topLevel: 60, have: false },
    { id: 'stat.fire_add', text: '공격 시 화염 피해 #~# 추가', tiers: 0, topLevel: 75, have: false },
  ],
  suffix: [
    { id: 'stat.fire_res', text: '화염 저항 #%', tiers: 8, topLevel: 82, have: false },
    { id: 'stat.cold_res', text: '냉기 저항 #%', tiers: 8, topLevel: 82, have: false },
  ],
}

beforeEach(() => {
  closeAffixPopover()
  document.body.innerHTML = ''
})

describe('attachAffixButtons', () => {
  it('능력치 그룹마다 한 번만 붙고, 유형 필터 드롭다운에는 안 붙는다', () => {
    document.body.append(typeGroup(), statGroup('숫자', ['생명력 최대치 #']), statGroup('숫자', ['화염 저항 #%']))
    const onOpen = vi.fn()
    expect(attachAffixButtons(document, { onOpen })).toBe(2)
    attachAffixButtons(document, { onOpen })
    expect(document.querySelectorAll('.' + AFFIX_BTN_CLASS)).toHaveLength(2)
    expect(document.querySelector('.filter-group:not(.expanded) .' + AFFIX_BTN_CLASS)).toBeNull()
  })

  it('누르면 그 그룹과 버튼으로 onOpen 을 부르고, 거래소 드롭다운으로 이벤트가 새지 않는다', () => {
    const g = statGroup('숫자', [])
    document.body.appendChild(g)
    const onOpen = vi.fn()
    attachAffixButtons(document, { onOpen })
    const btn = g.querySelector('.' + AFFIX_BTN_CLASS)
    let leaked = false
    g.addEventListener('mousedown', () => { leaked = true })
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    btn.click()
    expect(leaked).toBe(false)
    expect(onOpen).toHaveBeenCalledWith(g, btn)
  })
})

describe('그룹 표식', () => {
  it('token 은 한 번 정해지면 그대로다 — MAIN world 가 이 값으로 그룹을 찾는다', () => {
    const g = statGroup('숫자', [])
    const t = groupToken(g)
    expect(t).toMatch(/^[a-z0-9]{6,40}$/)
    expect(groupToken(g)).toBe(t)
    expect(g.dataset.baGroupToken).toBe(t)
  })

  it('이름은 능력치 그룹끼리의 순서 + 헤더 제목', () => {
    const a = statGroup('숫자', [])
    const b = statGroup('합', [])
    document.body.append(typeGroup(), a, b)
    expect(groupLabel(document, a)).toBe('그룹 1 · 숫자')
    expect(groupLabel(document, b)).toBe('그룹 2 · 합')
  })

  it('제목 안의 도움말 문단은 이름에 섞이지 않는다 (라이브 마크업)', () => {
    const g = statGroup('숫자', [])
    g.querySelector('.filter-group-header .filter-title').insertAdjacentHTML('beforeend', '<div class="filter-tip">\'최소\' 및 \'최대\' 조건을 충족하는 각 능력치를 계산합니다.</div>')
    document.body.appendChild(g)
    expect(groupLabel(document, g)).toBe('그룹 1 · 숫자')
  })

  it('행 이름 요소를 돌려준다 — 헤더 제목은 빼고', () => {
    const g = statGroup('숫자', ['생명력 최대치 #', '화염 저항 #%'])
    expect(groupRowTitles(g).map((t) => t.querySelector('span').textContent)).toEqual(['생명력 최대치 #', '화염 저항 #%'])
  })
})

describe('openAffixPopover', () => {
  let anchor
  beforeEach(() => {
    const g = statGroup('숫자', [])
    document.body.appendChild(g)
    attachAffixButtons(document, { onOpen: () => {} })
    anchor = g.querySelector('.' + AFFIX_BTN_CLASS)
  })
  const open = (over = {}) => openAffixPopover({ anchor, title: '그룹 1 · 숫자', subtitle: '장갑', list, onAdd: vi.fn(), ...over })

  it('접두어·접미어 두 열에 개수와 함께 그린다', () => {
    const { el } = open()
    const titles = [...el.querySelectorAll('.ba-affix-col-title')].map((x) => x.textContent)
    expect(titles).toEqual(['접두어 3', '접미어 2'])
    expect(el.querySelectorAll('.ba-affix-row')).toHaveLength(5)
  })

  it('이미 있는 속성은 체크할 수 없고 「추가됨」 이 보인다', () => {
    const { el } = open()
    const row = el.querySelectorAll('.ba-affix-row')[0]
    expect(row.querySelector('input').disabled).toBe(true)
    expect(row.textContent).toContain('추가됨')
  })

  it('여러 개를 체크하고 넣으면 목록 순서로 onAdd 에 넘기고 닫힌다', async () => {
    const onAdd = vi.fn(async () => {})
    const { el } = open({ onAdd })
    const boxes = el.querySelectorAll('.ba-affix-check')
    const add = el.querySelector('.ba-affix-add')
    expect(add.disabled).toBe(true)
    // 체크 순서를 일부러 뒤집는다 — 넣는 순서는 목록 순서다
    for (const i of [4, 1, 3]) { boxes[i].checked = true; boxes[i].dispatchEvent(new Event('change')) }
    expect(add.disabled).toBe(false)
    expect(add.textContent).toBe('선택한 3개 넣기')
    add.click()
    await Promise.resolve(); await Promise.resolve()
    expect(onAdd).toHaveBeenCalledWith(['stat.mana', 'stat.fire_res', 'stat.cold_res'])
    expect(document.querySelector('.' + AFFIX_POP_CLASS)).toBeNull()
  })

  it('검색은 행을 숨길 뿐 체크 상태를 지운다거나 하지 않는다', () => {
    const { el } = open()
    const boxes = el.querySelectorAll('.ba-affix-check')
    boxes[1].checked = true; boxes[1].dispatchEvent(new Event('change'))
    const search = el.querySelector('.ba-affix-search')
    search.value = '저항'; search.dispatchEvent(new Event('input'))
    const visible = [...el.querySelectorAll('.ba-affix-row')].filter((r) => !r.hidden).map((r) => r.querySelector('.ba-affix-name').textContent)
    expect(visible).toEqual(['화염 저항 #%', '냉기 저항 #%'])
    expect(boxes[1].checked).toBe(true)
    expect(el.querySelector('.ba-affix-add').textContent).toBe('선택한 1개 넣기')
  })

  it('선택 해제로 모두 푼다', () => {
    const { el } = open()
    const boxes = el.querySelectorAll('.ba-affix-check')
    boxes[3].checked = true; boxes[3].dispatchEvent(new Event('change'))
    el.querySelector('.ba-affix-clear').click()
    expect(boxes[3].checked).toBe(false)
    expect(el.querySelector('.ba-affix-add').disabled).toBe(true)
  })

  it('Esc · 바깥 클릭으로 닫히고, 안쪽 클릭으로는 안 닫힌다', () => {
    let h = open()
    h.el.querySelector('.ba-affix-name').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
    expect(document.querySelector('.' + AFFIX_POP_CLASS)).not.toBeNull()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
    expect(document.querySelector('.' + AFFIX_POP_CLASS)).toBeNull()
    h = open()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector('.' + AFFIX_POP_CLASS)).toBeNull()
  })

  it('다시 열면 앞의 것을 닫는다 — 팝오버는 하나뿐', () => {
    open(); open()
    expect(document.querySelectorAll('.' + AFFIX_POP_CLASS)).toHaveLength(1)
  })

  it('유형을 모르면 목록 대신 안내하고 넣기는 막힌다', () => {
    const { el } = open({ list: { status: 'no-class', prefix: [], suffix: [] } })
    expect(el.textContent).toContain('아이템 유형을 먼저 고르면')
    expect(el.querySelector('.ba-affix-add').disabled).toBe(true)
    expect(el.querySelector('.ba-affix-search').disabled).toBe(true)
  })
})
