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
  option: '값 대신 옵션을 고르는 조건이라 아직 넣을 수 없어요\n거래소 능력치 필터에서 직접 골라 주세요',
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
export function createUniquePane(doc, { table, onChange, observe = null }) {
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
  // 「매물에서 속성 더 찾기」 결과 — 고유 키 → { data:{count, lines, resolved}, at }. 창을 닫으면 잊는다(저장은 부르는 쪽).
  const observed = new Map()
  const obsState = new Map() // 고유 키 → 'loading' | 상태 문구
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
      if (e.m?.length) {
        const dot = marks.appendChild(el(doc, 'i', 'ba-uq-dot', null))
        dot.setAttribute('role', 'img')
        dot.setAttribute('aria-label', '바알 함양 속성 있음')
      }
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
    if (observe) detail.appendChild(observeBar(e))
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
    const obs = observed.get(uniqueKey(e))
    if (obs?.data?.lines?.length) section(e, 'o', `매물에서 본 속성 — 싼 매물 ${obs.data.count}개 기준 · 무작위로 붙는 속성일 수 있어요`)
  }

  /** 「매물에서 속성 더 찾기」 줄 — 단추와 결과 한 줄. */
  function observeBar(e) {
    const k = uniqueKey(e)
    const bar = el(doc, 'div', 'ba-uq-observe')
    const obs = observed.get(k)
    const state = obsState.get(k)
    const btn = el(doc, 'button', 'ba-uq-observe-btn', state === 'loading' ? '매물 찾는 중…' : obs ? '다시 찾기' : '매물에서 속성 더 찾기')
    btn.type = 'button'
    btn.disabled = state === 'loading'
    btn.dataset.tip = '거래소 매물 10개를 받아 무작위로 붙는 속성과\n조건이 둘로 갈리는 줄을 채워요 · 거래소 요청 2회'
    bindPageTip(btn, { placement: 'below' })
    btn.addEventListener('click', () => runObserve(e, !!obs))
    const msg = el(doc, 'span', 'ba-uq-observe-msg')
    msg.setAttribute('aria-live', 'polite')
    if (state && state !== 'loading') msg.textContent = state
    else if (obs) {
      const fresh = Object.keys(obs.data.resolved ?? {}).length
      msg.textContent = `매물 ${obs.data.count}개 기준 · 새 속성 ${obs.data.lines.length}개${fresh ? ` · 조건 확정 ${fresh}줄` : ''} · ${ago(obs.at)}`
    }
    bar.append(btn, msg)
    return bar
  }

  async function runObserve(e, fresh) {
    const k = uniqueKey(e)
    obsState.set(k, 'loading')
    if (active === e) renderDetail()
    let res
    try { res = await observe(e, { fresh }) } catch (_) { res = { status: 'error' } }
    if (res?.status === 'ok' && res.data) {
      observed.set(k, { data: res.data, at: res.at ?? Date.now() })
      obsState.delete(k)
      // 새 결과로 줄이 바뀐다 — 매물에서 본 줄·매물로 확정된 줄을 골라 둔 것은 푼다(옛 조건 id 가 남지 않게)
      if (pickedUnique === k) {
        for (const [key, p] of [...picked.entries()]) if (key.startsWith('o|') || p.line?.sure) picked.delete(key)
        if (!picked.size) pickedUnique = null
      }
    } else {
      obsState.set(k, res?.status === 'empty' ? '지금 이 고유의 매물이 없어요'
        : res?.status === 'busy' ? '다른 고유를 찾는 중이에요 — 끝나면 다시 눌러 주세요'
        : res?.status === 'rate' ? `거래소 요청 제한 — ${res.wait ?? 10}초 뒤에 다시 눌러 주세요`
          : '매물을 가져오지 못했어요 — 잠시 뒤 다시 눌러 주세요')
    }
    if (active === e) renderDetail()
    changed()
  }

  /** 표의 줄에 매물 결과를 얹은 것 — 후보 조건이 매물로 확정된 줄은 그 조건 하나로 바뀐다. */
  function linesOf(e, kind) {
    const obs = observed.get(uniqueKey(e))?.data
    if (kind === 'o') return obs?.lines ?? []
    const resolved = obs?.resolved ?? {}
    return (e[kind] ?? []).map((line, i) => {
      const id = resolved[`${kind}|${i}`]
      // 확정 id 가 **그 줄의 후보**일 때만 — 저장된 결과는 줄 번호로 되어 있어, 표가 바뀌면 다른 줄을 가리킬 수 있다(독립 검토)
      return id && line.alt?.includes(id) ? { ...line, id, alt: undefined, sure: true } : line
    })
  }

  function section(e, kind, label, { mutated = false } = {}) {
    const lines = linesOf(e, kind)
    if (!lines.length) return
    const sec = el(doc, 'section', 'ba-uq-sec')
    sec.dataset.kind = kind
    sec.appendChild(el(doc, 'h4', 'ba-uq-sec-title', label))
    lines.forEach((line, i) => sec.appendChild(row(e, kind, line, i, mutated || (kind === 'o' && !!line.mutated))))
    detail.appendChild(sec)
  }

  function row(e, kind, line, i, mutated) {
    // 매물에서 본 줄은 값이 한 번만 보였어도 아이템마다 다를 수 있다 — 함양 줄처럼 「값 하나뿐」으로 막지 않는다
    const state = lineState(line, kind === 'o' ? 'm' : kind)
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
    box.setAttribute('aria-label', line.t.replace(/\n/g, ' '))
    const text = el(doc, 'span', 'ba-uq-text', line.t.replace(/\n/g, ' / '))
    if (state !== 'ok') { text.dataset.tip = STATE_TIP[state]; bindPageTip(text, { placement: 'below' }) }
    const range = state === 'ok' ? lineRange(line) : null
    // 값이 하나뿐인 줄(바알 함양 「접근 효과 범위 100% 감소」)은 붙었는지만 본다 — 칸을 끈다
    const valued = !!range && (range.min !== range.max || kind === 'o')
    // 거래소는 감소를 「증가」 조건의 음수로 받는다(20% 감소 = -20) — 칸에 음수가 보이는 이유를 알린다
    // 매물에서 본 줄은 거래소 문구(「증가」)로 보여 문구로는 가릴 수 없다 — 값이 음수면 알린다
    const negTip = valued && range.max <= 0 && (kind === 'o' || /감소|감폭|감속/.test(line.t)) ? '거래소는 감소를 음수로 받아요\n예) 20% 감소 → -20' : null
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
      if (box.checked) {
        // 칸에 남아 있는 값을 그대로 쓴다 — 체크를 풀었다 다시 켜면 보이는 값과 넣는 값이 달랐다(독립 검토 2026-09-23)
        const cur = ensure(e, key, kind, line)
        cur.min = min.value
        cur.max = max.value
      } else { picked.delete(key); if (!picked.size) pickedUnique = null }
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
    const order = ['i', 'f', 'm', 'mf', 'o']
    const seen = new Set()
    const items = []
    for (const [, p] of [...picked.entries()]
      .sort(([a], [b]) => order.indexOf(a.split('|')[0]) - order.indexOf(b.split('|')[0]) || Number(a.split('|')[1]) - Number(b.split('|')[1]))) {
      // 고정 속성과 함양판 고정 속성은 같은 조건일 수 있다 — 한 번만 넣는다(먼저 온 줄의 값·역할)
      if (seen.has(p.line.id)) continue
      seen.add(p.line.id)
      // 함양판 고정 속성을 골랐다면 함양된 매물을 찾는 것이다 — 함양 필터도 켠다
      items.push({ id: p.line.id, value: cleanLineValue(p), role: p.role, mutated: p.kind === 'm' || p.kind === 'mf' || (p.kind === 'o' && !!p.line.mutated) })
    }
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

/** 결과를 받은 때 — 저장해 둔 결과(최대 7일)를 다시 보여 줄 때 얼마나 된 것인지 알린다. */
function ago(at) {
  const m = Math.floor((Date.now() - at) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}
