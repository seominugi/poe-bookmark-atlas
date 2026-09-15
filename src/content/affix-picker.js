// src/content/affix-picker.js
// 「+ 능력치 필터 추가」 글자 옆 「속성 목록」 칩과, 누르면 뜨는 글래스 시트.
//
// 넣을 곳은 기본으로 **누른 칩의 그룹**이다 — 따로 고르게 하면 엉뚱한 그룹에 넣는 실수가 생긴다(시안 A, 2026-09-15).
// 행에 「필수」·「OR」 을 표시하면 그 속성만 조건에 맞는 그룹으로 간다(stat-adder.js 가 그룹을 찾거나 만든다).
// 디자인: 글래스 시안 1번(가운데 시트) + 트리거는 티어 칩 모양(사용자 결정 2026-09-15).
// 실제로 넣는 일은 MAIN world 의 stat-adder.js 가 한다. 이 파일은 DOM 과 사용자 선택만 다룬다.

import { filterAffixes, affixFilterValue } from '../lib/affixList.js'
import { groupByCategory } from '../lib/affixCategory.js'

export const AFFIX_BTN_CLASS = 'ba-affix-btn'
export const AFFIX_POP_CLASS = 'ba-affix-pop'
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
 * 자리는 **추가 줄의 「+ 능력치 필터 추가」 글자 바로 오른쪽**이다 — 티어 칩처럼 글자에 붙은 작은 칩으로 보이게.
 * 헤더 제목 뒤에 두었더니 밑줄에 붙어 간격이 없었고(2026-09-15 피드백), 줄 오른쪽 끝에 두면 드롭다운 화살표와 겹쳤다.
 * 글자는 입력칸의 placeholder 라 요소가 없으므로 글자 폭을 재서 그 오른쪽에 둔다(`placeChip`).
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
    let btn = bar.querySelector(':scope > .' + AFFIX_BTN_CLASS)
    if (!btn) {
      btn = document.createElement('button')
      btn.type = 'button'
      btn.className = AFFIX_BTN_CLASS
      btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>속성 목록</span>'
      btn.title = '이 아이템 유형에 붙는 속성을 보고 이 그룹에 넣기'
      btn.setAttribute('aria-haspopup', 'dialog')
      // 거래소 드롭다운이 mousedown 으로 열리므로 여기서 끊는다 — 안 끊으면 칩을 누를 때 목록이 같이 열린다.
      btn.addEventListener('mousedown', (e) => e.stopPropagation())
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpen(group, btn)
      })
      bar.appendChild(btn)
    }
    placeChip(btn, input, bar)
  }
  return count
}

