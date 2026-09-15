// src/content/affix-picker.js
// 능력치 그룹의 「+ 능력치 필터 추가」 옆 「속성 목록」 버튼과, 누르면 뜨는 접두어·접미어 팝오버.
//
// 넣을 곳은 **누른 버튼의 그룹**이다 — 따로 고르게 하면 엉뚱한 그룹에 넣는 실수가 생긴다(시안 A 결정, 2026-09-15).
// 실제로 넣는 일은 MAIN world 의 stat-adder.js 가 한다. 이 파일은 DOM 과 사용자 선택만 다룬다.

import { filterAffixes, affixFilterValue } from '../lib/affixList.js'

export const AFFIX_BTN_CLASS = 'ba-affix-btn'
export const AFFIX_POP_CLASS = 'ba-affix-pop'
const ADD_PLACEHOLDERS = ['능력치 필터 추가', 'Add Stat Filter']

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
 * 그룹마다 버튼을 한 번만 붙인다. 화면이 다시 그려져 버튼이 사라지면 다음 호출에서 되살아난다.
 * @param {ParentNode} root
 * @param {{onOpen:(group:HTMLElement, button:HTMLButtonElement)=>void}} ctx
 * @returns {number} 붙어 있는 버튼 수
 */
export function attachAffixButtons(root, { onOpen }) {
  let count = 0
  for (const input of statAddInputs(root)) {
    const group = input.closest('.filter-group')
    const bar = input.closest('.filter')
    if (!group || !bar) continue
    count++
    if (bar.querySelector('.' + AFFIX_BTN_CLASS)) continue
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = AFFIX_BTN_CLASS
    btn.textContent = '속성 목록'
    btn.title = '이 아이템 유형에 붙는 접두어·접미어를 보고 이 그룹에 넣기'
    btn.setAttribute('aria-haspopup', 'dialog')
    // 거래소 드롭다운이 mousedown 으로 열리므로 여기서 끊는다 — 안 끊으면 버튼을 누를 때 목록이 같이 열린다.
    btn.addEventListener('mousedown', (e) => e.stopPropagation())
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onOpen(group, btn)
    })
    bar.appendChild(btn)
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

/**
 * 팝오버를 연다. 이미 열린 것은 닫는다.
 * @param {object} args
 * @param {HTMLElement} args.anchor 누른 버튼
 * @param {string} args.title 헤더 제목 (그룹 이름)
 * @param {string} args.subtitle 헤더 설명 (유형·레벨)
 * @param {{status:string, prefix:object[], suffix:object[]}} args.list affixListFor 결과
 * @param {(picks:Array<{id:string, value:{min?:number,max?:number}|null}>)=>Promise<void>|void} args.onAdd
 */
