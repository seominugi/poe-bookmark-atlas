// src/content/affix-picker.js
// 「+ 능력치 필터 추가」 글자 옆 「속성 목록」 칩과, 누르면 뜨는 글래스 시트.
//
// 넣을 곳은 기본으로 **누른 칩의 그룹**이다 — 따로 고르게 하면 엉뚱한 그룹에 넣는 실수가 생긴다(시안 A, 2026-09-15).
// 행에 「필수」·「OR」 을 표시하면 그 속성만 조건에 맞는 그룹으로 간다(stat-adder.js 가 그룹을 찾거나 만든다).
// 디자인: 글래스 시안 1번(가운데 시트) + 트리거는 티어 칩 모양(사용자 결정 2026-09-15).
// 실제로 넣는 일은 MAIN world 의 stat-adder.js 가 한다. 이 파일은 DOM 과 사용자 선택만 다룬다.

import { filterAffixes, affixFilterValue, allAffixItems, SPECIAL_POOLS } from '../lib/affixList.js'
import { groupByCategory } from '../lib/affixCategory.js'
import { bindPageTip, hidePageTip } from './page-tip.js'
import { buildTypeDoll } from './affix-type-doll.js'

export const AFFIX_BTN_CLASS = 'ba-affix-btn'
export const AFFIX_POP_CLASS = 'ba-affix-pop'
const CHIP_ROW_CLASS = 'ba-affix-chiprow'
/** 「속성 목록」 칩 아이콘 — 투어 예시 카드도 같은 것을 쓴다. */
export const AFFIX_CHIP_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
const ADD_PLACEHOLDERS = ['능력치 필터 추가', 'Add Stat Filter']
// 이보다 길면 종류 묶음을 접은 채 시작한다 — 주얼(313개)은 펼치면 한 화면에 안 들어간다(사용자 결정 2026-09-15).
const COLLAPSE_OVER = 80

/** 화면의 「+ 능력치 필터 추가」 입력칸 — 그룹마다 하나다. */
export function statAddInputs(root) {
  return [...root.querySelectorAll('input.multiselect__input')].filter((input) => {
    const ph = input.getAttribute('placeholder') || ''
    return ADD_PLACEHOLDERS.some((p) => ph.includes(p))
  })
}

/** 두 world 가 같은 그룹을 가리키는 표식. MAIN world 는 DOM 만 공유한다. */
export function groupToken(group) {
  if (!group.dataset.baGroupToken) {
    group.dataset.baGroupToken = 'g' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  }
  return group.dataset.baGroupToken
}

/**
 * 그룹마다 칩을 한 번만 붙인다. 화면이 다시 그려져 사라지면 다음 호출에서 되살아난다.
 *
 * 자리는 **추가 줄(「+ 능력치 필터 추가」) 바로 아래의 별도 줄**이다(사용자 요청 2026-09-16).
 * 거쳐 온 자리: 헤더 제목 뒤(밑줄에 붙어 간격이 없었다) → 줄 오른쪽 끝(드롭다운 화살표와 겹쳤다) →
 * 글자 오른쪽(글자 폭을 재서 두었는데 창 폭이 바뀌면 글자를 덮었다).
 * 추가 줄은 그룹 본문의 마지막 자식이고 거래소는 새 행을 그 앞에 끼우므로, 그 뒤에 둔 줄은 행 순서를 흩뜨리지 않는다.
 * @param {ParentNode} root
 * @param {{onOpen:(group:HTMLElement, button:HTMLButtonElement)=>void}} ctx
 * @returns {number} 붙어 있는 칩 수
 */
export function attachAffixButtons(root, { onOpen }) {
  let count = 0
  for (const input of statAddInputs(root)) {
    const group = input.closest('.filter-group')
    const bar = input.closest('.filter')
    if (!group || !bar) continue
    count++
    let row = bar.nextElementSibling?.classList.contains(CHIP_ROW_CLASS) ? bar.nextElementSibling : null
    if (!row) {
      // 화면이 다시 그려져 줄이 떨어져 나갔으면 옛 줄을 치우고 새로 붙인다
      group.querySelectorAll('.' + CHIP_ROW_CLASS).forEach((old) => old.remove())
      row = document.createElement('div')
      row.className = CHIP_ROW_CLASS
      bar.after(row)
    }
    let btn = row.querySelector(':scope > .' + AFFIX_BTN_CLASS)
    if (!btn) {
      btn = document.createElement('button')
      btn.type = 'button'
      btn.className = AFFIX_BTN_CLASS
      btn.innerHTML = `${AFFIX_CHIP_ICON}<span>속성 목록</span>`
      btn.dataset.tip = '이 아이템 유형에 붙는 속성을 보고 골라서\n이 그룹에 바로 넣어요'
      bindPageTip(btn, { placement: 'below' })
      btn.setAttribute('aria-haspopup', 'dialog')
      // 거래소 드롭다운이 mousedown 으로 열리므로 여기서 끊는다 — 안 끊으면 칩을 누를 때 목록이 같이 열린다.
      btn.addEventListener('mousedown', (e) => e.stopPropagation())
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpen(group, btn)
      })
      row.appendChild(btn)
    }
  }
  return count
}

