// src/content/unique-pane.js
// 속성 목록 창의 「고유」 모드 본문 — 왼쪽 고유 이름 목록, 오른쪽 고른 고유의 속성(시안 B, 사용자 결정 2026-09-23).
// 사용자는 원하는 고유를 **이름으로 검색해** 찾는다. 그래서 검색어가 있으면 유형을 가리지 않고 찾는다(uniqueList.findUniques).
//
// 한 번에 고유 하나만 고른다 — 이름 하나로 검색하는 거래소 조건이라 두 고유의 속성을 섞으면 결과가 비어 버린다.
// 다른 고유의 줄을 고르면 앞 고유에서 고른 것은 풀린다.
//
// 바알 함양 줄(빨강)을 고르면 넣을 때 기타 필터 「함양된 바알 고유: 예」도 함께 켠다(부르는 쪽).
// 함양 오브는 속성을 **최대 2개까지** 바꾼다(오브 설명) — 빨간 줄 둘을 모두 필수로 둘 수 있다.

import { findUniques, lineState, lineRange, cleanLineValue, uniqueKey } from '../lib/uniqueList.js'
import { bindPageTip } from './page-tip.js'

const STATE_TIP = {
  const: '모든 매물에 같은 값으로 붙어 있어 걸러도 결과가 같아요',
  alt: '문구가 같은 거래소 조건이 둘이라 아직 어느 쪽인지 몰라요\n매물에서 확인한 뒤 고를 수 있게 할 예정이에요',
  random: '아이템마다 다른 속성이 무작위로 붙어요\n매물에서 찾기로 채울 예정이에요',
  none: '거래소에서 이 문구의 조건을 찾지 못했어요',
}
const ROLE_TIP = {
  and: '필수 — 고른 속성이 모두 붙은 매물을 찾아요',
  or: '후보 — 후보 중 하나 이상 붙은 매물을 찾아요',
}

/**
 * @param {Document} doc
 * @param {{table:{u:object[]}, onChange:()=>void}} args
 */
