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
const SKIP_TAGS = new Set(['INPUT', 'BUTTON', 'SELECT'])

function isMinInput(el) {
  if (!el || el.tagName !== 'INPUT') return false
  const ph = (el.getAttribute('placeholder') || '').trim().toLowerCase()
  return ph === '최소' || ph === 'min'
}

/** node 안에서 input·button·select 서브트리를 뺀 텍스트가 있으면 true. */
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

function insertAfterMin(min, node) {
  min.parentElement.insertBefore(node, min.nextSibling)
}

/** 이 입력칸에 우리가 앞서 붙였던 것만 걷어낸다 (거래소 자신의 요소는 건드리지 않는다). */
function clearOwnButtons(min) {
  let node = min.nextSibling
  while (node) {
    const next = node.nextSibling
    const cl = node.nodeType === Node.ELEMENT_NODE ? node.classList : null
    if (cl && (cl.contains(CHIP_CLASS) || cl.contains(ASK_CLASS))) node.remove()
    node = next
  }
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
 */
export function attachTierChips(root, ctx) {
  const { table, itemClass, ilvlMax = null, statIdOf, onAskClass, onApply } = ctx
  const inputs = Array.from(root.querySelectorAll('input'))
  const minInputs = inputs.filter(isMinInput)

  for (const min of minInputs) {
    try {
      const row = findRow(min, minInputs, root)
      if (!row) continue

      const statId = statIdOf(row)
      // 그린 결과를 결정하는 값들. 하나라도 다르면 다시 그린다.
      const signature = `${statId ?? ''}|${itemClass ?? ''}|${ilvlMax ?? ''}`
      if (min.dataset[MARK] === signature) continue
      min.dataset[MARK] = signature
      clearOwnButtons(min) // 이전에 그린 것을 걷어내고 새로 붙인다

      if (!statId) continue

      const { status, tiers } = tiersFor({ table, itemClass, statId, ilvlMax })

      if (status === 'no-class') {
        const askBtn = makeAskButton()
        askBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          onAskClass?.(row)
        })
        insertAfterMin(min, askBtn)
        continue
      }

      if (status !== 'ok') continue // no-stat · multi-slot · none — 아무것도 붙이지 않는다

      // 항상 `min.parentElement.insertBefore(chip, min.nextSibling)` 로 넣으므로, 화면에
      // T1 T2 T3 순으로 보이려면 뒤에서부터(T3→T1) 밀어 넣는다.
      for (let i = tiers.length - 1; i >= 0; i -= 1) {
        const tier = tiers[i]
        const chip = makeChipButton(tier)
        chip.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const result = setInputValue(min, String(tier.min))
          onApply?.(result, tier)
        })
        insertAfterMin(min, chip)
      }
    } catch (_) {
      // 한 행에서 터져도 나머지 행은 계속 처리한다
    }
  }
}