/** 사용자에게 보여 줄 그룹 이름 — 「그룹 2 · 숫자」. 번호는 능력치 그룹끼리의 위→아래 순서다. */
export function groupLabel(root, group) {
  const groups = [...new Set(statAddInputs(root).map((i) => i.closest('.filter-group')).filter(Boolean))]
  const n = groups.indexOf(group) + 1
  // 제목 요소 안에 도움말 문단(`div.filter-tip`)이 숨어 있다 — textContent 로 읽으면 그 문장이 통째로 딸려 온다
  // (2026-09-15 라이브: 「그룹 1 · 숫자 '최소' 및 '최대' 조건을…」). 제목 자신의 글자만 읽는다.
  const titleEl = group.querySelector('.filter-group-header .filter-title')
  const title = titleEl
    ? [...titleEl.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim()
    : ''
  return [n > 0 ? `그룹 ${n}` : '이 그룹', title].filter(Boolean).join(' · ')
}

/** 그룹 안 능력치 행의 이름 텍스트 요소들. 넣을 그룹에 이미 있는 능력치를 막는 데 쓴다. */
export function groupRowTitles(group) {
  return [...group.querySelectorAll('.filter-group-body .filter-title')]
}

let openPop = null

export function closeAffixPopover() {
  if (openPop) openPop.close()
}

const ROLES = [
  { key: 'and', label: '필수', tip: '모두 만족해야 하는 그룹(AND)에 넣어요. 없으면 새로 만들어요.' },
  { key: 'or', label: 'OR', tip: '하나 이상 만족하면 되는 그룹(개수, 최소 1)에 넣어요. 누른 그룹이 그 방식이 아니면 새로 만들어요.' },
]
const SOURCE_LABEL = { prefix: '접두', suffix: '접미', corrupted: '타락' }
// 접히는 공급원 띠 — 에센스·훼손된·합금. 일반 속성보다 드물게 찾으므로 접은 채 시작한다.
const BAND_POOLS = SPECIAL_POOLS.filter((p) => p.sided)
/** 목록 안에서 유일한 표식 — affixListFor 가 붙인 key, 없으면 출처와 id 로 만든다. */
// 고른 것의 키는 **거래소 조건(id)** 이다. 기본·에센스·메커니즘 풀의 같은 속성은 모두 explicit.* 한 조건이라
// 한 줄을 고르면 나머지 줄도 함께 체크된다(사용자 결정 2026-09-16). 훼손된(desecrated.*)·타락(enchant.*)은 id 가 달라 따로 간다.
const keyOf = (item) => item.id
const TABS = [
  { key: 'all', label: '전체' },
  { key: 'prefix', label: '접두어' },
  { key: 'suffix', label: '접미어' },
  { key: 'corrupted', label: '타락' },
]

/**
 * 시트를 연다. 이미 열린 것은 닫는다.
 * @param {object} args
 * @param {HTMLElement} args.anchor 누른 칩
 * @param {string} args.title 넣을 그룹 이름
 * @param {string} args.subtitle 설명 (레벨 등)
 * @param {{status:string, prefix:object[], suffix:object[], corrupted?:object[]}} args.list 지금 유형의 affixListFor 결과
 * @param {Array<{cls:string, label:string}>} [args.classes] 유형 칩 — 누르면 그 유형의 목록을 본다
 * @param {string|null} [args.currentClass]
 * @param {(cls:string, base:string|null)=>object} [args.listForClass] 유형·베이스 칩을 눌렀을 때 그 목록
 * @param {(cls:string)=>Array<{id:string,label:string}>} [args.basesForClass] 유형의 베이스 칩(없으면 빈 배열)
 * @param {(picks:Array<{id:string, value:{min?:number,max?:number}|null, role:'here'|'and'|'or'}>, meta:{classes:Array<string|null>})=>Promise<void>|void} args.onAdd
 *   meta.classes — 고른 속성이 온 유형(중복 없음, 넣는 순서). 유형 없이 본 목록이면 null 이 들어간다.
 */
export function openAffixPopover({ anchor, title, subtitle, list, classes = [], currentClass = null, listForClass, basesForClass, onAdd, prefs = {}, onPrefs }) {
  // 사용자 설정 — 창을 닫았다 열어도 남는다(부르는 쪽이 저장한다)
  //   orSplit      OR 을 접두어·접미어 그룹으로 나눠 넣는다(사용자 요청 2026-09-16)
  //   baseByClass  유형마다 마지막에 고른 베이스(주얼 → 루비 …)
  const settings = { orSplit: prefs.orSplit !== false, baseByClass: { ...(prefs.baseByClass ?? {}) } }
  const savePrefs = () => { try { onPrefs?.({ orSplit: settings.orSplit, baseByClass: { ...settings.baseByClass } }) } catch (_) { /* 저장 실패는 화면에 영향 없음 */ } }
  /** 유형의 기억한 베이스 — 지금 그 유형에 없는 베이스면 잊는다. */
  const rememberedBase = (cls) => {
    const id = cls ? settings.baseByClass[cls] : null
    if (!id || !basesForClass) return null
    return basesForClass(cls).some((b) => b.id === id) ? id : null
  }
  closeAffixPopover()
  const doc = anchor.ownerDocument
  const scrim = el(doc, 'div', 'ba-affix-scrim')
  const pop = el(doc, 'div', AFFIX_POP_CLASS)
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-modal', 'true')
  pop.setAttribute('aria-label', `${title}에 속성 넣기`)

  // ── 머리: 제목 · 탭 · 검색 · 닫기 ──
  const head = el(doc, 'div', 'ba-affix-head')
  const titles = el(doc, 'div', 'ba-affix-titles')
  const subEl = el(doc, 'div', 'ba-affix-sub', subtitle)
  titles.append(el(doc, 'div', 'ba-affix-title', `${title}에 넣기`), subEl)
  const tabs = el(doc, 'div', 'ba-affix-tabs')
  tabs.setAttribute('role', 'tablist')
  const tabBtns = TABS.map((t) => {
    const b = el(doc, 'button', 'ba-affix-tab')
    b.type = 'button'
    b.dataset.tab = t.key
    b.setAttribute('role', 'tab')
    tabs.appendChild(b)
    return { ...t, el: b }
  })
  const searchWrap = el(doc, 'label', 'ba-affix-search')
  searchWrap.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  const search = el(doc, 'input', 'ba-affix-search-input')
  search.type = 'search'
  search.placeholder = '속성 검색'
  search.setAttribute('aria-label', '속성 검색')
  searchWrap.appendChild(search)
  const closeBtn = el(doc, 'button', 'ba-affix-close', '✕')
  closeBtn.type = 'button'
  closeBtn.setAttribute('aria-label', '닫기')
  head.append(titles, tabs, searchWrap, closeBtn)
  pop.appendChild(head)

  // ── 유형 선택 — 장비창 모양(시안 A, 사용자 결정 2026-09-16). 유형을 고르면 접혀 목록에 자리를 내준다. ──
  const pickClass = (cls) => {
    if (!listForClass) return
    doll.setOpen(false)
    if (cls === current.cls) return
    const base = rememberedBase(cls)
    current = { cls, base, list: listForClass(cls, base) }
    render()
  }
  const doll = buildTypeDoll(doc, classes, { onPick: pickClass })
  // 이미 유형이 정해진 채 열면 접어서 시작한다 — 먼저 보여야 할 것은 속성 목록이다
  doll.setOpen(!currentClass)
  if (classes.length) pop.appendChild(doll.el)

  // ── 베이스 칩 줄 — 한 유형 안에서 베이스마다 붙는 속성이 갈리는 곳(주얼: 루비·에메랄드·사파이어·다이아몬드·오래된 …) ──
  // 유형이 바뀔 때마다 다시 그린다. 베이스가 없는 유형이면 줄을 숨긴다.
  const baseRow = el(doc, 'div', 'ba-affix-bases')
  baseRow.setAttribute('role', 'group')
  baseRow.setAttribute('aria-label', '베이스')
  pop.appendChild(baseRow)

  const body = el(doc, 'div', 'ba-affix-body')
  pop.appendChild(body)

  // ── 발: 안내 · 개수 · 해제 · 넣기 ──
  const foot = el(doc, 'div', 'ba-affix-foot')
  const hint = el(doc, 'span', 'ba-affix-legend', '행에 마우스를 올리면 필수·OR·티어를 고를 수 있어요 · 표시가 없으면 이 그룹에 넣어요')
  const countEl = el(doc, 'span', 'ba-affix-count')
  const clearBtn = el(doc, 'button', 'ba-affix-clear', '선택 해제')
  clearBtn.type = 'button'
  const addBtn = el(doc, 'button', 'ba-affix-add')
  addBtn.type = 'button'
  // OR 을 접두어·접미어로 나눠 넣을지 — 켜면 OR 표시가 접두어 개수 그룹과 접미어 개수 그룹으로 갈려 들어간다
  const splitLabel = el(doc, 'label', 'ba-affix-split')
  const splitBox = el(doc, 'input', 'ba-affix-split-check')
  splitBox.type = 'checkbox'
  splitBox.checked = settings.orSplit
  splitLabel.append(splitBox, el(doc, 'span', null, 'OR 을 접두어·접미어로 나눠 넣기'))
  splitLabel.dataset.tip = '켜면 OR 로 표시한 속성을\n접두어는 접두어끼리, 접미어는 접미어끼리\n각각 「개수(최소 1)」 그룹에 넣어요'
  bindPageTip(splitLabel, { placement: 'below' })
  splitBox.addEventListener('change', () => { settings.orSplit = splitBox.checked; savePrefs() })
  foot.append(hint, splitLabel, countEl, clearBtn, addBtn)
  pop.appendChild(foot)

  // item.key → { index: 고른 값(-1 = 빈칸), role, item } — 유형을 바꿔도 고른 것은 남는다.
  // id 가 아니라 key(풀:id)로 쥔다 — 같은 능력치가 일반과 에센스에 함께 있다.
  const selected = new Map()
  let rows = [] // {item, row, box, pills, roles}
  let sections = [] // {el, rows, setOpen, startOpen}
  let bands = [] // 공급원 띠 {el, rows, setOpen, startOpen}
  let bulks = [] // 「OR 전체」 단추 {btn, rowsOf}
  let tab = 'all'
  let current = { cls: currentClass, base: null, list }
  {
    // 이미 유형이 정해진 채 열었으면 그 유형에서 마지막에 고른 베이스로 시작한다
    const base = rememberedBase(currentClass)
    if (base && listForClass) current = { cls: currentClass, base, list: listForClass(currentClass, base) }
  }

  const renderBases = () => {
    baseRow.innerHTML = ''
    const bases = basesForClass && current.cls ? basesForClass(current.cls) : []
    baseRow.hidden = !bases.length
    if (!bases.length) return
    const choices = [{ id: null, label: '모든 베이스' }, ...bases]
    for (const c of choices) {
      const b = el(doc, 'button', 'ba-affix-base', c.label)
      b.type = 'button'
      const on = c.id === current.base
      b.classList.toggle('is-on', on)
      b.setAttribute('aria-pressed', String(on))
      b.addEventListener('click', () => {
        if (c.id === current.base || !listForClass) return
        current = { cls: current.cls, base: c.id, list: listForClass(current.cls, c.id) }
        if (c.id) settings.baseByClass[current.cls] = c.id
        else delete settings.baseByClass[current.cls]
        savePrefs()
        render()
      })
      baseRow.appendChild(b)
    }
  }

  const refresh = () => {
    const picks = [...selected.values()]
    const n = picks.length
    const parts = []
    const valued = picks.filter((p) => p.index >= 0).length
    const must = picks.filter((p) => p.role === 'and').length
    const or = picks.filter((p) => p.role === 'or').length
    if (valued) parts.push(`값 ${valued}`)
    if (must) parts.push(`필수 ${must}`)
    if (or) parts.push(`OR ${or}`)
    paintBulks()
    countEl.innerHTML = ''
    if (n) {
      countEl.append(el(doc, 'b', null, String(n)), `개 선택${parts.length ? ' · ' + parts.join(' · ') : ''}`)
    } else countEl.textContent = '넣을 속성을 체크하세요'
    addBtn.textContent = n ? `${n}개 넣기` : '넣기'
    addBtn.disabled = n === 0
    clearBtn.hidden = n === 0
  }
  /** 목록 안 위치 — 넣는 순서를 체크한 순서가 아니라 목록 순서(일반 접두 → 접미 → 타락 → 에센스 …)로 맞추는 데 쓴다. */
  const posOf = (item) => {
    const i = allAffixItems(current.list).indexOf(item)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const classOrder = new Map() // 유형 → 처음 고른 차례
  const setRow = (r, pick) => {
    if (pick === undefined) selected.delete(keyOf(r.item))
    else {
      const prev = selected.get(keyOf(r.item))
      const clsKey = current.cls ?? ''
      if (!classOrder.has(clsKey)) classOrder.set(clsKey, classOrder.size)
      selected.set(keyOf(r.item), { ...pick, item: r.item, pos: prev?.pos ?? posOf(r.item), batch: prev?.batch ?? classOrder.get(clsKey), cls: prev?.cls ?? current.cls })
    }
    for (const t of rows) if (t.item.id === r.item.id) paintRow(t)
    refresh()
  }
  const paintRow = (r) => {
    const pick = selected.get(keyOf(r.item))
    const mine = pick?.item === r.item // 값(티어)은 마지막에 고른 줄의 것이다
    r.box.checked = !!pick
    r.row.classList.toggle('is-on', !!pick)
    r.row.classList.toggle('is-linked', !!pick && !mine)
    if (r.linked) r.linked.textContent = pick && !mine ? `${poolLabel(pick.item)} 줄 값으로 넣어요` : ''
    r.pills.forEach((p, i) => {
      const on = mine && pick.index === i
      p.classList.toggle('is-on', on)
      p.setAttribute('aria-pressed', String(on))
    })
    r.roles.forEach((b) => {
      const on = pick?.role === b.dataset.role
      b.classList.toggle('is-on', on)
      b.setAttribute('aria-pressed', String(on))
    })
  }
  const defaultPick = (item) => ({ index: item.single && item.choices.length ? 0 : -1, role: 'here' })
  /** 줄이 속한 띠 이름 — 「같은 조건」 안내에 쓴다. */
  const poolLabel = (item) => {
    if (!item.pool || item.pool === 'normal') return '기본'
    return SPECIAL_POOLS.find((p) => p.pool === item.pool)?.label
      ?? (current.list?.mechanics ?? []).find((m) => m.pool === item.pool)?.label ?? item.pool
  }
  let twinPools = new Map() // id → 그 조건이 보이는 띠 이름들(렌더마다 다시 센다)

  // ── OR 일괄 — OR 은 수십 개를 하나씩 누르기 번거롭다(사용자 요청 2026-09-16). 필수는 많아야 6개라 행마다 고른다. ──
  // 대상은 지금 보이는(검색에 걸린) 행 중 이미 그룹에 있는 것을 뺀 것이다.
  const bulkTargets = (list) => list.filter((r) => !r.item.have && !r.row.hidden)
  const bulkIsOn = (list) => {
    const targets = bulkTargets(list)
    return targets.length > 0 && targets.every((r) => selected.get(keyOf(r.item))?.role === 'or')
  }
  const toggleBulk = (list) => {
    const targets = bulkTargets(list)
    if (!targets.length) return
    const on = bulkIsOn(list)
    const clsKey = current.cls ?? ''
    if (!classOrder.has(clsKey)) classOrder.set(clsKey, classOrder.size)
    for (const r of targets) {
      const key = keyOf(r.item)
      const prev = selected.get(key)
      if (on) { if (prev?.role === 'or') selected.delete(key) } else if (prev) {
        selected.set(key, { ...prev, role: 'or' }) // 같은 조건을 다른 줄에서 이미 골랐으면 그 값을 그대로 둔다
      } else {
        selected.set(key, { index: defaultPick(r.item).index, role: 'or', item: r.item, pos: posOf(r.item), batch: classOrder.get(clsKey), cls: current.cls })
      }
    }
    rows.forEach(paintRow) // 같은 조건 줄이 다른 묶음에도 있다
    refresh()
  }
  const makeBulk = (className, label, rowsOf) => {
    const btn = el(doc, 'button', className, label)
    btn.type = 'button'
    btn.dataset.tip = '보이는 속성을 모두 OR 로 표시해요\n다시 누르면 OR 표시를 모두 풀어요'
    bindPageTip(btn, { placement: 'below' })
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleBulk(rowsOf()) })
    bulks.push({ btn, rowsOf })
    return btn
  }
  function paintBulks() {
    for (const b of bulks) {
      const list = b.rowsOf()
      const on = bulkIsOn(list)
      b.btn.classList.toggle('is-on', on)
      b.btn.setAttribute('aria-pressed', String(on))
      b.btn.disabled = bulkTargets(list).length === 0
    }
  }

  /** 지금 유형·탭으로 본문을 다시 그린다. 고른 것(selected)은 그대로 둔다. */
  const render = () => {
    const l = current.list
    doll.setCurrent(current.cls)
    renderBases()
    hidePageTip() // 다시 그리면 툴팁을 띄운 행이 사라진다
    body.innerHTML = ''
    rows = []
    sections = []
    bands = []
    bulks = []
    twinPools = new Map()
    for (const it of allAffixItems(l)) {
      const names = twinPools.get(it.id) ?? []
      const name = poolLabel(it)
      if (!names.includes(name)) names.push(name)
      twinPools.set(it.id, names)
    }
    const sideCount = (side) => (l[side]?.length ?? 0)
      + BAND_POOLS.reduce((n, p) => n + (l[p.pool]?.[side]?.length ?? 0), 0)
      + (l.mechanics ?? []).reduce((n, m) => n + (m[side]?.length ?? 0), 0)
    const counts = {
      all: allAffixItems(l).length,
      prefix: sideCount('prefix'), suffix: sideCount('suffix'), corrupted: l.corrupted?.length ?? 0,
    }
    tabBtns.forEach((t) => {
      t.el.textContent = ''
      t.el.append(t.label, el(doc, 'em', null, String(counts[t.key])))
      t.el.classList.toggle('is-on', t.key === tab)
      t.el.setAttribute('aria-selected', String(t.key === tab))
      t.el.hidden = t.key === 'corrupted' && !counts.corrupted
    })
    tabs.hidden = l.status !== 'ok'
    search.disabled = l.status !== 'ok'
    if (l.status !== 'ok') {
      body.appendChild(el(doc, 'p', 'ba-affix-empty', classes.length
        ? '위에서 아이템 유형을 고르면 그 유형에 붙는 속성을 보여 드려요.'
        : '아이템 유형을 먼저 고르면, 그 유형에 붙는 속성을 보여 드려요.'))
      return
    }
    if (!counts[tab]) {
      body.appendChild(el(doc, 'div', 'ba-affix-none', '이 유형에는 없어요'))
      return
    }
    // 짜임(사용자 요청 2026-09-16):
    //   ① 타락 — 맨 위에 붉은 한 줄로 고정한다. 접지 않는다.
    //   ② 기본 · 에센스 · 훼손된 · 합금 — 같은 모양의 접이식 띠. 기본만 펼친 채 시작한다.
    //   ③ 띠 안은 **왼쪽 접두어 | 오른쪽 접미어** 로 자리를 못 박는다. 한쪽이 비어도 자리는 남긴다 —
    //      훼손된처럼 접미어만 있는 풀이 왼쪽에 그려져 접두어로 읽혔다.
    // 접두어·접미어 탭은 한쪽만 보므로 두 열로 가르지 않고 폭이 되는 만큼 흘린다.
    if (tab !== 'prefix' && tab !== 'suffix' && l.corrupted?.length) renderCorrupted(l.corrupted, tab === 'corrupted')
    if (tab !== 'corrupted') {
      const normalCount = tab === 'all' ? (l.prefix?.length ?? 0) + (l.suffix?.length ?? 0) : (l[tab]?.length ?? 0)
      // 기본 속성이 길면(주얼 313개) 종류 묶음을 접은 채 시작한다.
      renderBand({ pool: 'normal', label: '기본' }, l, tab, normalCount <= COLLAPSE_OVER)
      for (const p of BAND_POOLS) renderBand(p, l[p.pool], tab, true)
      // 기원의 나무처럼 메커니즘이 열어 주는 풀 — 이름은 게임 데이터가 준다
      for (const m of l.mechanics ?? []) renderBand({ pool: m.pool, label: m.label, desc: m.desc, mechanic: true }, m, tab, true)
    }
    applySearch()
  }

  /** 타락 — 맨 위 붉은 띠. 게임에서 타락은 붉게 보이고, 일반 속성과 섞여 읽히면 안 된다(사용자 요청 2026-09-16).
   *  전체 탭에서는 접은 채 시작한다 — 처음 보이는 것은 기본 속성이어야 한다(사용자 요청 2026-09-16).
   *  타락 탭은 타락만 보려고 고른 것이라 펼친 채 연다. */
  const renderCorrupted = (list, open) => {
    makeBand({ pool: 'corrupted', label: '타락', meta: `${list.length}개`, defaultOpen: open }, (inner) => {
      const flow = el(doc, 'div', 'ba-affix-flow')
      renderSections(flow, list, true, false)
      inner.appendChild(flow)
    })
  }

  const sideColumn = (label, list, startOpen) => {
    const col = el(doc, 'div', 'ba-affix-srccol')
    // 접두어·접미어는 띠 이름보다 한 단 아래 — 들여 쓴 칩으로 띠 이름과 구분한다(사용자 요청 2026-09-16).
    const h = el(doc, 'div', 'ba-affix-srccol-title')
    h.dataset.side = label === '접두어' ? 'prefix' : 'suffix'
    h.append(el(doc, 'span', 'ba-affix-side-chip', label), el(doc, 'em', null, String(list.length)))
    col.appendChild(h)
    if (list.length) {
      const before = rows.length
      renderSections(col, list, startOpen, false)
      const colRows = rows.slice(before)
      h.appendChild(makeBulk('ba-affix-bulk ba-affix-bulk--col', `${label} 전체 OR`, () => colRows))
    } else {
      col.classList.add('is-empty')
      col.appendChild(el(doc, 'p', 'ba-affix-side-none', `${label}는 붙지 않아요`))
    }
    return col
  }

  // 띠를 펼치고 접은 상태 — 탭·유형을 바꿔도 사용자가 둔 대로 남긴다.
  const bandOpen = new Map()

  /** 공급원 띠 — 기본·에센스·훼손된·합금. 머리를 누르면 펼친다. */
  const renderBand = (p, v, side, sectionsOpen) => {
    const pre = side === 'suffix' ? [] : (v?.prefix ?? [])
    const suf = side === 'prefix' ? [] : (v?.suffix ?? [])
    if (!pre.length && !suf.length) return
    const meta = side === 'all' ? `접두어 ${pre.length} · 접미어 ${suf.length}` : `${side === 'prefix' ? '접두어' : '접미어'} ${pre.length + suf.length}`
    makeBand({ pool: p.pool, label: p.label, desc: p.desc, mechanic: p.mechanic, meta, defaultOpen: p.pool === 'normal' }, (inner) => {
      if (side === 'all') {
        const grid = el(doc, 'div', 'ba-affix-sidegrid')
        grid.append(sideColumn('접두어', pre, sectionsOpen), sideColumn('접미어', suf, sectionsOpen))
        inner.appendChild(grid)
      } else {
        const flow = el(doc, 'div', 'ba-affix-flow')
        renderSections(flow, side === 'prefix' ? pre : suf, sectionsOpen, false)
        inner.appendChild(flow)
      }
    })
  }

  /** 접이식 띠 하나 — 머리(이름 · 개수 · 펼침 표시)와 본문. fill 이 본문에 행을 그린다. */
  const makeBand = ({ pool, label, desc, mechanic, meta, defaultOpen }, fill) => {
    const band = el(doc, 'section', 'ba-affix-band')
    band.dataset.pool = pool
    if (mechanic) band.classList.add('is-mechanic')
    const head = el(doc, 'button', 'ba-affix-band-head')
    head.type = 'button'
    head.append(el(doc, 'span', 'ba-affix-band-name', label))
    if (desc) head.append(el(doc, 'span', 'ba-affix-band-desc', desc))
    // 머리 전체가 누를 수 있는 칩이다 — 오른쪽 둥근 단추에 펼침 표시를 넣어 「누르면 열린다」가 보이게 한다(사용자 요청 2026-09-16)
    const toggle = el(doc, 'span', 'ba-affix-band-toggle')
    toggle.append(el(doc, 'span', 'ba-affix-band-toggle-label'), el(doc, 'span', 'ba-affix-sec-chev'))
    head.append(el(doc, 'span', 'ba-affix-band-meta', meta), toggle)
    const inner = el(doc, 'div', 'ba-affix-band-body')
    const before = rows.length
    fill(inner)
    const b = { el: band, rows: rows.slice(before), startOpen: bandOpen.get(`${pool}|${tab}`) ?? bandOpen.get(pool) ?? defaultOpen }
    b.setOpen = (open) => {
      band.classList.toggle('is-open', open)
      head.setAttribute('aria-expanded', String(open))
      toggle.firstChild.textContent = open ? '접기' : '펼치기'
      inner.hidden = !open
    }
    // 직접 펼치거나 접은 띠는 검색을 지워도, 탭을 바꿔도 그대로 둔다
    head.addEventListener('click', () => { b.startOpen = inner.hidden; bandOpen.set(pool, b.startOpen); b.setOpen(b.startOpen) })
    band.append(head, inner)
    body.appendChild(band)
    b.setOpen(b.startOpen)
    bands.push(b)
  }

  /** 종류별 묶음을 host 에 그린다. */
  const renderSections = (host, items, startOpen, showSource) => {
    for (const group of groupByCategory(items, (it) => it.category)) {
      const sec = el(doc, 'section', 'ba-affix-sec')
      sec.dataset.category = group.key // 종류마다 다른 색을 입힌다(CSS)
      const toggle = el(doc, 'button', 'ba-affix-sec-head')
      toggle.type = 'button'
      toggle.append(el(doc, 'span', 'ba-affix-sec-name', group.label), el(doc, 'span', 'ba-affix-sec-count', String(group.items.length)), el(doc, 'span', 'ba-affix-sec-line'), el(doc, 'span', 'ba-affix-sec-chev'))
      const secBody = el(doc, 'div', 'ba-affix-sec-body')
      const s = { el: sec, rows: [], startOpen }
      // 머리 줄 — 펼침 단추 옆에 이 묶음만 OR 로 표시하는 단추(단추 안에 단추를 둘 수 없어 줄로 감싼다)
      const headRow = el(doc, 'div', 'ba-affix-sec-headrow')
      headRow.append(toggle, makeBulk('ba-affix-bulk', 'OR', () => s.rows))
      s.setOpen = (open) => {
        sec.classList.toggle('is-open', open)
        toggle.setAttribute('aria-expanded', String(open))
        secBody.hidden = !open
      }
      toggle.addEventListener('click', () => s.setOpen(secBody.hidden))
      for (const item of group.items) {
        const r = buildRow(doc, item, { setRow, defaultPick, selected, showSource, twins: (twinPools.get(item.id) ?? []).filter((n) => n !== poolLabel(item)) })
        paintRow(r)
        secBody.appendChild(r.row)
        rows.push(r)
        s.rows.push(r)
      }
      sec.append(headRow, secBody)
      host.appendChild(sec)
      s.setOpen(startOpen)
      sections.push(s)
    }
  }

  const applySearch = () => {
    const term = search.value.trim()
    const shown = new Set(filterAffixes(rows.map((r) => r.item), term))
    for (const r of rows) r.row.hidden = !shown.has(r.item)
    for (const s of sections) {
      const hits = s.rows.filter((r) => !r.row.hidden).length
      // 검색 중에는 맞는 묶음만 펼쳐 보이고, 검색을 지우면 처음 상태로 돌린다.
      s.el.hidden = !!term && hits === 0
      s.setOpen(term ? hits > 0 : s.startOpen)
    }
    for (const b of bands) {
      const hits = b.rows.filter((r) => !r.row.hidden).length
      b.el.hidden = !!term && hits === 0
      b.setOpen(term ? hits > 0 : b.startOpen)
    }
    paintBulks() // 검색으로 대상이 바뀌면 일괄 단추 상태도 바뀐다
  }

  tabBtns.forEach((t) => t.el.addEventListener('click', () => { tab = t.key; render() }))
  search.addEventListener('input', applySearch)
  clearBtn.addEventListener('click', () => {
    selected.clear()
    rows.forEach(paintRow)
    refresh()
  })
  addBtn.addEventListener('click', async () => {
    if (!selected.size) return
    // 고른 순서가 아니라 목록 순서(접두 → 접미 → 타락)로 넣는다 — 체크한 순서는 사용자도 기억하지 못한다.
    // 다른 유형에서 고른 것이 섞이면 유형을 처음 고른 차례대로, 그 안에서는 목록 순서다.
    const chosen = [...selected.values()].sort((a, b) => a.batch - b.batch || a.pos - b.pos)
    // OR 을 나눠 넣으면 접두어·접미어가 각자 개수 그룹으로 간다(타락처럼 접두·접미가 없는 것은 나누지 않는다)
    const roleOf = (p) => (p.role === 'or' && settings.orSplit && (p.item.source === 'prefix' || p.item.source === 'suffix') ? `or:${p.item.source}` : p.role)
    const picks = chosen.map((p) => ({ id: p.item.id, value: affixFilterValue(p.item, p.index), role: roleOf(p) }))
    // 고른 속성이 온 유형들 — 하나뿐이면 부르는 쪽이 거래소 아이템 유형을 그 유형으로 맞출 수 있다
    const classesPicked = [...new Set(chosen.map((p) => p.cls))]
    addBtn.disabled = true
    addBtn.textContent = '넣는 중…'
    try { await onAdd(picks, { classes: classesPicked }) } finally { close() }
  })
  closeBtn.addEventListener('click', () => close())
  scrim.addEventListener('mousedown', () => close())

  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close() } else if (e.key === '/' && doc.activeElement !== search && !search.disabled) {
      e.preventDefault()
      search.focus()
    }
  }
  let closed = false
  function close() {
    if (closed) return
    closed = true
    doc.removeEventListener('keydown', onKey, true)
    hidePageTip() // 행 위에 떠 있던 툴팁 — 행이 사라지면 mouseleave 가 오지 않는다
    pop.remove()
    scrim.remove()
    if (openPop === handle) openPop = null
    if (doc.contains(anchor)) anchor.focus({ preventScroll: true })
  }
  doc.addEventListener('keydown', onKey, true)

  render()
  refresh()
  doc.body.append(scrim, pop)
  place(pop, doc.defaultView)
  if (!search.disabled) search.focus({ preventScroll: true })
  const handle = { el: pop, close }
  openPop = handle
  return handle
}

