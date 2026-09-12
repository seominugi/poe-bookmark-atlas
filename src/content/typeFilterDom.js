// src/content/typeFilterDom.js
// 거래소 화면의 '아이템 유형'·'아이템 레벨(최대)' 을 읽는다. 검색 조건에 덮는 규칙은 src/lib/liveTypeFilters.js.
//
// 마크업은 2026-09-13 사용자 콘솔로 한 번 실측했다(`test/typeFilterDom.dom.test.js` '실제 거래소 마크업').
// 그 전에 추측으로 짠 첫 판(#49)은 **보이는 글자만** 세서, 선택값을 입력칸에 두는 실제 드롭다운을
// 닫힌 상태에서 한 번도 못 읽었다. 그래도 클래스 이름에는 여전히 기대지 않는다 — tier-chip.js 와 같은 원칙:
//   GGG 클래스 이름에 기대지 않고, **거래소 API(`data/filters`)가 준 라벨·옵션 텍스트**로 찾는다.
//   (한국어·영문 거래소 모두 그 호스트의 언어로 내려오므로 번역을 우리가 만들 일이 없다)
//
// 확정할 수 없으면 'ok' 를 돌려주지 않는다. 받는 쪽은 그때 마지막 검색 조건을 그대로 쓰므로,
// **이 모듈이 실패해도 종전보다 나빠지지 않는다.** 반대로 틀린 부위를 'ok' 로 내면 틀린 티어 값이
// 들어가므로, 조금이라도 여럿이 보이면 확정하지 않는 쪽으로 기울어 있다.

import { optionIdByText } from '../lib/liveTypeFilters.js'
import { isMaxInput } from './tier-chip.js'

// 라벨에서 위로 몇 칸까지 행을 찾아 올라가나. 라벨이 제목 요소 안에 한두 겹 싸여 있어도 닿고,
// 필터 섹션 전체를 한 번에 삼킬 만큼은 올라가지 않게 한다(tier-chip.js MAX_CLIMB 와 같은 취지).
const MAX_CLIMB = 5

/**
 * @param {Document|Element} root
 * @param {{label?:Record<string,string>, options?:Record<string,Record<string,string>>}} filterMap
 * @returns {{category: import('../lib/liveTypeFilters.js').LiveCategory,
 *            ilvlMax: import('../lib/liveTypeFilters.js').LiveIlvlMax}}
 */
export function readLiveTypeFilters(root, filterMap) {
  return {
    category: readCategory(root, filterMap),
    ilvlMax: readIlvlMax(root, filterMap),
  }
}

function readCategory(root, filterMap) {
  const label = filterMap?.label?.category
  const byText = optionIdByText(filterMap, 'category')
  if (!label || !byText.size) return { status: 'none' }

  return resolveFromLabel(root, label, (node) => {
    const hits = new Set()
    // 네이티브 select 는 옵션 텍스트가 전부 DOM 에 있으므로 **선택된 옵션만** 센다.
    for (const sel of node.querySelectorAll('select')) {
      if (!visibleWithin(sel, node) || inOwnUi(sel, node)) continue
      const opt = sel.options[sel.selectedIndex]
      const t = opt?.textContent.trim()
      if (t && byText.has(t)) hits.add(t)
    }
    // 실측(poe2 카카오 거래소 2026-09-13): 드롭다운이 닫혀 있으면 선택값이 **글자가 아니라 입력칸**에 있다 —
    // `<input class="multiselect__input" placeholder="갑옷">` (value 프로퍼티도 "갑옷").
    // placeholder 를 먼저 본다: 목록을 열고 검색어를 치는 동안 value 는 검색어로 바뀌지만
    // placeholder 는 선택값을 유지한다. 입력칸 하나는 답 하나만 낸다.
    for (const input of node.querySelectorAll('input')) {
      if (!visibleWithin(input, node) || inOwnUi(input, node)) continue
      const ph = (input.getAttribute('placeholder') || '').trim()
      const val = (input.value || '').trim()
      if (byText.has(ph)) hits.add(ph)
      else if (byText.has(val)) hits.add(val)
    }
    for (const t of visibleTexts(node)) {
      if (t !== label && byText.has(t)) hits.add(t)
    }
    if (!hits.size) return null // 이 높이에는 아직 값이 없다 — 한 칸 더 올라간다
    if (hits.size > 1) return { status: 'ambiguous' } // 드롭다운이 열려 목록이 보이는 경우 등
    const [text] = hits
    return { status: 'ok', id: byText.get(text) }
  })
}