/** placeholder 글자의 오른쪽 끝 + 10px 에 칩을 둔다. 폭을 못 재면(테스트 환경 등) 줄 가운데 오른쪽으로 둔다. */
function placeChip(btn, input, bar) {
  const doc = input.ownerDocument
  const barRect = bar.getBoundingClientRect()
  const inRect = input.getBoundingClientRect()
  let textWidth = 0
  try {
    const ctx = (placeChip.canvas ||= doc.createElement('canvas')).getContext('2d')
    const cs = doc.defaultView.getComputedStyle(input)
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    textWidth = ctx.measureText(input.getAttribute('placeholder') || '').width
  } catch (_) { /* 폭을 못 재면 0 — 아래 폴백 */ }
  const center = inRect.left + inRect.width / 2 - barRect.left
  const left = Math.round(center + (textWidth ? textWidth / 2 + 10 : 60))
  if (btn.style.left !== left + 'px') btn.style.left = left + 'px'
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
 * @param {(cls:string)=>object} [args.listForClass] 유형 칩을 눌렀을 때 그 유형의 목록
 * @param {(picks:Array<{id:string, value:{min?:number,max?:number}|null, role:'here'|'and'|'or'}>)=>Promise<void>|void} args.onAdd
 */
export function openAffixPopover({ anchor, title, subtitle, list, classes = [], currentClass = null, listForClass, onAdd }) {
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

  // ── 유형 칩 줄 ──
  const typeRow = el(doc, 'div', 'ba-affix-types')
  const typeBtns = classes.map((c) => {
    const b = el(doc, 'button', 'ba-affix-type', c.label)
    b.type = 'button'
    b.dataset.cls = c.cls
    typeRow.appendChild(b)
    return b
  })
  if (classes.length) pop.appendChild(typeRow)

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
  foot.append(hint, countEl, clearBtn, addBtn)
  pop.appendChild(foot)

  // id → { index: 고른 값(-1 = 빈칸), role, item } — 유형을 바꿔도 고른 것은 남는다.
  const selected = new Map()
  let rows = [] // {item, row, box, pills, roles}
  let sections = [] // {el, rows, setOpen, startOpen}
  let tab = 'all'
  let current = { cls: currentClass, list }

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
    countEl.innerHTML = ''
    if (n) {
      countEl.append(el(doc, 'b', null, String(n)), `개 선택${parts.length ? ' · ' + parts.join(' · ') : ''}`)
    } else countEl.textContent = '넣을 속성을 체크하세요'
    addBtn.textContent = n ? `${n}개 넣기` : '넣기'
    addBtn.disabled = n === 0
    clearBtn.hidden = n === 0
  }
  /** 목록 안 위치 — 넣는 순서를 체크한 순서가 아니라 목록 순서(접두 → 접미 → 타락)로 맞추는 데 쓴다. */
  const posOf = (item) => {
    const l = current.list
    const i = [...(l.prefix ?? []), ...(l.suffix ?? []), ...(l.corrupted ?? [])].indexOf(item)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const classOrder = new Map() // 유형 → 처음 고른 차례
  const setRow = (r, pick) => {
    if (pick === undefined) selected.delete(r.item.id)
    else {
      const prev = selected.get(r.item.id)
      const clsKey = current.cls ?? ''
      if (!classOrder.has(clsKey)) classOrder.set(clsKey, classOrder.size)
      selected.set(r.item.id, { ...pick, item: r.item, pos: prev?.pos ?? posOf(r.item), batch: prev?.batch ?? classOrder.get(clsKey) })
    }
    paintRow(r)
    refresh()
  }
  const paintRow = (r) => {
    const pick = selected.get(r.item.id)
    r.box.checked = !!pick
    r.row.classList.toggle('is-on', !!pick)
    r.pills.forEach((p, i) => {
      const on = pick?.index === i
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

  /** 지금 유형·탭으로 본문을 다시 그린다. 고른 것(selected)은 그대로 둔다. */
  const render = () => {
    const l = current.list
    typeBtns.forEach((b) => {
      const on = b.dataset.cls === current.cls
      b.classList.toggle('is-on', on)
      b.setAttribute('aria-pressed', String(on))
    })
    body.innerHTML = ''
    rows = []
    sections = []
    const counts = {
      all: (l.prefix?.length ?? 0) + (l.suffix?.length ?? 0) + (l.corrupted?.length ?? 0),
      prefix: l.prefix?.length ?? 0, suffix: l.suffix?.length ?? 0, corrupted: l.corrupted?.length ?? 0,
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
    const all = [...l.prefix, ...l.suffix, ...(l.corrupted ?? [])]
    const items = tab === 'all' ? all : (l[tab] ?? [])
    const startOpen = items.length <= COLLAPSE_OVER
    if (!items.length) {
      body.appendChild(el(doc, 'div', 'ba-affix-none', '이 유형에는 없어요'))
      return
    }
    // 전체 탭: 접두어 | 접미어 | 타락 을 상위 열로 먼저 가르고, 그 안에서 종류별로 묶는다(사용자 요청 2026-09-15).
    // 한 출처만 보는 탭: 종류 묶음을 폭이 되는 만큼 여러 열로 흘린다.
    if (tab === 'all') {
      const cols = el(doc, 'div', 'ba-affix-srccols')
      for (const t of TABS.slice(1)) {
        const list = l[t.key] ?? []
        if (!list.length) continue
        const col = el(doc, 'div', 'ba-affix-srccol')
        const h = el(doc, 'div', 'ba-affix-srccol-title')
        h.append(t.label, el(doc, 'em', null, String(list.length)))
        if (t.key === 'corrupted') col.classList.add('is-corrupted')
        col.appendChild(h)
        renderSections(col, list, startOpen, false)
        cols.appendChild(col)
      }
      body.appendChild(cols)
    } else {
      const flow = el(doc, 'div', 'ba-affix-flow')
      renderSections(flow, items, startOpen, false)
      body.appendChild(flow)
    }
    applySearch()
  }

  /** 종류별 묶음을 host 에 그린다. */
  const renderSections = (host, items, startOpen, showSource) => {
    for (const group of groupByCategory(items, (it) => it.category)) {
      const sec = el(doc, 'section', 'ba-affix-sec')
      const toggle = el(doc, 'button', 'ba-affix-sec-head')
      toggle.type = 'button'
      toggle.append(el(doc, 'span', 'ba-affix-sec-name', group.label), el(doc, 'span', 'ba-affix-sec-count', String(group.items.length)), el(doc, 'span', 'ba-affix-sec-line'), el(doc, 'span', 'ba-affix-sec-chev'))
      const secBody = el(doc, 'div', 'ba-affix-sec-body')
      const s = { el: sec, rows: [], startOpen }
      s.setOpen = (open) => {
        sec.classList.toggle('is-open', open)
        toggle.setAttribute('aria-expanded', String(open))
        secBody.hidden = !open
      }
      toggle.addEventListener('click', () => s.setOpen(secBody.hidden))
      for (const item of group.items) {
        const r = buildRow(doc, item, { setRow, defaultPick, selected, showSource })
        paintRow(r)
        secBody.appendChild(r.row)
        rows.push(r)
        s.rows.push(r)
      }
      sec.append(toggle, secBody)
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
  }

  tabBtns.forEach((t) => t.el.addEventListener('click', () => { tab = t.key; render() }))
  typeBtns.forEach((b) => b.addEventListener('click', () => {
    if (!listForClass || b.dataset.cls === current.cls) return
    current = { cls: b.dataset.cls, list: listForClass(b.dataset.cls) }
    render()
  }))
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
    const picks = [...selected.values()]
      .sort((a, b) => a.batch - b.batch || a.pos - b.pos)
      .map((p) => ({ id: p.item.id, value: affixFilterValue(p.item, p.index), role: p.role }))
    addBtn.disabled = true
    addBtn.textContent = '넣는 중…'
    try { await onAdd(picks) } finally { close() }
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
function buildRow(doc, item, { setRow, defaultPick, selected, showSource }) {
  const row = el(doc, 'label', 'ba-affix-row')
  if (item.have) row.classList.add('is-have')
  if (!item.tiers) row.classList.add('is-out')
  const box = el(doc, 'input', 'ba-affix-check')
  box.type = 'checkbox'
  box.disabled = item.have
  const name = el(doc, 'span', 'ba-affix-name', item.text)
  name.title = item.single ? `${item.text}\n값 범위 하나` : `${item.text}\n티어 ${item.tiers}개 · 최고 티어 필요 아이템 레벨 ${item.topLevel}`
  const r = { item, row, box, pills: [], roles: [] }
  const current = () => selected.get(item.id) ?? defaultPick(item)
  const tail = el(doc, 'span', 'ba-affix-tail')

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
      b.title = role.tip
      b.setAttribute('aria-pressed', 'false')
      b.addEventListener('click', (e) => {
        e.preventDefault() // label 안 버튼 — 체크박스 토글과 섞이지 않게 직접 정한다
        const now = current()
        setRow(r, { index: now.index, role: selected.has(item.id) && now.role === role.key ? 'here' : role.key })
      })
      r.roles.push(b)
      controls.appendChild(b)
    }
    if (!item.choices.length) controls.appendChild(el(doc, 'span', 'ba-affix-have', '레벨 부족'))
    else {
      const seg = el(doc, 'span', 'ba-affix-tiers')
      item.choices.forEach((c, i) => {
        // 티어가 하나뿐이면 고를 게 없으니 범위를 그대로 보여 준다 — 최소·최대가 함께 들어간다.
        const pill = el(doc, 'button', 'ba-affix-pill', item.single ? c.range.replace(/ 평균$/, '') : `T${c.t}`)
        pill.type = 'button'
        pill.setAttribute('aria-pressed', 'false')
        pill.title = item.single
          ? `최소 ${c.min} · 최대 ${c.max} 를 함께 넣어요`
          : `${c.range} → ${item.fill === 'max' ? '최대' : '최소'} ${c[item.fill]} · 아이템 레벨 ${c.l} 이상`
        pill.addEventListener('click', (e) => {
          e.preventDefault()
          const now = current()
          setRow(r, { role: now.role, index: selected.has(item.id) && now.index === i ? -1 : i })
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
  const width = Math.min(1180, vw - 48)
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
