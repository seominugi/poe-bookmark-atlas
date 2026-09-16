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

const res = (t, l, min, max) => ({ t, l, min, max, range: `${min}~${max}` })
const threeTiers = (a, b, c) => [res(1, 82, a, a + 4), res(2, 71, b, b + 4), res(3, 60, c, c + 4)]
const multi = (over) => ({ tiers: 8, topLevel: 82, have: false, single: false, fill: 'min', ...over })
const list = {
  status: 'ok',
  prefix: [
    multi({ id: 'stat.life', text: '생명력 최대치 #', have: true, choices: threeTiers(120, 100, 85) }),
    multi({ id: 'stat.mana', text: '마나 최대치 #', choices: threeTiers(160, 140, 120) }),
    multi({ id: 'stat.fire_add', text: '공격 시 화염 피해 #~# 추가', tiers: 0, topLevel: 75, choices: [] }),
  ],
  suffix: [
    multi({ id: 'stat.fire_res', text: '화염 저항 #%', choices: threeTiers(41, 36, 31) }),
    multi({ id: 'stat.cold_res', text: '냉기 저항 #%', choices: threeTiers(41, 36, 31) }),
    { id: 'stat.jewel_acc', text: '일반 정확도 #% 증가', tiers: 1, topLevel: 1, have: false, single: true, fill: 'min', choices: [res(1, 1, 5, 10)] },
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

  it('자리는 「+ 능력치 필터 추가」 줄 바로 아래의 별도 줄 (추가 줄 안·헤더에는 없다)', () => {
    const g = statGroup('숫자', [])
    document.body.appendChild(g)
    attachAffixButtons(document, { onOpen: () => {} })
    const btn = g.querySelector('.' + AFFIX_BTN_CLASS)
    const bar = g.querySelector('.filter-padded')
    expect(btn.parentElement.classList.contains('ba-affix-chiprow')).toBe(true)
    expect(bar.nextElementSibling).toBe(btn.parentElement)
    expect(bar.querySelector('.' + AFFIX_BTN_CLASS)).toBeNull()
    expect(g.querySelector('.filter-group-header .' + AFFIX_BTN_CLASS)).toBeNull()
    expect(btn.textContent).toBe('속성 목록')
  })

  it('거래소가 추가 줄 뒤에 새 행을 끼워 칩 줄이 떨어지면, 옛 줄을 치우고 추가 줄 바로 뒤에 다시 붙인다', () => {
    const g = statGroup('숫자', [])
    document.body.appendChild(g)
    attachAffixButtons(document, { onOpen: () => {} })
    const bar = g.querySelector('.filter-padded')
    bar.after(document.createElement('div')) // 칩 줄과 추가 줄 사이에 무언가 끼었다
    attachAffixButtons(document, { onOpen: () => {} })
    expect(g.querySelectorAll('.ba-affix-chiprow')).toHaveLength(1)
    expect(bar.nextElementSibling.classList.contains('ba-affix-chiprow')).toBe(true)
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

  it('탭에 개수를 달고, 전체 탭에 모두 그린다 — 타락이 없으면 타락 탭은 숨긴다', () => {
    const { el } = open()
    const tabs = [...el.querySelectorAll('.ba-affix-tab')]
    expect(tabs.map((t) => t.textContent)).toEqual(['전체6', '접두어3', '접미어3', '타락0'])
    expect(tabs[3].hidden).toBe(true)
    expect(el.querySelectorAll('.ba-affix-row')).toHaveLength(6)
    tabs[1].click()
    expect(el.querySelectorAll('.ba-affix-row')).toHaveLength(3)
  })

  const corruptedList = [{ id: 'enchant.stat_1', text: '모든 원소 저항 #%', source: 'corrupted', category: 'resist', tiers: 1, topLevel: 1, have: false, single: true, fill: 'min', choices: [res(1, 1, 5, 10)] }]

  it('전체 탭: 타락은 맨 위 붉은 한 줄, 그 아래 기본 띠는 왼쪽 접두어 | 오른쪽 접미어 — 타락은 범위를 최소·최대로 넣는다', async () => {
    const onAdd = vi.fn(async () => {})
    const { el } = open({ onAdd, list: { ...list, corrupted: corruptedList } })
    const body = el.querySelector('.ba-affix-body')
    expect([...body.children].map((c) => c.dataset.pool)).toEqual(['corrupted', 'normal'])
    const strip = body.querySelector('.ba-affix-band[data-pool="corrupted"]')
    expect(strip.querySelector('.ba-affix-band-name').textContent).toBe('타락')
    expect(strip.querySelector('.ba-affix-band-body').hidden).toBe(true) // 타락은 접은 채 시작
    expect(strip.querySelector('.ba-affix-band-toggle').textContent).toBe('펼치기')
    strip.querySelector('.ba-affix-band-head').click()
    expect(strip.querySelector('.ba-affix-band-toggle').textContent).toBe('접기')
    expect(strip.querySelector('.ba-affix-sec-head')).not.toBeNull()
    const normal = body.querySelector('.ba-affix-band[data-pool="normal"]')
    expect(normal.querySelector('.ba-affix-band-name').textContent).toBe('기본')
    expect(normal.querySelector('.ba-affix-band-body').hidden).toBe(false) // 기본은 펼친 채 시작
    const cols = [...normal.querySelectorAll('.ba-affix-sidegrid > .ba-affix-srccol')]
    expect(cols.map((c) => [c.querySelector('.ba-affix-srccol-title').textContent, c.querySelectorAll('.ba-affix-row').length])).toEqual([['접두어3', 3], ['접미어3', 3]])
    const row = strip.querySelector('.ba-affix-row')
    expect(row.textContent).toContain('모든 원소 저항')
    row.querySelector('.ba-affix-check').click()
    el.querySelector('.ba-affix-add').click()
    await Promise.resolve(); await Promise.resolve()
    expect(onAdd.mock.calls[0][0]).toEqual([{ id: 'enchant.stat_1', value: { min: 5, max: 10 }, role: 'here' }])
  })

  it('기본 띠는 펼친 채, 타락 띠는 접은 채 시작하고 누르면 뒤집힌다', () => {
    const { el } = open({ list: { ...list, corrupted: corruptedList } })
    for (const [pool, startHidden] of [['normal', false], ['corrupted', true]]) {
      const band = el.querySelector(`.ba-affix-band[data-pool="${pool}"]`)
      expect(band.querySelector('.ba-affix-band-body').hidden).toBe(startHidden)
      band.querySelector('.ba-affix-band-head').click()
      expect(band.querySelector('.ba-affix-band-body').hidden).toBe(!startHidden)
    }
  })

  it('접두어·접미어 이름은 띠 이름과 다른 칩이다', () => {
    const { el } = open()
    const titles = [...el.querySelectorAll('.ba-affix-band[data-pool="normal"] .ba-affix-srccol-title')]
    expect(titles.map((t) => [t.dataset.side, t.querySelector('.ba-affix-side-chip').textContent])).toEqual([['prefix', '접두어'], ['suffix', '접미어']])
  })

  it('타락 탭은 타락 띠만, 접두어 탭에는 타락이 없다', () => {
    const { el } = open({ list: { ...list, corrupted: corruptedList } })
    const tabs = el.querySelectorAll('.ba-affix-tab')
    const pools = () => [...el.querySelectorAll('.ba-affix-band')].map((b) => b.dataset.pool)
    tabs[3].click()
    expect(pools()).toEqual(['corrupted'])
    tabs[1].click()
    expect(pools()).toEqual(['normal'])
    expect(el.querySelectorAll('.ba-affix-row')).toHaveLength(3)
  })

  describe('에센스·훼손된·합금 띠', () => {
    const ess = (id, text, source, over = {}) => ({ id, key: `essence:${id}`, pool: 'essence', text, source, category: 'resource', tiers: 2, topLevel: 60, have: false, single: false, fill: 'min', choices: [res(1, 60, 90, 104), res(2, 40, 60, 70)], ...over })
    const withPools = {
      ...list,
      essence: { prefix: [ess('stat.mana', '마나 최대치 #', 'prefix')], suffix: [ess('stat.fire_res', '화염 저항 #%', 'suffix', { category: 'resist' })] },
      desecrated: { prefix: [], suffix: [{ id: 'desecrated.x', key: 'desecrated:desecrated.x', pool: 'desecrated', text: '스킬 속도 #% 증가', source: 'suffix', category: 'speed', tiers: 1, topLevel: 65, have: false, single: true, fill: 'min', choices: [res(1, 65, 3, 6)] }] },
      alloy: { prefix: [], suffix: [] },
    }

    it('기본 띠 아래에 접힌 띠로 붙고, 비어 있는 풀은 띠가 없다', () => {
      const { el } = open({ list: withPools })
      const bands = [...el.querySelectorAll('.ba-affix-band')]
      expect(bands.map((b) => [b.dataset.pool, b.querySelector('.ba-affix-band-name').textContent, b.querySelector('.ba-affix-band-meta').textContent]))
        .toEqual([['normal', '기본', '접두어 3 · 접미어 3'], ['essence', '에센스', '접두어 1 · 접미어 1'], ['desecrated', '훼손된', '접두어 0 · 접미어 1']])
      expect(bands.slice(1).every((b) => b.querySelector('.ba-affix-band-body').hidden)).toBe(true)
      expect(el.querySelector('.ba-affix-tab').textContent).toBe('전체9')
      bands[1].querySelector('.ba-affix-band-head').click()
      expect(bands[1].querySelector('.ba-affix-band-body').hidden).toBe(false)
      expect([...bands[1].querySelectorAll('.ba-affix-srccol-title')].map((t) => t.textContent)).toEqual(['접두어1', '접미어1'])
    })

    it('메커니즘 풀은 데이터가 준 이름으로 맨 아래 띠가 된다', () => {
      const mech = { pool: 'genesis_caster', label: '기원의 나무', desc: '산출된 아이템에 시전자 관련 속성 부여 가능', prefix: [ess('stat.spell_cd', '주문의 재사용 대기시간 회복 속도 #% 증가', 'prefix', { key: 'genesis_caster:stat.spell_cd', pool: 'genesis_caster' })], suffix: [] }
      const { el } = open({ list: { ...withPools, mechanics: [mech] } })
      const last = [...el.querySelectorAll('.ba-affix-band')].at(-1)
      expect([last.dataset.pool, last.querySelector('.ba-affix-band-name').textContent, last.querySelector('.ba-affix-band-desc').textContent])
        .toEqual(['genesis_caster', '기원의 나무', '산출된 아이템에 시전자 관련 속성 부여 가능'])
      expect(last.classList.contains('is-mechanic')).toBe(true)
      expect(el.querySelector('.ba-affix-tab').textContent).toBe('전체10')
    })

    it('접미어만 있는 풀도 접미어 자리(오른쪽)에 그리고, 왼쪽은 비었다고 알린다', () => {
      const { el } = open({ list: withPools })
      const cols = [...el.querySelectorAll('.ba-affix-band[data-pool="desecrated"] .ba-affix-sidegrid > .ba-affix-srccol')]
      expect(cols.map((c) => [c.querySelector('.ba-affix-srccol-title').textContent, c.classList.contains('is-empty'), c.querySelectorAll('.ba-affix-row').length]))
        .toEqual([['접두어0', true, 0], ['접미어1', false, 1]])
      expect(cols[0].textContent).toContain('접두어는 붙지 않아요')
    })

    it('접두어 탭에서는 띠에도 접두어만 남는다', () => {
      const { el } = open({ list: withPools })
      el.querySelectorAll('.ba-affix-tab')[1].click()
      expect([...el.querySelectorAll('.ba-affix-band')].map((b) => b.dataset.pool)).toEqual(['normal', 'essence'])
    })

    it('펼친 띠는 탭을 바꿔도 펼친 채 남는다', () => {
      const { el } = open({ list: withPools })
      el.querySelector('.ba-affix-band[data-pool="essence"] .ba-affix-band-head').click()
      el.querySelectorAll('.ba-affix-tab')[1].click()
      expect(el.querySelector('.ba-affix-band[data-pool="essence"] .ba-affix-band-body').hidden).toBe(false)
    })

    it('같은 능력치를 기본과 에센스에서 따로 고를 수 있고, 에센스는 범위로 고른다', async () => {
      const onAdd = vi.fn(async () => {})
      const { el } = open({ onAdd, list: withPools })
      const band = el.querySelector('.ba-affix-band[data-pool="essence"]')
      band.querySelector('.ba-affix-band-head').click()
      const essMana = [...band.querySelectorAll('.ba-affix-row')].find((r) => r.textContent.includes('마나 최대치'))
      const pills = essMana.querySelectorAll('.ba-affix-pill')
      expect([...pills].map((p) => p.textContent)).toEqual(['90~104', '60~70'])
      pills[1].click()
      const normalMana = el.querySelector('.ba-affix-band[data-pool="normal"]').querySelectorAll('.ba-affix-row')[1]
      expect(normalMana.querySelector('.ba-affix-check').checked).toBe(false) // 기본 마나는 그대로
      el.querySelector('.ba-affix-add').click()
      await Promise.resolve(); await Promise.resolve()
      expect(onAdd.mock.calls[0][0]).toEqual([{ id: 'stat.mana', value: { min: 60 }, role: 'here' }])
    })

    it('검색하면 맞는 띠만 펼치고, 지우면 처음 상태로 돌린다', () => {
      const { el } = open({ list: withPools })
      const search = el.querySelector('.ba-affix-search-input')
      search.value = '스킬 속도'; search.dispatchEvent(new Event('input'))
      const bands = [...el.querySelectorAll('.ba-affix-band')]
      const state = () => bands.map((b) => [b.hidden, b.querySelector('.ba-affix-band-body').hidden])
      expect(state()).toEqual([[true, true], [true, true], [false, false]])
      search.value = ''; search.dispatchEvent(new Event('input'))
      expect(state()).toEqual([[false, false], [false, true], [false, true]])
    })
  })

  it('유형 칩을 누르면 그 유형의 목록으로 바꾸고, 앞서 고른 것은 남는다', async () => {
    const onAdd = vi.fn(async () => {})
    const ringList = { status: 'ok', prefix: [multi({ id: 'stat.ring_life', text: '반지 생명력 #', choices: threeTiers(60, 50, 40) })], suffix: [], corrupted: [] }
    const listForClass = vi.fn((cls) => (cls === 'Ring' ? ringList : list))
    const { el } = open({ onAdd, classes: [{ cls: 'Gloves', label: '장갑' }, { cls: 'Ring', label: '반지' }], currentClass: 'Gloves', listForClass })
    const slot = (cls) => el.querySelector(`.ba-affix-slot[data-cls="${cls}"]`)
    expect([slot('Gloves').textContent, slot('Gloves').classList.contains('is-on'), slot('Ring').classList.contains('is-on')]).toEqual(['장갑', true, false])
    el.querySelectorAll('.ba-affix-check')[1].click() // 장갑의 마나
    el.querySelector('.ba-affix-doll-bar').click() // 유형이 정해진 채 열려 접혀 있다 — 펼치고
    slot('Ring').click()
    expect(listForClass).toHaveBeenCalledWith('Ring', null)
    expect([...el.querySelectorAll('.ba-affix-name')].map((n) => n.textContent)).toEqual(['반지 생명력 #'])
    el.querySelector('.ba-affix-check').click()
    expect(el.querySelector('.ba-affix-add').textContent).toBe('2개 넣기')
    el.querySelector('.ba-affix-add').click()
    await Promise.resolve(); await Promise.resolve()
    expect(onAdd.mock.calls[0][0].map((p) => p.id)).toEqual(['stat.mana', 'stat.ring_life'])
    // 고른 속성이 온 유형을 함께 넘긴다 — 둘 이상이면 부르는 쪽이 아이템 유형을 건드리지 않는다
    expect(onAdd.mock.calls[0][1]).toEqual({ classes: ['Gloves', 'Ring'] })
  })

  it('베이스가 있는 유형이면 베이스 칩 줄이 뜨고, 고르면 그 베이스 목록으로 바꾸며 고른 것은 남는다', async () => {
    const onAdd = vi.fn(async () => {})
    const rubyList = { ...list, prefix: [list.prefix[1]], suffix: [] }
    const listForClass = vi.fn((cls, base) => (base === 'JewelStr' ? rubyList : list))
    const basesForClass = (cls) => (cls === 'Jewel' ? [{ id: 'JewelStr', label: '루비' }, { id: 'JewelDex', label: '에메랄드' }] : [])
    const { el } = open({ onAdd, classes: [{ cls: 'Jewel', label: '모든 주얼' }, { cls: 'Ring', label: '반지' }], currentClass: 'Jewel', listForClass, basesForClass })
    const row = el.querySelector('.ba-affix-bases')
    expect(row.hidden).toBe(false)
    const chips = () => [...row.querySelectorAll('.ba-affix-base')]
    expect(chips().map((b) => [b.textContent, b.classList.contains('is-on')])).toEqual([['모든 베이스', true], ['루비', false], ['에메랄드', false]])
    el.querySelectorAll('.ba-affix-check')[4].click() // 냉기 저항 — 루비 목록에는 없다
    chips()[1].click()
    expect(listForClass).toHaveBeenLastCalledWith('Jewel', 'JewelStr')
    expect([...el.querySelectorAll('.ba-affix-name')].map((n) => n.textContent)).toEqual(['마나 최대치 #'])
    expect(chips()[1].classList.contains('is-on')).toBe(true)
    expect(el.querySelector('.ba-affix-add').textContent).toBe('1개 넣기') // 앞서 고른 것은 그대로
    // 베이스가 없는 유형으로 가면 줄이 숨는다
    el.querySelector('.ba-affix-slot[data-cls="Ring"]').click()
    expect(row.hidden).toBe(true)
  })

  it('유형이 없으면(모두) 장비창을 펼친 채 안내하고, 칸을 고르면 접혀 목록이 뜬다', () => {
    const { el } = open({ list: { status: 'no-class', prefix: [], suffix: [], corrupted: [] }, classes: [{ cls: 'Ring', label: '반지' }], currentClass: null, listForClass: () => list })
    expect(el.textContent).toContain('위에서 아이템 유형을 고르면')
    const body = el.querySelector('.ba-affix-doll-body')
    expect(body.hidden).toBe(false)
    expect(el.querySelector('.ba-affix-doll-bar-current').textContent).toBe('고르지 않음')
    el.querySelector('.ba-affix-slot[data-cls="Ring"]').click()
    expect(el.querySelectorAll('.ba-affix-row')).toHaveLength(6)
    expect(body.hidden).toBe(true)
    expect(el.querySelector('.ba-affix-doll-bar-current').textContent).toBe('반지')
    expect(el.querySelector('.ba-affix-doll-bar-toggle').textContent).toBe('유형 바꾸기')
  })

  describe('장비창 모양 유형 선택', () => {
    const all = [
      'Bow', 'Spear', 'Wand', 'Helmet', 'Amulet', 'Ring', 'Body_Armour', 'Gloves', 'Boots', 'Belt',
      'Shield', 'Buckler', 'Focus', 'Quiver', 'LifeFlask', 'ManaFlask', 'UtilityFlask', 'Jewel', 'Relic', 'NewThing',
    ].map((cls) => ({ cls, label: cls }))
    const areaOf = (el, cls) => [...el.querySelectorAll(`.ba-affix-slot[data-cls="${cls}"]`)].map((b) => b.closest('.ba-affix-doll-area')?.classList[1] ?? b.dataset.area)

    it('무기는 무기 영역, 보조 장비는 보조 영역 칸, 반지는 오른쪽 한 칸, 플라스크·주얼·유물은 허리띠 아래', () => {
      const { el } = open({ classes: all, currentClass: null, listForClass: () => list })
      expect(areaOf(el, 'Bow')).toEqual(['is-weapon'])
      expect(areaOf(el, 'Spear')).toEqual(['is-weapon'])
      expect(['Shield', 'Buckler', 'Focus', 'Quiver'].map((c) => areaOf(el, c)[0])).toEqual(['is-offhand', 'is-offhand', 'is-offhand', 'is-offhand'])
      expect(areaOf(el, 'Ring')).toEqual(['ring'])
      expect(areaOf(el, 'Belt')).toEqual(['belt'])
      expect(areaOf(el, 'LifeFlask')).toEqual(['is-flask'])
      expect(areaOf(el, 'Jewel')).toEqual(['is-other'])
      expect(areaOf(el, 'Relic')).toEqual(['is-other'])
      expect(el.querySelector('.ba-affix-doll-bottom .is-flask')).not.toBeNull()
      expect(el.querySelector('.ba-affix-doll-bottom .is-other')).not.toBeNull()
      // 배치에 없는 새 유형은 사라지지 않고 「주얼 · 기타」 에 붙는다
      expect(areaOf(el, 'NewThing')).toEqual(['is-other'])
    })

    it('고른 칸만 켜진다', () => {
      const { el } = open({ classes: all, currentClass: null, listForClass: () => list })
      el.querySelector('.ba-affix-slot[data-area="ring"]').click()
      expect([...el.querySelectorAll('.ba-affix-slot.is-on')].map((b) => b.dataset.cls)).toEqual(['Ring'])
    })

    it('칸마다 아이콘과 거래소 이름이 있고, 없는 유형은 칸을 만들지 않는다', () => {
      const { el } = open({ classes: [{ cls: 'Helmet', label: '투구' }], currentClass: null, listForClass: () => list })
      const slots = [...el.querySelectorAll('.ba-affix-slot')]
      expect(slots.map((s) => [s.textContent, !!s.querySelector('svg path')])).toEqual([['투구', true]])
      expect(el.querySelector('.is-weapon')).toBeNull()
    })
  })

  it('네이티브 title 툴팁을 쓰지 않는다 — 이름·역할·값 버튼과 칩은 우리 툴팁(data-tip)을 띄운다', () => {
    const { el } = open()
    expect(el.querySelectorAll('[title]')).toHaveLength(0)
    expect(document.querySelectorAll('.ba-affix-btn[title]')).toHaveLength(0)
    const name = el.querySelectorAll('.ba-affix-name')[1]
    expect(name.dataset.tip).toContain('마나 최대치 #')
    name.dispatchEvent(new MouseEvent('mouseenter'))
    const tip = document.getElementById('ba-page-tip')
    expect(tip.classList.contains('show')).toBe(true)
    expect(tip.textContent).toContain('티어 8개')
    closeAffixPopover()
    expect(tip.classList.contains('show')).toBe(false) // 창을 닫으면 떠 있던 툴팁도 사라진다
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
    expect(add.textContent).toBe('3개 넣기')
    add.click()
    await Promise.resolve(); await Promise.resolve()
    expect(onAdd.mock.calls[0][0]).toEqual([
      { id: 'stat.mana', value: null, role: 'here' },
      { id: 'stat.fire_res', value: null, role: 'here' },
      { id: 'stat.cold_res', value: null, role: 'here' },
    ])
    expect(document.querySelector('.' + AFFIX_POP_CLASS)).toBeNull()
  })

  it('티어 버튼을 누르면 그 행이 체크되고 그 티어 값이 넘어간다 — 다시 누르면 빈칸', async () => {
    const onAdd = vi.fn(async () => {})
    const { el } = open({ onAdd })
    const rows = el.querySelectorAll('.ba-affix-row')
    const manaPills = rows[1].querySelectorAll('.ba-affix-pill')
    expect([...manaPills].map((p) => p.textContent)).toEqual(['T1', 'T2', 'T3'])
    manaPills[1].click()
    expect(rows[1].querySelector('.ba-affix-check').checked).toBe(true)
    expect(manaPills[1].getAttribute('aria-pressed')).toBe('true')
    expect(el.querySelector('.ba-affix-count').textContent).toBe('1개 선택 · 값 1')
    const resPills = rows[3].querySelectorAll('.ba-affix-pill')
    resPills[0].click(); resPills[0].click() // 다시 누르면 빈칸 — 체크는 남는다
    expect(rows[3].querySelector('.ba-affix-check').checked).toBe(true)
    expect(resPills[0].getAttribute('aria-pressed')).toBe('false')
    el.querySelector('.ba-affix-add').click()
    await Promise.resolve(); await Promise.resolve()
    expect(onAdd.mock.calls[0][0]).toEqual([{ id: 'stat.mana', value: { min: 140 }, role: 'here' }, { id: 'stat.fire_res', value: null, role: 'here' }])
  })

  it('티어가 하나뿐인 속성은 범위를 보여 주고, 체크만 해도 최소·최대가 함께 넘어간다', async () => {
    const onAdd = vi.fn(async () => {})
    const { el } = open({ onAdd })
    const row = [...el.querySelectorAll('.ba-affix-row')].find((r) => r.textContent.includes('일반 정확도'))
    expect(row.querySelector('.ba-affix-pill').textContent).toBe('5~10')
    const box = row.querySelector('.ba-affix-check')
    box.checked = true; box.dispatchEvent(new Event('change'))
    expect(row.querySelector('.ba-affix-pill').classList.contains('is-on')).toBe(true)
    el.querySelector('.ba-affix-add').click()
    await Promise.resolve(); await Promise.resolve()
    expect(onAdd.mock.calls[0][0]).toEqual([{ id: 'stat.jewel_acc', value: { min: 5, max: 10 }, role: 'here' }])
  })

  it('필수·OR 을 누르면 행이 체크되고 역할이 넘어간다 — 같은 것을 다시 누르면 이 그룹으로 돌아간다', async () => {
    const onAdd = vi.fn(async () => {})
    const { el } = open({ onAdd })
    const rows = el.querySelectorAll('.ba-affix-row')
    const roleBtn = (row, key) => row.querySelector(`.ba-affix-role[data-role="${key}"]`)
    roleBtn(rows[1], 'and').click() // 마나 → 필수
    expect(rows[1].querySelector('.ba-affix-check').checked).toBe(true)
    rows[1].querySelectorAll('.ba-affix-pill')[0].click() // 값도 고른다 — 역할은 유지
    roleBtn(rows[3], 'or').click(); roleBtn(rows[3], 'and').click() // 화염 저항: OR → 필수로 바꾼다
    roleBtn(rows[4], 'or').click(); roleBtn(rows[4], 'or').click() // 냉기 저항: OR 을 다시 눌러 해제
    expect(roleBtn(rows[4], 'or').getAttribute('aria-pressed')).toBe('false')
    expect(el.querySelector('.ba-affix-count').textContent).toBe('3개 선택 · 값 1 · 필수 2')
    el.querySelector('.ba-affix-add').click()
    await Promise.resolve(); await Promise.resolve()
    expect(onAdd.mock.calls[0][0]).toEqual([
      { id: 'stat.mana', value: { min: 160 }, role: 'and' },
      { id: 'stat.fire_res', value: null, role: 'and' },
      { id: 'stat.cold_res', value: null, role: 'here' },
    ])
  })

  it('종류별로 묶어 보여 준다 — 저항은 저항끼리', () => {
    const typed = {
      status: 'ok',
      prefix: [],
      suffix: [
        multi({ id: 'a', text: '민첩 #', category: 'attribute', choices: threeTiers(30, 25, 20) }),
        multi({ id: 'b', text: '화염 저항 #%', category: 'resist', choices: threeTiers(41, 36, 31) }),
        multi({ id: 'c', text: '힘 #', category: 'attribute', choices: threeTiers(30, 25, 20) }),
        multi({ id: 'd', text: '냉기 저항 #%', category: 'resist', choices: threeTiers(41, 36, 31) }),
      ],
    }
    const { el } = open({ list: typed })
    const secs = [...el.querySelectorAll('.ba-affix-sec')].map((s) => [
      s.querySelector('.ba-affix-sec-name').textContent,
      [...s.querySelectorAll('.ba-affix-name')].map((n) => n.textContent),
    ])
    expect(secs).toEqual([['저항', ['화염 저항 #%', '냉기 저항 #%']], ['능력치', ['민첩 #', '힘 #']]])
    // 종류 표식이 있어야 CSS 가 묶음마다 다른 색을 입힌다
    expect([...el.querySelectorAll('.ba-affix-sec')].map((s) => s.dataset.category)).toEqual(['resist', 'attribute'])
    // 목록이 짧으면 펼친 채 시작한다
    expect(el.querySelectorAll('.ba-affix-sec-body[hidden]')).toHaveLength(0)
  })

  it('목록이 길면(80개 초과) 묶음을 접은 채 시작하고, 검색하면 맞는 묶음만 펼친다', () => {
    const many = Array.from({ length: 90 }, (_, i) =>
      ({ id: 's' + i, text: (i === 5 ? '특별한 ' : '') + '속성 ' + i, category: i < 45 ? 'damage' : 'defence', tiers: 1, topLevel: 1, have: false, single: true, fill: 'min', choices: [res(1, 1, 1, 2)] }))
    const { el } = open({ list: { status: 'ok', prefix: many, suffix: [] } })
    const bodies = el.querySelectorAll('.ba-affix-sec-body')
    expect([...bodies].every((b) => b.hidden)).toBe(true)
    const search = el.querySelector('.ba-affix-search-input')
    search.value = '특별한'; search.dispatchEvent(new Event('input'))
    const secs = [...el.querySelectorAll('.ba-affix-sec')]
    // 묶음 순서는 방어 → 피해·상태 이상. '특별한' 은 피해 묶음(두 번째)에 있다
    expect(secs.map((s) => s.querySelector('.ba-affix-sec-name').textContent)).toEqual(['방어', '피해·상태 이상'])
    expect(secs.map((s) => s.hidden)).toEqual([true, false])
    expect(secs[1].querySelector('.ba-affix-sec-body').hidden).toBe(false)
    search.value = ''; search.dispatchEvent(new Event('input'))
    expect([...el.querySelectorAll('.ba-affix-sec-body')].every((b) => b.hidden)).toBe(true)
    el.querySelector('.ba-affix-sec-head').click()
    expect(el.querySelector('.ba-affix-sec-body').hidden).toBe(false)
  })

  it('이미 있는 속성과 레벨이 안 닿는 속성에는 티어 버튼이 없다', () => {
    const { el } = open()
    const rows = el.querySelectorAll('.ba-affix-row')
    expect(rows[0].querySelectorAll('.ba-affix-pill')).toHaveLength(0)
    expect(rows[2].querySelectorAll('.ba-affix-pill')).toHaveLength(0)
    expect(rows[2].textContent).toContain('레벨 부족')
  })

  it('검색은 행을 숨길 뿐 체크 상태를 지운다거나 하지 않는다', () => {
    const { el } = open()
    const boxes = el.querySelectorAll('.ba-affix-check')
    boxes[1].checked = true; boxes[1].dispatchEvent(new Event('change'))
    const search = el.querySelector('.ba-affix-search-input')
    search.value = '저항'; search.dispatchEvent(new Event('input'))
    const visible = [...el.querySelectorAll('.ba-affix-row')].filter((r) => !r.hidden).map((r) => r.querySelector('.ba-affix-name').textContent)
    expect(visible).toEqual(['화염 저항 #%', '냉기 저항 #%'])
    expect(boxes[1].checked).toBe(true)
    expect(el.querySelector('.ba-affix-add').textContent).toBe('1개 넣기')
  })

  it('선택 해제로 모두 푼다', () => {
    const { el } = open()
    const boxes = el.querySelectorAll('.ba-affix-check')
    boxes[3].checked = true; boxes[3].dispatchEvent(new Event('change'))
    el.querySelector('.ba-affix-clear').click()
    expect(boxes[3].checked).toBe(false)
    expect(el.querySelector('.ba-affix-add').disabled).toBe(true)
  })

  it('Esc · 뒤 흐림(scrim) 클릭으로 닫히고, 시트 안 클릭으로는 안 닫힌다 — 닫으면 scrim 도 사라진다', () => {
    let h = open()
    h.el.querySelector('.ba-affix-name').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
    expect(document.querySelector('.' + AFFIX_POP_CLASS)).not.toBeNull()
    document.querySelector('.ba-affix-scrim').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(document.querySelector('.' + AFFIX_POP_CLASS)).toBeNull()
    expect(document.querySelector('.ba-affix-scrim')).toBeNull()
    h = open()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector('.' + AFFIX_POP_CLASS)).toBeNull()
  })

  it('/ 를 누르면 검색칸으로 간다', () => {
    const { el } = open()
    el.querySelector('.ba-affix-add').focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    expect(document.activeElement).toBe(el.querySelector('.ba-affix-search-input'))
  })

  it('다시 열면 앞의 것을 닫는다 — 팝오버는 하나뿐', () => {
    open(); open()
    expect(document.querySelectorAll('.' + AFFIX_POP_CLASS)).toHaveLength(1)
  })

  it('유형을 모르면 목록 대신 안내하고 넣기는 막힌다', () => {
    const { el } = open({ list: { status: 'no-class', prefix: [], suffix: [] } })
    expect(el.textContent).toContain('아이템 유형을 먼저 고르면')
    expect(el.querySelector('.ba-affix-add').disabled).toBe(true)
    expect(el.querySelector('.ba-affix-search-input').disabled).toBe(true)
  })
})
