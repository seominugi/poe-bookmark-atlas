// src/content/tier-chip.js
// 능력치 필터 행에 티어 칩(T1 T2 T3)을 붙인다.
//
// GGG 마크업의 클래스 이름에 기대지 않는다 — 확인된 적이 없고 바뀌면 기능이 통째로 죽는다.
// 대신 "최소" 입력칸에서 위로 올라가며, 입력칸·버튼·select 를 뺀 텍스트를 가진 가장 가까운
// 조상을 그 능력치의 행으로 본다. 너무 위로 올라가지 않도록 깊이 상한과 "행 여러 개를 감싼
// 컨테이너인가"(최소 입력칸이 둘 이상인가) 판정으로 막는다.

import { tiersFor } from '../lib/statTiers.js'
import { setInputValue } from './setInputValue.js'

export const CHIP_CLASS = 'ba-tier-chip'
export const ASK_CLASS = 'ba-tier-ask'

// dataset 표식. **불리언이 아니라 '무엇으로 그렸는지'를 담는다.**
// 사용자가 같은 행에서 능력치를 바꿔도 Vue 는 보통 그 입력칸 DOM 을 재사용하므로,
// 한 번 처리했다고 영영 건너뛰면 옛 능력치의 칩이 남아 틀린 값을 넣게 된다.
// 유형·아이템 레벨 상한이 바뀔 때도 같다.
const MARK = 'baTierChip'
const MAX_CLIMB = 6

// 행 텍스트를 읽을 때 건너뛰는 것.
// `I` 가 들어 있는 이유 — 거래소 실측(2026-09-04):
//   <div class="filter-title">
//     <i class="mutate-type mutate-type-explicit">비고정</i>   ← 그룹 배지
//     <span>화염 저항 #%</span>                                ← 진짜 능력치 이름
//   </div>
// `<i>` 를 빼지 않으면 "비고정 화염 저항 #%" 가 나와 거래소 스탯 목록과 **한 건도 안 맞는다**
// (실제 페이지 대조: 빼기 전 0/2 → 뺀 뒤 2/2). 클래스가 아니라 태그로 거른다 —
// GGG 가 `mutate-type` 을 바꿔도 배지가 `<i>` 인 한 살아남는다.
const SKIP_TAGS = new Set(['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'I'])

function isMinInput(el) {
  if (!el || el.tagName !== 'INPUT') return false
  const ph = (el.getAttribute('placeholder') || '').trim().toLowerCase()
  return ph === '최소' || ph === 'min'
}

/**
 * 행에서 **능력치 이름만** 읽는다 (그룹 배지 제외 — SKIP_TAGS 주석 참조).
 * 부르는 쪽이 이 문구로 거래소 stat id 를 되찾는다.
 * @param {Element} row
 * @returns {string}
 */
export function rowStatText(row) {
  const out = []
  collectText(row, out)
  return out.join('').replace(/\s+/g, ' ').trim()
}

function collectText(node, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) out.push(child.textContent)
    else if (child.nodeType === Node.ELEMENT_NODE && !SKIP_TAGS.has(child.tagName)) collectText(child, out)
  }
}

/** node 안에서 SKIP_TAGS 서브트리를 뺀 텍스트가 있으면 true. */
function hasOwnText(node) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent.trim()) return true
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(child.tagName)) continue
      if (hasOwnText(child)) return true
    }
  }
  return false
}

/**
 * min 입력칸에서 위로 올라가며 행(row)을 찾는다.
 * @returns {Element|null} 못 찾으면 null
 */
function findRow(minInput, allMinInputs, root) {
  let node = minInput.parentElement
  let depth = 0
  while (node && depth < MAX_CLIMB) {
    const minCountHere = allMinInputs.reduce((n, inp) => n + (node.contains(inp) ? 1 : 0), 0)
    if (minCountHere > 1) break // 여러 행을 감싼 컨테이너 — 직전까지의 후보(못 찾았으면 null)를 쓴다
    if (hasOwnText(node)) return node
    if (node === root) break
    node = node.parentElement
    depth += 1
  }
  return null
}

function makeChipButton(tier) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = CHIP_CLASS
  btn.textContent = `T${tier.t}`
  btn.title = `${tier.min}~${tier.max} · 아이템 레벨 ${tier.l} 이상`
  return btn
}

function makeAskButton() {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = ASK_CLASS
  btn.textContent = '부위?'
  return btn
}

