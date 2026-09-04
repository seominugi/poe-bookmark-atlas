// @vitest-environment jsdom
// tier-chip.js — 능력치 필터 행에 T1 T2 T3 칩을 붙인다.
//
// 실제 거래소 마크업(클래스 이름)은 확인된 적이 없다(한국 IP 에서 카카오 로그인으로 리다이렉트돼
// 접근 불가). 그래서 여기서는 클래스 이름을 전혀 쓰지 않는 여러 형태의 DOM 을 직접 만들어
// "이름 텍스트 + 최소/최대 입력칸" 구조만으로 행을 찾는지 검증한다.

import { describe, it, expect, beforeEach } from 'vitest'
import { attachTierChips, CHIP_CLASS, ASK_CLASS } from '../src/content/tier-chip.js'

const table = {
  Ring: {
    'stat.fire_res': [
      { t: 1, l: 82, v: [[41, 45]] },
      { t: 2, l: 71, v: [[36, 40]] },
      { t: 3, l: 60, v: [[31, 35]] },
    ],
    'stat.added_fire': [{ t: 1, l: 75, v: [[25, 29], [37, 45]] }], // 슬롯 둘 — multi-slot
  },
}

function el(tag, props = {}) {
  const node = document.createElement(tag)
  Object.assign(node, props)
  return node
}

/** 평평한 구조: <div><span>이름</span><input 최소><input 최대></div> */
function flatRow(name, minPh = '최소', maxPh = '최대') {
  const row = el('div')
  row.appendChild(el('span', { textContent: name }))
  const min = el('input', { placeholder: minPh })
  const max = el('input', { placeholder: maxPh })
  row.appendChild(min)
  row.appendChild(max)
  return { row, min, max }
}

/** 입력칸이 한 겹 더 감싸인 구조: 이름은 행 바로 아래, 입력칸은 하위 div 안 */
function wrappedRow(name, minPh = '최소', maxPh = '최대') {
  const row = el('div')
  row.appendChild(el('span', { textContent: name }))
  const fields = el('div')
  const min = el('input', { placeholder: minPh })
  const max = el('input', { placeholder: maxPh })
  fields.appendChild(min)
  fields.appendChild(max)
  row.appendChild(fields)
  return { row, min, max }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('평평한 구조 — 화염 저항 (T1~T3)', () => {
  let min, max, row
  beforeEach(() => {
    ;({ row, min, max } = flatRow('화염 저항 #%'))
    document.body.appendChild(row)
  })

  const ctx = () => ({
    table,
    itemClass: 'Ring',
    ilvlMax: null,
    statIdOf: () => 'stat.fire_res',
  })

  it('상위 세 티어 칩이 min 입력칸 바로 뒤에 순서대로 붙는다', () => {
    attachTierChips(document, ctx())
    const chips = row.querySelectorAll('.' + CHIP_CLASS)
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(['T1', 'T2', 'T3'])
    expect(min.nextElementSibling).toBe(chips[0])
  })

  it('title 은 "최소~최대 · 아이템 레벨 L 이상"', () => {
    attachTierChips(document, ctx())
    const chip = row.querySelector('.' + CHIP_CLASS)
    expect(chip.title).toBe('41~45 · 아이템 레벨 82 이상')
  })

  it('T2 를 누르면 min 에 36 이 들어가고 onApply 가 불린다', () => {
    let applied = null
    attachTierChips(document, { ...ctx(), onApply: (result, tier) => { applied = { result, tier } } })
    const t2 = Array.from(row.querySelectorAll('.' + CHIP_CLASS)).find((c) => c.textContent === 'T2')
    t2.click()
    expect(min.value).toBe('36')
    expect(applied.result).toBe('native')
    expect(applied.tier.t).toBe(2)
  })

  it('클릭이 preventDefault·stopPropagation 된다', () => {
    attachTierChips(document, ctx())
    const chip = row.querySelector('.' + CHIP_CLASS)
    let bubbled = false
    document.addEventListener('click', () => { bubbled = true })
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    chip.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(bubbled).toBe(false)
  })

  it('두 번 불러도 칩이 3개다 (중복 부착 없음)', () => {
    attachTierChips(document, ctx())
    attachTierChips(document, ctx())
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(3)
  })

  // 사용자가 같은 행에서 능력치를 바꾸면 Vue 는 보통 그 입력칸 DOM 을 재사용한다.
  // 한 번 처리한 칸을 영영 건너뛰면 옛 능력치의 칩이 그대로 남아 틀린 값을 넣게 된다.
  it('같은 행의 능력치가 바뀌면 칩을 새 능력치로 갈아 끼운다', () => {
    let statId = 'stat.fire_res'
    const c = () => ({ table, itemClass: 'Ring', statIdOf: () => statId })

    attachTierChips(document, c())
    expect([...row.querySelectorAll('.' + CHIP_CLASS)].map((b) => b.title)[0]).toBe('41~45 · 아이템 레벨 82 이상')

    statId = 'stat.added_fire' // 슬롯 둘 → 칩이 사라져야 한다
    attachTierChips(document, c())
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
  })

  it('아이템 레벨 상한이 바뀌면 칩을 다시 계산한다', () => {
    attachTierChips(document, ctx())
    expect([...row.querySelectorAll('.' + CHIP_CLASS)].map((b) => b.textContent)).toEqual(['T1', 'T2', 'T3'])

    attachTierChips(document, { ...ctx(), ilvlMax: 65 })
    expect([...row.querySelectorAll('.' + CHIP_CLASS)].map((b) => b.textContent)).toEqual(['T3'])
  })

  it('부위가 정해지면 부위? 버튼이 칩으로 바뀐다', () => {
    attachTierChips(document, { ...ctx(), itemClass: null })
    expect(row.querySelectorAll('.' + ASK_CLASS)).toHaveLength(1)

    attachTierChips(document, ctx())
    expect(row.querySelectorAll('.' + ASK_CLASS)).toHaveLength(0)
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(3)
  })

  it('ilvlMax: 65 면 T3 만 붙는다', () => {
    attachTierChips(document, { ...ctx(), ilvlMax: 65 })
    const chips = row.querySelectorAll('.' + CHIP_CLASS)
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(['T3'])
  })
})

describe('입력칸이 한 겹 더 감싸인 구조', () => {
  it('이름이 행 바로 아래, 입력칸이 하위 div 안에 있어도 행을 찾는다', () => {
    const { row, min } = wrappedRow('냉기 저항 #%')
    document.body.appendChild(row)
    attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => 'stat.fire_res' })
    const chips = row.querySelectorAll('.' + CHIP_CLASS)
    expect(chips).toHaveLength(3)
    expect(min.nextElementSibling).toBe(chips[0]) // 칩은 항상 min 바로 뒤
  })
})