export function openAffixPopover({ anchor, title, subtitle, list, onAdd }) {
  closeAffixPopover()
  const doc = anchor.ownerDocument
  const pop = doc.createElement('div')
  pop.className = AFFIX_POP_CLASS
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', `${title}에 속성 넣기`)

  const head = el(doc, 'div', 'ba-affix-head')
  const titles = el(doc, 'div', 'ba-affix-titles')
  titles.append(el(doc, 'div', 'ba-affix-title', `${title}에 넣기`), el(doc, 'div', 'ba-affix-sub', subtitle))
  const search = el(doc, 'input', 'ba-affix-search')
  search.type = 'search'
  search.placeholder = '속성 검색'
  search.setAttribute('aria-label', '속성 검색')
  const closeBtn = el(doc, 'button', 'ba-affix-close', '✕')
  closeBtn.type = 'button'
  closeBtn.setAttribute('aria-label', '닫기')
  head.append(titles, search, closeBtn)
  pop.appendChild(head)

  // id → 고른 값의 인덱스(item.choices). 체크했지만 값을 안 골랐으면 -1 = 빈칸으로 넣는다.
  const selected = new Map()
  const rows = [] // {item, row, box, pills}
  const foot = el(doc, 'div', 'ba-affix-foot')
  const countEl = el(doc, 'span', 'ba-affix-count')
  const clearBtn = el(doc, 'button', 'ba-affix-clear', '선택 해제')
  clearBtn.type = 'button'
  const addBtn = el(doc, 'button', 'ba-affix-add')
  addBtn.type = 'button'

  const refresh = () => {
    const n = selected.size
    const valued = [...selected.values()].filter((i) => i >= 0).length
    countEl.textContent = n ? `${n}개 선택${valued ? ` · 값 ${valued}개` : ''}` : '넣을 속성을 체크하세요'
    addBtn.textContent = n ? `선택한 ${n}개 넣기` : '넣기'
    addBtn.disabled = n === 0
    clearBtn.hidden = n === 0
  }
  /** 한 행의 선택 상태를 화면에 반영한다. index: undefined = 선택 안 함, -1 = 빈칸, 0.. = 값 */
  const setRow = (r, index) => {
    if (index === undefined) selected.delete(r.item.id)
    else selected.set(r.item.id, index)
    r.box.checked = index !== undefined
    r.row.classList.toggle('is-on', index !== undefined)
    r.pills.forEach((p, i) => {
      p.classList.toggle('is-on', i === index)
      p.setAttribute('aria-pressed', String(i === index))
    })
    refresh()
  }

  if (list.status !== 'ok') {
    pop.appendChild(el(doc, 'p', 'ba-affix-empty', '아이템 유형을 먼저 고르면, 그 유형에 붙는 접두어·접미어를 보여 드려요.'))
    search.disabled = true
  } else {
    const cols = el(doc, 'div', 'ba-affix-cols')
    for (const [label, items] of [['접두어', list.prefix], ['접미어', list.suffix]]) {
      const col = el(doc, 'div', 'ba-affix-col')
      col.appendChild(el(doc, 'div', 'ba-affix-col-title', `${label} ${items.length}`))
      const ul = el(doc, 'div', 'ba-affix-list')
      for (const item of items) {
        const row = el(doc, 'label', 'ba-affix-row')
        if (item.have) row.classList.add('is-have')
        if (!item.tiers) row.classList.add('is-out')
        const box = el(doc, 'input', 'ba-affix-check')
        box.type = 'checkbox'
        box.disabled = item.have
        const name = el(doc, 'span', 'ba-affix-name', item.text)
        name.title = item.single
          ? '티어가 하나뿐인 속성'
          : `티어 ${item.tiers}개 · 최고 티어 필요 아이템 레벨 ${item.topLevel}`
        const meta = el(doc, 'span', 'ba-affix-meta')
        const r = { item, row, box, pills: [] }
        if (item.have) meta.appendChild(el(doc, 'span', 'ba-affix-have', '추가됨'))
        else if (!item.choices.length) meta.appendChild(el(doc, 'span', 'ba-affix-have', '레벨 부족'))
        else {
          item.choices.forEach((c, i) => {
            // 티어가 하나뿐이면 고를 게 없으니 범위를 그대로 보여 준다 — 누르면 최소·최대가 함께 들어간다.
            const pill = el(doc, 'button', 'ba-affix-pill', item.single ? c.range.replace(/ 평균$/, '') : `T${c.t}`)
            pill.type = 'button'
            pill.setAttribute('aria-pressed', 'false')
            pill.title = item.single
              ? `최소 ${c.min} · 최대 ${c.max} 를 함께 넣어요`
              : `${c.range} → ${item.fill === 'max' ? '최대' : '최소'} ${c[item.fill]} · 아이템 레벨 ${c.l} 이상`
            pill.addEventListener('click', (e) => {
              e.preventDefault() // label 안 버튼 — 체크박스 토글과 섞이지 않게 직접 정한다
              setRow(r, selected.get(item.id) === i ? -1 : i)
            })
            r.pills.push(pill)
            meta.appendChild(pill)
          })
        }
        box.addEventListener('change', () => {
          // 티어가 하나뿐인 속성은 체크만 해도 그 범위를 넣는다 — 고를 것이 없다.
          setRow(r, box.checked ? (item.single && item.choices.length ? 0 : -1) : undefined)
        })
        row.append(box, name, meta)
        ul.appendChild(row)
        rows.push(r)
      }
      if (!items.length) ul.appendChild(el(doc, 'div', 'ba-affix-none', '없음'))
      col.appendChild(ul)
      cols.appendChild(col)
    }
    pop.appendChild(cols)
    foot.append(el(doc, 'span', 'ba-affix-legend', 'T1~T3 를 누르면 그 티어 값을, 범위를 누르면 최소·최대를 함께 넣어요'))
  }

  foot.append(countEl, clearBtn, addBtn)
  pop.appendChild(foot)
  refresh()

  search.addEventListener('input', () => {
    const shown = new Set(filterAffixes(rows.map((r) => r.item), search.value))
    for (const r of rows) r.row.hidden = !shown.has(r.item)
  })
  clearBtn.addEventListener('click', () => {
    for (const r of rows) if (selected.has(r.item.id)) setRow(r, undefined)
  })
  addBtn.addEventListener('click', async () => {
    if (!selected.size) return
    // 목록 순서(접두어 → 접미어)로 넣는다 — 체크한 순서는 사용자도 기억하지 못한다.
    const picks = rows
      .filter((r) => selected.has(r.item.id))
      .map((r) => ({ id: r.item.id, value: affixFilterValue(r.item, selected.get(r.item.id)) }))
    addBtn.disabled = true
    addBtn.textContent = '넣는 중…'
    try { await onAdd(picks) } finally { close() }
  })
  closeBtn.addEventListener('click', () => close())

  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
  const onDown = (e) => {
    const path = e.composedPath ? e.composedPath() : []
    if (path.includes(pop) || path.includes(anchor)) return
    close()
  }
  let closed = false
  function close() {
    if (closed) return
    closed = true
    doc.removeEventListener('keydown', onKey, true)
    doc.removeEventListener('mousedown', onDown, true)
    pop.remove()
    if (openPop === handle) openPop = null
    if (doc.contains(anchor)) anchor.focus({ preventScroll: true })
  }
  doc.addEventListener('keydown', onKey, true)
  doc.addEventListener('mousedown', onDown, true)

  doc.body.appendChild(pop)
  place(pop, anchor)
  if (!search.disabled) search.focus({ preventScroll: true })
  const handle = { el: pop, close }
  openPop = handle
  return handle
}

/** 누른 버튼이 속한 그룹 바로 아래에 둔다. 화면 밖으로 나가면 안쪽으로 당긴다. */
function place(pop, anchor) {
  const win = anchor.ownerDocument.defaultView
  const group = anchor.closest('.filter-group') || anchor
  const a = anchor.getBoundingClientRect()
  const g = group.getBoundingClientRect()
  const vw = win.innerWidth || 1024
  const width = Math.min(880, vw - 32) // 행마다 티어 버튼이 붙어 두 열이 760px 에서는 이름이 과하게 접힌다
  pop.style.width = width + 'px'
  const left = Math.max(16, Math.min(g.left, vw - width - 16))
  pop.style.left = Math.round(left + win.scrollX) + 'px'
  pop.style.top = Math.round(a.bottom + win.scrollY + 6) + 'px'
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}