/**
 * 칩을 붙일 자리 — **능력치 이름을 담은 가장 안쪽 요소**.
 *
 * 왜 min 입력칸 뒤가 아닌가 (거래소 실측 2026-09-05): 그 행에는 가로 여유가 **0** 이다.
 *   제목 502 + 최소 84 + 최대 64 = 656 = 행 전폭
 * 게다가 GGG CSS 가 우리 `<button>` 에 `display:block; float:left; width:80px` 를 먹여,
 * min 뒤에 넣으면 칩이 **세로로 쌓이고 행 높이가 30 → 70px 로 무너진다**(실측).
 * 반면 제목 칸은 502px 인데 이름은 95~110px 뿐이라 **약 390px 이 비어 있다.**
 * 이름 바로 뒤에 붙이면 행 높이가 30px 그대로다(칩 높이 18px 기준 실측).
 *
 * 클래스 이름(`filter-title`)에는 기대지 않는다 — 텍스트를 가진 자식이 하나뿐인 동안
 * 계속 내려간다. 우리 버튼은 SKIP_TAGS 라 이미 붙어 있어도 경로가 흔들리지 않는다.
 */
function findTextHost(row) {
  let cur = row
  for (;;) {
    const kids = Array.from(cur.children).filter((c) => !SKIP_TAGS.has(c.tagName) && hasOwnText(c))
    if (kids.length !== 1) return cur
    cur = kids[0]
  }
}

/** 이 행에 우리가 앞서 붙였던 것만 걷어낸다 (거래소 자신의 요소는 건드리지 않는다). */
function clearOwnButtons(row) {
  for (const node of row.querySelectorAll('.' + CHIP_CLASS + ', .' + ASK_CLASS)) node.remove()
}

/**
 * @param {Document|Element} root
 * @param {object} ctx
 * @param {object} ctx.table                        statTiers.poe2.json
 * @param {string|null} ctx.itemClass               부위 (모르면 null)
 * @param {number|null} [ctx.ilvlMax]                아이템 레벨 상한 (없으면 null)
 * @param {(row: Element) => string|null} ctx.statIdOf   행 → 거래소 stat id
 * @param {(row: Element) => void} [ctx.onAskClass]      '부위?' 를 눌렀을 때
 * @param {(result: string, tier: object) => void} [ctx.onApply]  칩을 눌러 값을 넣은 뒤
 *
 * @returns {{minInputs:number, chips:number, ask:number, noRow:number, noStatId:number,
 *            noStat:number, multiSlot:number, none:number, unchanged:number}}
 *   왜 칩이 안 붙었는지 세어 돌려준다. 실제 거래소 마크업을 아무도 못 본 상태라, 칩이 안 뜰 때
 *   "행을 못 찾았나 / 능력치를 못 알아봤나 / 그 부위에 없는 옵션인가"를 구분할 방법이 필요하다.
 *   부르는 쪽이 이 값을 로그로 남기면 실측 때 그대로 진단 자료가 된다.
 */
export function attachTierChips(root, ctx) {
  const { table, itemClass, ilvlMax = null, statIdOf, onAskClass, onApply } = ctx
  const inputs = Array.from(root.querySelectorAll('input'))
  const minInputs = inputs.filter(isMinInput)
  const seen = { minInputs: minInputs.length, chips: 0, ask: 0, noRow: 0, noStatId: 0, noStat: 0, multiSlot: 0, none: 0, unchanged: 0 }

  for (const min of minInputs) {
    try {
      const row = findRow(min, minInputs, root)
      if (!row) { seen.noRow += 1; continue }

      const statId = statIdOf(row)
      // 그린 결과를 결정하는 값들. 하나라도 다르면 다시 그린다.
      // (`table` 은 넣지 않는다 — 빌드에 박혀 들어오는 정적 데이터라 실행 중에 바뀌지 않는다)
      const signature = `${statId ?? ''}|${itemClass ?? ''}|${ilvlMax ?? ''}`
      if (min.dataset[MARK] === signature) { seen.unchanged += 1; continue }
      min.dataset[MARK] = signature
      clearOwnButtons(row) // 이전에 그린 것을 걷어내고 새로 붙인다
      const host = findTextHost(row)

      if (!statId) { seen.noStatId += 1; continue }

      const { status, tiers } = tiersFor({ table, itemClass, statId, ilvlMax })

      if (status === 'no-class') {
        const askBtn = makeAskButton()
        askBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          onAskClass?.(row)
        })
        host.appendChild(askBtn)
        seen.ask += 1
        continue
      }

      if (status !== 'ok') {
        // no-stat · multi-slot · none — 아무것도 붙이지 않는다. 이유만 세어 둔다.
        if (status === 'no-stat') seen.noStat += 1
        else if (status === 'multi-slot') seen.multiSlot += 1
        else if (status === 'none') seen.none += 1
        continue
      }

      for (const tier of tiers) {
        const chip = makeChipButton(tier)
        chip.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const result = setInputValue(min, String(tier.min))
          onApply?.(result, tier)
        })
        host.appendChild(chip)
        seen.chips += 1
      }
    } catch (_) {
      // 한 행에서 터져도 나머지 행은 계속 처리한다
    }
  }
  return seen
}
