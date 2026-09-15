// src/content/affix-picker.js
// 능력치 그룹의 「+ 능력치 필터 추가」 옆 「속성 목록」 버튼과, 누르면 뜨는 접두어·접미어 팝오버.
//
// 넣을 곳은 **누른 버튼의 그룹**이다 — 따로 고르게 하면 엉뚱한 그룹에 넣는 실수가 생긴다(시안 A 결정, 2026-09-15).
// 실제로 넣는 일은 MAIN world 의 stat-adder.js 가 한다. 이 파일은 DOM 과 사용자 선택만 다룬다.

import { filterAffixes } from '../lib/affixList.js'

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
 * @param {(ids:string[])=>Promise<void>|void} args.onAdd
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

  const selected = new Set()
  const rows = [] // {item, row, box}
  const foot = el(doc, 'div', 'ba-affix-foot')
  const countEl = el(doc, 'span', 'ba-affix-count')
  const clearBtn = el(doc, 'button', 'ba-affix-clear', '선택 해제')
  clearBtn.type = 'button'
  const addBtn = el(doc, 'button', 'ba-affix-add')
  addBtn.type = 'button'

  const refresh = () => {
    const n = selected.size
    countEl.textContent = n ? `${n}개 선택` : '넣을 속성을 체크하세요'
    addBtn.textContent = n ? `선택한 ${n}개 넣기` : '넣기'
    addBtn.disabled = n === 0
    clearBtn.hidden = n === 0
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
        box.addEventListener('change', () => {
          if (box.checked) selected.add(item.id)
          else selected.delete(item.id)
          row.classList.toggle('is-on', box.checked)
          refresh()
        })
        const name = el(doc, 'span', 'ba-affix-name', item.text)
        const meta = el(doc, 'span', 'ba-affix-meta')
        if (item.have) meta.appendChild(el(doc, 'span', 'ba-affix-have', '추가됨'))
        const tier = el(doc, 'span', 'ba-affix-tier', String(item.tiers))
        tier.title = item.tiers ? `닿는 티어 ${item.tiers}개` : '아이템 레벨 상한으로는 붙지 않아요'
        const lv = el(doc, 'span', 'ba-affix-lv', String(item.topLevel))
        lv.title = `최고 티어 필요 아이템 레벨 ${item.topLevel}`
        meta.append(tier, lv)
        row.append(box, name, meta)
        ul.appendChild(row)
        rows.push({ item, row, box })
      }
      if (!items.length) ul.appendChild(el(doc, 'div', 'ba-affix-none', '없음'))
      col.appendChild(ul)
      cols.appendChild(col)
    }
    pop.appendChild(cols)
    const legend = el(doc, 'span', 'ba-affix-legend')
    legend.append(el(doc, 'span', 'ba-affix-tier', 'T'), ' 닿는 티어 수 ', el(doc, 'span', 'ba-affix-lv', 'Lv'), ' 최고 티어 필요 레벨')
    foot.append(legend)
  }

  foot.append(countEl, clearBtn, addBtn)
  pop.appendChild(foot)
  refresh()

  search.addEventListener('input', () => {
    const shown = new Set(filterAffixes(rows.map((r) => r.item), search.value))
    for (const r of rows) r.row.hidden = !shown.has(r.item)
  })
  clearBtn.addEventListener('click', () => {
    for (const r of rows) { r.box.checked = false; r.row.classList.remove('is-on') }
    selected.clear()
    refresh()
  })
  addBtn.addEventListener('click', async () => {
    if (!selected.size) return
    // 목록 순서(접두어 → 접미어)로 넣는다 — 체크한 순서는 사용자도 기억하지 못한다.
    const ids = rows.map((r) => r.item.id).filter((id) => selected.has(id))
    addBtn.disabled = true
    addBtn.textContent = '넣는 중…'
    try { await onAdd(ids) } finally { close() }
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
  const width = Math.min(760, vw - 32)
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