/** 한 행 — 체크 · 이름 · (호버 시) 필수/OR · 넣을 값. */
function buildRow(doc, item, { setRow, defaultPick, selected, showSource, twins = [] }) {
  const row = el(doc, 'label', 'ba-affix-row')
  if (item.have) row.classList.add('is-have')
  if (!item.tiers) row.classList.add('is-out')
  const box = el(doc, 'input', 'ba-affix-check')
  box.type = 'checkbox'
  box.disabled = item.have
  const name = el(doc, 'span', 'ba-affix-name', item.text)
  // 툴팁은 전부 우리 것(page-tip.js) — 네이티브 title 을 쓰지 않는다(사용자 결정 2026-09-16)
  name.dataset.tip = item.single ? `${item.text}\n값 범위 하나` : `${item.text}\n티어 ${item.tiers}개 · 최고 티어 필요 아이템 레벨 ${item.topLevel}`
  bindPageTip(name, { placement: 'below' })
  const r = { item, row, box, pills: [], roles: [] }
  const current = () => {
    const pick = selected.get(keyOf(item))
    if (!pick) return defaultPick(item)
    // 같은 조건을 다른 줄에서 골랐으면 역할만 이어받고 값은 이 줄 기준으로 다시 고른다
    return pick.item === item ? pick : { role: pick.role, index: defaultPick(item).index }
  }
  const tail = el(doc, 'span', 'ba-affix-tail')

  if (twins.length) {
    // 같은 거래소 조건이 다른 띠에도 있다 — 한 곳만 고르면 된다
    const twin = el(doc, 'span', 'ba-affix-twin', `같은 조건 ${twins.length + 1}곳`)
    twin.dataset.tip = `${twins.join(' · ')} 띠에도 있는 같은 거래소 조건이에요\n한 줄을 고르면 모두 함께 체크되고, 거래소에는 한 번만 들어가요`
    bindPageTip(twin, { placement: 'below' })
    tail.appendChild(twin)
    r.linked = el(doc, 'span', 'ba-affix-linked')
    tail.appendChild(r.linked)
  }
  if (showSource && SOURCE_LABEL[item.source]) {
    const src = el(doc, 'span', 'ba-affix-src', SOURCE_LABEL[item.source])
    if (item.source === 'corrupted') src.classList.add('is-corrupted')
    tail.appendChild(src)
  }
  if (item.have) {
    tail.appendChild(el(doc, 'span', 'ba-affix-have', '추가됨'))
  } else {
    // 평소에는 숨기고 호버·포커스·선택 시에만 보인다(CSS) — 목록이 조용해야 이름이 읽힌다.
    const controls = el(doc, 'span', 'ba-affix-controls')
    for (const role of ROLES) {
      const b = el(doc, 'button', 'ba-affix-role', role.label)
      b.type = 'button'
      b.dataset.role = role.key
      b.dataset.tip = role.tip
      bindPageTip(b, { placement: 'below' })
      b.setAttribute('aria-pressed', 'false')
      b.addEventListener('click', (e) => {
        e.preventDefault() // label 안 버튼 — 체크박스 토글과 섞이지 않게 직접 정한다
        const now = current()
        setRow(r, { index: now.index, role: selected.has(keyOf(item)) && now.role === role.key ? 'here' : role.key })
      })
      r.roles.push(b)
      controls.appendChild(b)
    }
    if (!item.choices.length) controls.appendChild(el(doc, 'span', 'ba-affix-have', '레벨 부족'))
    else {
      const seg = el(doc, 'span', 'ba-affix-tiers')
      item.choices.forEach((c, i) => {
        // 티어가 하나뿐이면 고를 게 없으니 범위를 그대로 보여 준다 — 최소·최대가 함께 들어간다.
        // 에센스·훼손된·합금은 티어 이름이 없고 공급원마다 범위가 달라 범위로 고른다.
        const byRange = item.single || (item.pool && item.pool !== 'normal')
        const pill = el(doc, 'button', 'ba-affix-pill', byRange ? c.range.replace(/ 평균$/, '') : `T${c.t}`)
        pill.type = 'button'
        pill.setAttribute('aria-pressed', 'false')
        pill.dataset.tip = item.single
          ? `최소 ${c.min} · 최대 ${c.max} 를 함께 넣어요`
          : `${c.range} → ${item.fill === 'max' ? '최대' : '최소'} ${c[item.fill]} · 아이템 레벨 ${c.l} 이상`
        bindPageTip(pill, { placement: 'below' })
        pill.addEventListener('click', (e) => {
          e.preventDefault()
          const now = current()
          setRow(r, { role: now.role, index: selected.has(keyOf(item)) && now.index === i ? -1 : i })
        })
        r.pills.push(pill)
        seg.appendChild(pill)
      })
      controls.appendChild(seg)
    }
    tail.appendChild(controls)
  }
  box.addEventListener('change', () => setRow(r, box.checked ? defaultPick(item) : undefined))
  row.append(box, name, tail)
  return r
}

/** 화면 가운데 시트 — 목록을 스크롤 없이 펼치려면 그룹 옆 좁은 자리로는 모자라다(사용자 결정 2026-09-15). */
function place(pop, win) {
  const vw = win.innerWidth || 1280
  // 1180 에서는 반경 주얼 문구(「반경 내 주요 패시브 스킬이 … 부여」)가 두 줄로 꺾였다(2026-09-16 피드백) — 넓은 화면에서는 더 편다
  const width = Math.min(1480, vw - 48)
  pop.style.width = width + 'px'
  pop.style.left = Math.round((vw - width) / 2) + 'px'
  pop.style.top = '40px'
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}
