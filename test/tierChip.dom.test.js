// @vitest-environment jsdom
// tier-chip.js — 능력치 필터 행에 T1 T2 T3 칩을 붙인다.
//
// 클래스 이름에 기대지 않고 "이름 텍스트 + 최소/최대 입력칸" 구조만으로 행을 찾는지 검증한다.
// 앞쪽 describe 들은 그 규칙이 여러 형태의 DOM 에서 버티는지 보고, 맨 아래
// '실제 거래소 마크업' describe 는 2026-09-04 에 라이브 페이지에서 그대로 떠온 것으로 확인한다.

import { describe, it, expect, beforeEach } from 'vitest'
import { attachTierChips, rowStatText, CHIP_CLASS, ASK_CLASS } from '../src/content/tier-chip.js'

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

// 실제 거래소 마크업을 아무도 못 봤으므로, 칩이 안 뜰 때 왜 안 뜨는지 알 방법이 필요하다.
// 이 요약이 Task 9 실측에서 그대로 진단 자료가 된다.
describe('진단 요약을 돌려준다', () => {
  it('붙은 것과 안 붙은 이유를 센다', () => {
    const ok = flatRow('화염 저항 #%')
    const multi = flatRow('공격 시 화염 피해 #~# 추가')
    const unknown = flatRow('우리가 모르는 능력치')
    for (const r of [ok, multi, unknown]) document.body.appendChild(r.row)

    const byName = {
      '화염 저항 #%': 'stat.fire_res',
      '공격 시 화염 피해 #~# 추가': 'stat.added_fire',
    }
    const seen = attachTierChips(document, {
      table,
      itemClass: 'Ring',
      statIdOf: (row) => byName[row.textContent.trim()] ?? null,
    })

    expect(seen.minInputs).toBe(3)
    expect(seen.chips).toBe(3) // ok 행의 T1·T2·T3
    expect(seen.multiSlot).toBe(1) // 슬롯 둘이라 못 붙임
    expect(seen.noStatId).toBe(1) // 능력치를 알아보지 못함
    expect(seen.noRow).toBe(0)
  })

  it('행을 못 찾으면 noRow 로 잡힌다 — 조용히 사라지지 않는다', () => {
    // 이름이 텍스트 노드가 아니라 aria-label 로만 있는 구조 (실제 거래소가 이럴 수 있다)
    const row = el('div')
    row.setAttribute('aria-label', '화염 저항')
    row.appendChild(el('input', { placeholder: '최소' }))
    document.body.appendChild(row)

    const seen = attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => 'stat.fire_res' })
    expect(seen.minInputs).toBe(1)
    expect(seen.noRow).toBe(1)
    expect(seen.chips).toBe(0)
  })

  it('두 번째 호출은 unchanged 로 잡혀 다시 그리지 않는다', () => {
    const { row } = flatRow('화염 저항 #%')
    document.body.appendChild(row)
    const c = { table, itemClass: 'Ring', statIdOf: () => 'stat.fire_res' }
    attachTierChips(document, c)
    const seen = attachTierChips(document, c)
    expect(seen.unchanged).toBe(1)
    expect(seen.chips).toBe(0)
  })
})

describe('행 찾기의 알려진 한계 (의도된 동작을 못박는다)', () => {
  it('한 행에 최소 입력칸이 둘이면 컨테이너로 오판해 칩을 안 붙인다', () => {
    const row = el('div')
    row.appendChild(el('span', { textContent: '화염 저항 #%' }))
    row.appendChild(el('input', { placeholder: '최소' }))
    row.appendChild(el('input', { placeholder: '최소' })) // 같은 행에 둘
    document.body.appendChild(row)

    const seen = attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => 'stat.fire_res' })
    expect(seen.noRow).toBe(2)
    expect(row.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
  })

  it('이름이 7단계 위에 있으면 깊이 상한(6)에 막힌다', () => {
    let node = el('div')
    const min = el('input', { placeholder: '최소' })
    node.appendChild(min)
    for (let i = 0; i < 6; i += 1) { const up = el('div'); up.appendChild(node); node = up }
    node.appendChild(el('span', { textContent: '화염 저항 #%' })) // 7단계 위에만 이름이 있다
    document.body.appendChild(node)

    const seen = attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => 'stat.fire_res' })
    expect(seen.noRow).toBe(1)
    expect(document.querySelectorAll('.' + CHIP_CLASS)).toHaveLength(0)
  })
})

// 2026-09-04 거래소(poe.kakaogames.com/trade2)에서 그대로 떠온 마크업이다.
// 그룹 배지 <i>비고정</i> 을 빼지 않으면 "비고정 화염 저항 #%" 가 나와 스탯 목록과
// 한 건도 안 맞는다 — 실제 페이지 대조에서 빼기 전 0/2, 뺀 뒤 2/2 였다.
describe('실제 거래소 마크업 (2026-09-04 실측)', () => {
  const REAL_ROW = `
    <span class="filter-body">
      <div class="filter-title filter-title-clickable">
        <i class="mutate-type mutate-type-explicit">비고정</i> <span>화염 저항 #%</span>
      </div>
      <!----> <!---->
      <span class="sep"></span>
      <input type="number" placeholder="최소" class="form-control minmax modified">
      <span class="sep"></span>
      <input type="number" placeholder="최대" class="form-control minmax">
    </span>`

  function mountReal() {
    const host = el('div')
    host.innerHTML = REAL_ROW
    document.body.appendChild(host)
    return host.querySelector('.filter-body')
  }

  it('그룹 배지를 빼고 능력치 이름만 읽는다', () => {
    const row = mountReal()
    expect(rowStatText(row)).toBe('화염 저항 #%')
  })

  it('실제 마크업에서 행을 찾아 칩을 붙인다', () => {
    mountReal()
    const seen = attachTierChips(document, {
      table,
      itemClass: 'Ring',
      // 배선(content-main)이 하는 것과 같은 방식 — 읽은 문구로 id 를 되찾는다
      statIdOf: (row) => (rowStatText(row) === '화염 저항 #%' ? 'stat.fire_res' : null),
    })
    expect(seen.noRow).toBe(0)
    expect(seen.chips).toBe(3)
    expect([...document.querySelectorAll('.' + CHIP_CLASS)].map((c) => c.textContent)).toEqual(['T1', 'T2', 'T3'])
  })

  it('칩을 누르면 그 행의 최소 칸에 값이 들어간다', () => {
    const row = mountReal()
    attachTierChips(document, { table, itemClass: 'Ring', statIdOf: () => 'stat.fire_res' })
    const min = row.querySelector('input[placeholder="최소"]')
    ;[...document.querySelectorAll('.' + CHIP_CLASS)].find((c) => c.textContent === 'T2').click()
    expect(min.value).toBe('36')
  })
})