describe('영문 거래소 — placeholder 가 min/max', () => {
  it('대소문자 무시하고 min 입력칸을 찾는다', () => {
    const { row, min } = flatRow('Fire Resistance #%', 'Min', 'Max')
    document.body.appendChild(row)
    attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => 'stat.fire_res' })
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(3)
    expect(min.nextElementSibling.className).toBe(CHIP_CLASS)
  })
})

describe('여러 행이 한 컨테이너 안에 — 너무 위로 안 올라간다', () => {
  it('각 행을 따로 잡고, 공유 컨테이너를 행으로 오인하지 않는다', () => {
    const container = el('div')
    const a = wrappedRow('화염 저항 #%')
    const b = wrappedRow('냉기 저항 #%')
    container.appendChild(a.row)
    container.appendChild(b.row)
    document.body.appendChild(container)

    const seen = []
    attachTierChips(document, {
      table,
      itemClass: 'Ring',
      statIdOf: (row) => {
        seen.push(row)
        return row.textContent.includes('화염') ? 'stat.fire_res' : null
      },
    })

    // 화염 저항 행에만 칩이 붙는다 (냉기는 표에 없어 statIdOf가 null 반환 → no-stat 취급)
    expect(a.row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(3)
    expect(b.row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
    // statIdOf 에 넘어온 row 가 공유 컨테이너(container)가 아니라 각자의 행이었다
    expect(seen).not.toContain(container)
    expect(seen).toContain(a.row)
  })
})

describe('no-stat · multi-slot — 아무것도 붙이지 않는다', () => {
  it('표에 없는 stat id 면 아무것도 안 붙는다', () => {
    const { row } = flatRow('알 수 없는 옵션')
    document.body.appendChild(row)
    attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => 'stat.unknown' })
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
    expect(row.querySelectorAll('.' + ASK_CLASS)).toHaveLength(0)
  })

  it('슬롯이 둘인 stat 이면 아무것도 안 붙는다', () => {
    const { row } = flatRow('화염 피해 추가')
    document.body.appendChild(row)
    attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => 'stat.added_fire' })
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
  })

  it('statIdOf 가 null 이면 아무것도 안 붙는다', () => {
    const { row } = flatRow('알 수 없는 옵션')
    document.body.appendChild(row)
    attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => null })
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
    expect(row.querySelectorAll('.' + ASK_CLASS)).toHaveLength(0)
  })
})

describe('부위를 모를 때 — 부위? 버튼', () => {
  it('itemClass 가 null 이면 칩 대신 부위? 버튼이 붙고, 누르면 onAskClass(row) 가 불린다', () => {
    const { row } = flatRow('화염 저항 #%')
    document.body.appendChild(row)
    let asked = null
    attachTierChips(document, {
      table,
      itemClass: null,
      statIdOf: () => 'stat.fire_res',
      onAskClass: (r) => { asked = r },
    })
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
    const askBtn = row.querySelector('.' + ASK_CLASS)
    expect(askBtn).toBeTruthy()
    expect(askBtn.textContent).toBe('부위?')
    askBtn.click()
    expect(asked).toBe(row)
  })
})

describe('한 행이 터져도 다른 행은 계속 처리한다', () => {
  it('statIdOf 가 특정 행에서 throw 해도 나머지 행에는 칩이 붙는다', () => {
    const boom = flatRow('터지는 행')
    const ok = flatRow('화염 저항 #%')
    document.body.appendChild(boom.row)
    document.body.appendChild(ok.row)
    boom.row.dataset.throwme = '1'

    attachTierChips(document, {
      table,
      itemClass: 'Ring',
      statIdOf: (row) => {
        if (row.dataset.throwme) throw new Error('boom')
        return 'stat.fire_res'
      },
    })

    expect(ok.row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(3)
    expect(boom.row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
  })
})