function readIlvlMax(root, filterMap) {
  const label = filterMap?.label?.ilvl
  if (!label) return { status: 'none' }

  return resolveFromLabel(root, label, (node) => {
    const maxes = [...node.querySelectorAll('input')].filter((i) => isMaxInput(i) && visibleWithin(i, node) && !inOwnUi(i, node))
    if (!maxes.length) return null
    // 아이템 퀄리티처럼 옆 필터와 한 컨테이너에 있으면 어느 최대칸이 레벨인지 모른다.
    if (maxes.length > 1) return { status: 'ambiguous' }
    const raw = maxes[0].value.trim()
    const n = raw === '' ? null : Number(raw)
    return { status: 'ok', value: Number.isFinite(n) ? n : null }
  })
}

/**
 * 화면에서 `label` 글자를 모두 찾아, 각각 위로 올라가며 `probe` 가 답을 줄 때까지 본다.
 *
 * 왜 라벨을 **전부** 보나: '아이템 레벨' 은 검색 결과 카드에도 찍힌다. 첫 번째만 보면 카드를 잡을 수 있다.
 * 카드 쪽에서는 입력칸이 안 나오므로 probe 가 답하지 않고, 필터 쪽만 답한다.
 * 서로 다른 답이 둘 이상 나오면 확정하지 않는다.
 */
function resolveFromLabel(root, label, probe) {
  const results = []
  for (const textNode of labelTextNodes(root, label)) {
    let node = textNode.parentElement
    for (let i = 0; node && i < MAX_CLIMB; i++, node = node.parentElement) {
      const r = probe(node)
      if (r) { results.push(r); break }
    }
  }
  const ok = results.filter((r) => r.status === 'ok')
  const distinct = new Set(ok.map((r) => JSON.stringify(r)))
  if (distinct.size === 1 && !results.some((r) => r.status === 'ambiguous')) return ok[0]
  return results.length ? { status: 'ambiguous' } : { status: 'none' }
}

/** 문서에서 글자가 정확히 `label` 이고 화면에 보이는 텍스트 노드. */
function labelTextNodes(root, label) {
  const doc = root.ownerDocument || root
  const start = root.body || root.documentElement || root
  const walker = doc.createTreeWalker(start, 4 /* NodeFilter.SHOW_TEXT */)
  const out = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue.trim() !== label) continue
    const el = n.parentElement
    if (el && visibleWithin(el, null) && !inOwnUi(el, null)) out.push(n)
  }
  return out
}

/** node 안의 보이는 텍스트(다듬은 것). select 안의 옵션 글자와 우리 UI 는 뺀다. */
function visibleTexts(node) {
  const walker = node.ownerDocument.createTreeWalker(node, 4 /* NodeFilter.SHOW_TEXT */)
  const out = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.trim()
    if (!t) continue
    const el = n.parentElement
    if (!el || el.closest('select') || inOwnUi(el, node) || !visibleWithin(el, node)) continue
    out.push(t)
  }
  return out
}

/** el 부터 stop(포함)까지 숨겨진 조상이 없는가. stop 이 null 이면 문서 끝까지 본다. */
function visibleWithin(el, stop) {
  const view = el.ownerDocument.defaultView
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (n.hidden) return false
    const cs = view.getComputedStyle(n)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    if (n === stop) break
  }
  return true
}

/**
 * 우리가 거래소 페이지에 붙인 요소(클래스가 `ba-` 로 시작) 안인가.
 * 조건 묶음 칩 줄 같은 것에 사용자가 "투구" 같은 이름을 붙일 수 있어, 세면 틀린 부위를 읽는다.
 */
function inOwnUi(el, stop) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    for (const c of n.classList) if (c.startsWith('ba-')) return true
    if (n === stop) break
  }
  return false
}