export function createUniquePane(doc, { table, onChange }) {
  const root = el(doc, 'div', 'ba-uq')
  const listEl = el(doc, 'div', 'ba-uq-list')
  listEl.setAttribute('role', 'listbox')
  listEl.setAttribute('aria-label', '고유 아이템')
  const detail = el(doc, 'div', 'ba-uq-detail')
  root.append(listEl, detail)

  let term = ''
  let cls = null
  let shown = []
  let active = null // 오른쪽에 보이는 고유(표 항목)
  let showMf = false // 함양판 고정 속성 목록을 펼쳤나
  // 고른 줄 — 키 `${kind}|${순번}`. 고른 고유는 하나라 고유 키는 따로 쥔다.
  let pickedUnique = null
  const picked = new Map() // key → { kind, line, role, min, max }

  const changed = () => { try { onChange?.() } catch (_) { /* 발 갱신 실패가 창을 막지 않게 */ } }

  function setQuery(nextTerm, nextCls) {
    term = nextTerm ?? ''
    cls = nextCls ?? null
    shown = findUniques(table, term, cls)
    // 고른 고유가 목록에 남아 있으면 그대로, 아니면 첫 항목을 보인다(검색 중 오른쪽이 비지 않게)
    if (!active || !shown.includes(active)) active = shown.find((e) => pickedUnique && uniqueKey(e) === pickedUnique) ?? shown[0] ?? null
    renderList()
    renderDetail()
  }

  function renderList() {
    listEl.innerHTML = ''
    if (!shown.length) {
      listEl.appendChild(el(doc, 'p', 'ba-uq-empty', term ? '검색에 맞는 고유 아이템이 없어요' : '위에서 유형을 고르거나 이름을 검색하세요'))
      return
    }
    for (const e of shown) {
      const b = el(doc, 'button', 'ba-uq-item')
      b.type = 'button'
      b.setAttribute('role', 'option')
      const on = e === active
      b.setAttribute('aria-selected', String(on))
      b.classList.toggle('is-on', on)
      if (pickedUnique === uniqueKey(e)) b.classList.add('has-picks')
      const text = el(doc, 'span', 'ba-uq-item-text')
      text.append(el(doc, 'b', 'ba-uq-item-name', e.n), el(doc, 'small', 'ba-uq-item-base', e.b))
      b.appendChild(text)
      const marks = el(doc, 'span', 'ba-uq-item-marks')
      if (e.m?.length) marks.appendChild(el(doc, 'i', 'ba-uq-dot', null)).setAttribute('aria-label', '바알 함양 속성 있음')
      if (e.x) marks.appendChild(el(doc, 'i', 'ba-uq-corrupt', '타락'))
      b.appendChild(marks)
      b.addEventListener('click', () => { active = e; showMf = false; renderList(); renderDetail() })
      listEl.appendChild(b)
    }
  }

  function renderDetail() {
    detail.innerHTML = ''
    const e = active
    if (!e) return
    const head = el(doc, 'div', 'ba-uq-head')
    head.append(el(doc, 'h3', 'ba-uq-name', e.n), el(doc, 'span', 'ba-uq-base', e.b))
    if (e.x) head.appendChild(el(doc, 'span', 'ba-uq-corrupt', '타락 고유'))
    detail.appendChild(head)
    const note = el(doc, 'p', 'ba-uq-note', '값을 넣은 줄만 걸러져요 · 빈칸이면 그 속성이 붙은 것만 봐요')
    detail.appendChild(note)
    const cols = el(doc, 'div', 'ba-uq-cols')
    cols.setAttribute('aria-hidden', 'true')
    cols.append(el(doc, 'span', null, ''), el(doc, 'span', null, '속성'), el(doc, 'span', null, '최소'), el(doc, 'span', null, '최대'), el(doc, 'span', null, '역할'))
    detail.appendChild(cols)
    section(e, 'i', '기본 속성')
    section(e, 'f', '고정 속성')
    if (e.m?.length) {
      section(e, 'm', '바알 함양 — 최대 2개까지 이 중에서 바뀌어요', { mutated: true })
      if (e.mf?.length) {
        const t = el(doc, 'button', 'ba-uq-mf-toggle', showMf ? '함양판 고정 속성 접기' : '함양판에 적힌 고정 속성 보기')
        t.type = 'button'
        t.dataset.tip = '함양된 매물은 고정 속성이 위 목록과 조금 다를 수 있어요\n(poe2db 함양판 기준 — 매물로 확인 전)'
        bindPageTip(t, { placement: 'below' })
        t.addEventListener('click', () => { showMf = !showMf; renderDetail() })
        detail.appendChild(t)
        if (showMf) section(e, 'mf', '함양판 고정 속성')
      }
    }
  }

  function section(e, kind, label, { mutated = false } = {}) {
    const lines = e[kind] ?? []
    if (!lines.length) return
    const sec = el(doc, 'section', 'ba-uq-sec')
    sec.dataset.kind = kind
    sec.appendChild(el(doc, 'h4', 'ba-uq-sec-title', label))
    lines.forEach((line, i) => sec.appendChild(row(e, kind, line, i, mutated)))
    detail.appendChild(sec)
  }

  function row(e, kind, line, i, mutated) {
    const state = lineState(line, kind)
    const key = `${kind}|${i}`
    const mine = pickedUnique === uniqueKey(e) ? picked.get(key) : null
    const r = el(doc, 'label', 'ba-uq-row')
    r.dataset.kind = kind
    r.dataset.state = state
    r.classList.toggle('is-on', !!mine)
    const box = el(doc, 'input', 'ba-uq-check')
    box.type = 'checkbox'
    box.checked = !!mine
    box.disabled = state !== 'ok'
    const text = el(doc, 'span', 'ba-uq-text', line.t.replace(/\n/g, ' / '))
    if (state !== 'ok') { text.dataset.tip = STATE_TIP[state]; bindPageTip(text, { placement: 'below' }) }
    const range = state === 'ok' ? lineRange(line) : null
    // 값이 하나뿐인 줄(바알 함양 「접근 효과 범위 100% 감소」)은 붙었는지만 본다 — 칸을 끈다
    const valued = !!range && range.min !== range.max
    // 거래소는 감소를 「증가」 조건의 음수로 받는다(20% 감소 = -20) — 칸에 음수가 보이는 이유를 알린다
    const negTip = valued && range.max <= 0 && /감소|감폭|감속/.test(line.t) ? '거래소는 감소를 음수로 받아요\n예) 20% 감소 → -20' : null
    const num = (k) => {
      const input = el(doc, 'input', 'ba-uq-num')
      input.type = 'number'
      input.inputMode = 'decimal'
      input.setAttribute('aria-label', `${line.t} ${k === 'min' ? '최소' : '최대'}`)
      input.disabled = state !== 'ok' || !valued
      if (valued) input.placeholder = String(range[k])
      if (negTip) { input.dataset.tip = negTip; bindPageTip(input, { placement: 'below' }) }
      if (mine?.[k] != null) input.value = String(mine[k])
      // 값을 치면 그 줄을 고른 것으로 본다 — 체크를 따로 누르지 않아도 된다
      input.addEventListener('input', () => {
        const cur = ensure(e, key, kind, line)
        cur[k] = input.value
        box.checked = true
        r.classList.add('is-on')
        paintRoles()
        changed()
      })
      return input
    }
    const min = num('min')
    const max = num('max')
    const roles = el(doc, 'span', 'ba-uq-roles')
    const roleBtns = ['and', 'or'].map((role) => {
      const b = el(doc, 'button', 'ba-uq-role', role === 'and' ? '필수' : '후보')
      b.type = 'button'
      b.dataset.role = role
      b.dataset.tip = ROLE_TIP[role]
      bindPageTip(b, { placement: 'below' })
      b.disabled = state !== 'ok'
      b.addEventListener('click', (ev) => {
        ev.preventDefault() // label 안 단추 — 체크박스 토글과 섞이지 않게
        const cur = ensure(e, key, kind, line)
        cur.role = role
        box.checked = true
        r.classList.add('is-on')
        paintRoles()
        changed()
      })
      roles.appendChild(b)
      return b
    })
    const paintRoles = () => {
      const cur = pickedUnique === uniqueKey(e) ? picked.get(key) : null
      for (const b of roleBtns) {
        const on = cur?.role === b.dataset.role
        b.classList.toggle('is-on', on)
        b.setAttribute('aria-pressed', String(on))
      }
    }
    box.addEventListener('change', () => {
      if (box.checked) ensure(e, key, kind, line)
      else { picked.delete(key); if (!picked.size) pickedUnique = null }
      r.classList.toggle('is-on', box.checked)
      paintRoles()
      renderListMarks()
      changed()
    })
    paintRoles()
    if (mutated) r.classList.add('is-mutated')
    r.append(box, text, min, max, roles)
    return r
  }

  /** 줄을 고른 상태로 만든다. 다른 고유에서 고른 것이 있으면 푼다(한 번에 고유 하나). */
  function ensure(e, key, kind, line) {
    const k = uniqueKey(e)
    if (pickedUnique !== k) {
      const hadOther = pickedUnique != null && picked.size > 0
      picked.clear()
      pickedUnique = k
      if (hadOther) renderList()
    }
    if (!picked.has(key)) picked.set(key, { kind, line, role: 'and', min: '', max: '' })
    renderListMarks()
    return picked.get(key)
  }

  function renderListMarks() {
    for (const b of listEl.querySelectorAll('.ba-uq-item')) {
      const e = shown[[...listEl.children].indexOf(b)]
      b.classList.toggle('has-picks', !!e && pickedUnique === uniqueKey(e) && picked.size > 0)
    }
  }

  /** 넣을 것 — 고른 고유와 줄. 넣는 순서는 보이는 순서(기본 → 고정 → 함양). */
  function picks() {
    const e = (table?.u ?? []).find((x) => uniqueKey(x) === pickedUnique)
    if (!e || !picked.size) return null
    const order = ['i', 'f', 'm', 'mf']
    const items = [...picked.entries()]
      .sort(([a], [b]) => order.indexOf(a.split('|')[0]) - order.indexOf(b.split('|')[0]) || Number(a.split('|')[1]) - Number(b.split('|')[1]))
      .map(([, p]) => ({ id: p.line.id, value: cleanLineValue(p), role: p.role, mutated: p.kind === 'm' }))
    return { unique: e, items }
  }

  function clear() {
    picked.clear()
    pickedUnique = null
    renderList()
    renderDetail()
  }

  return { el: root, setQuery, picks, clear, count: () => picked.size }
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}
