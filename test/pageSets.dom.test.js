// @vitest-environment jsdom
// 거래소 화면에 얹는 '조건 묶음' 칩 줄 — 앵커 탐색과 주입 계약.
//
// 여기서 지키려는 것.
//  ① 능력치 필터 그룹 **바깥, 바로 위**. 그룹 안에 넣으면 그 필터에 속한 것처럼 보인다(제보).
//  ② 앵커가 없으면 **아무것도 하지 않는다**. 거래소가 마크업을 바꿔도 화면이 깨지지 않고
//     패널 칩으로만 돌아가야 한다(사용자와 합의한 유지보수 계약).
//  ③ 같은 내용을 다시 그리지 않는다. 주입 감시가 body 전역 MutationObserver 라서,
//     매번 새로 그리면 우리 삽입이 감시를 다시 깨우는 무한 루프가 된다.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { findStatFilterGroup, renderSetsBar, setsSignature, SETS_BAR_ID } from '../src/lib/pageSets.js'
import { conditionSetTip } from '../src/lib/conditionSet.js'

// 2026-08-13 거래소(카카오 poe1) 실측 구조를 줄인 것.
// .search-advanced-pane > .filter-group > (.filter-title + .filter-group-body > .filter > ... > input)
const tradeMarkup = ({ statPlaceholder = '+ 능력치 필터 추가', statTitle = '능력치 필터' } = {}) => `
  <div class="search-advanced-pane brown" id="pane">
    <div class="filter-group expanded" id="type-group">
      <div class="filter-title filter-title-clickable">유형 필터</div>
      <div class="filter-group-body" id="type-body">
        <div class="filter filter-padded"><span class="filter-body">
          <div class="multiselect"><div class="multiselect__tags">
            <input class="multiselect__input" placeholder="+ 유형 필터 추가">
          </div></div>
        </span></div>
      </div>
    </div>
    <div class="filter-group expanded" id="stat-group">
      <div class="filter-title filter-title-clickable">${statTitle}</div>
      <div class="filter-group-body" id="stat-body">
        <div class="filter full-span" id="first-stat">
          <span class="input-group-btn"></span>
          <span class="filter-body">카오스 저항 +#%</span>
          <span class="input-group-btn"></span>
        </div>
        <div class="filter filter-padded"><span class="filter-body">
          <div class="multiselect"><div class="multiselect__tags">
            <input class="multiselect__input" placeholder="${statPlaceholder}">
          </div></div>
        </span></div>
      </div>
    </div>
  </div>`

const SETS = [
  { id: 's1', name: '생명력 + 저항', game: 'poe1' },
  { id: 's2', name: '캐스터 무기', game: 'poe1' },
]

beforeEach(() => { document.body.innerHTML = '' })

describe('findStatFilterGroup', () => {
  it('능력치 필터 그룹을 찾는다 (유형 필터가 아니라)', () => {
    document.body.innerHTML = tradeMarkup()
    expect(findStatFilterGroup(document)?.id).toBe('stat-group')
  })

  it('placeholder 문구가 바뀌어도 그룹 제목으로 찾아낸다', () => {
    document.body.innerHTML = tradeMarkup({ statPlaceholder: '+ 조건 넣기' })
    expect(findStatFilterGroup(document)?.id).toBe('stat-group')
  })

  it('영문 거래소(Stat Filters)도 찾는다', () => {
    document.body.innerHTML = tradeMarkup({ statPlaceholder: '+ Add Stat Filter', statTitle: 'Stat Filters' })
    expect(findStatFilterGroup(document)?.id).toBe('stat-group')
  })

  it('거래소 마크업이 통째로 바뀌면 null — 아무 데나 붙이지 않는다', () => {
    document.body.innerHTML = '<div class="search-pane-v2"><div class="stat-row"></div></div>'
    expect(findStatFilterGroup(document)).toBe(null)
  })
})

describe('renderSetsBar', () => {
  // 핵심 요구: 그룹 밖 + 바로 위. 그룹 안에 넣으면 그 필터의 일부처럼 보인다(2026-08-13 제보).
  it('능력치 필터 그룹 **바깥**, 바로 앞에 붙는다', () => {
    document.body.innerHTML = tradeMarkup()
    const bar = renderSetsBar(document, SETS, () => {})
    const group = document.getElementById('stat-group')
    expect(group.contains(bar)).toBe(false)      // 그룹 안이 아니고
    expect(bar.nextElementSibling).toBe(group)   // 그룹 바로 앞이며
    expect(bar.parentElement.id).toBe('pane')    // 그룹의 형제다
  })

  it('앞에 있는 다른 그룹(유형 필터)은 건드리지 않는다', () => {
    document.body.innerHTML = tradeMarkup()
    const bar = renderSetsBar(document, SETS, () => {})
    expect(bar.previousElementSibling.id).toBe('type-group')
  })

  // 그룹 안 요소(제목·필터 내용)는 그룹 좌측에서 42px 들여쓰여 있다. 혼자 튀어나오지 않게 맞춘다.
  it('그룹 제목 선에 맞춰 들여쓰고, 우측도 같은 만큼 비운다', () => {
    document.body.innerHTML = tradeMarkup()
    const bar = renderSetsBar(document, SETS, () => {})
    expect(bar.style.marginLeft).toBe('42px')
    expect(bar.style.maxWidth).toBe('calc(100% - 84px)')
  })

  // 위 테스트는 jsdom 에 레이아웃 엔진이 없어 폴백(42px)만 탄다. 실제로 **재서** 쓰는지도 고정한다 —
  // 거래소가 여백을 바꾸면 하드코딩 42px 는 어긋나고, 그건 조용히 틀어진다.
  it('제목 들여쓰기가 다르면 잰 값을 쓴다 (42px 하드코딩이 아니다)', () => {
    document.body.innerHTML = tradeMarkup()
    const group = document.getElementById('stat-group')
    group.getBoundingClientRect = () => ({ left: 1000 })
    group.querySelector('.filter-title').getBoundingClientRect = () => ({ left: 1060 })
    const bar = renderSetsBar(document, SETS, () => {})
    expect(bar.style.marginLeft).toBe('60px')
    expect(bar.style.maxWidth).toBe('calc(100% - 120px)')
  })

  // 거래소는 필터를 Vue 로 다시 그린다. 내용이 같다고 그냥 반환하면 밀린 자리에 영영 남는다.
  it('우리 줄과 그룹 사이에 무언가 끼어들어도 다시 그룹 앞으로 되돌린다', () => {
    document.body.innerHTML = tradeMarkup()
    const bar = renderSetsBar(document, SETS, () => {})
    const group = document.getElementById('stat-group')
    const intruder = document.createElement('div')
    intruder.className = 'filter-group'
    group.parentElement.insertBefore(intruder, group) // 우리 줄과 그룹 사이에 삽입
    expect(bar.nextElementSibling).toBe(intruder)     // 밀려난 상태 확인

    const again = renderSetsBar(document, SETS, () => {}) // 내용은 그대로
    expect(again).toBe(bar)                              // 노드는 재사용하고
    expect(bar.nextElementSibling).toBe(group)           // 자리는 되돌린다
  })

  it('묶음 이름을 텍스트로만 넣는다 — 이름에 태그가 들어가도 실행되지 않는다', () => {
    document.body.innerHTML = tradeMarkup()
    const bar = renderSetsBar(document, [{ id: 'x', name: '<img src=x onerror="alert(1)">' }], () => {})
    expect(bar.querySelector('img')).toBe(null)
    expect(bar.querySelector('.ba-page-set').textContent).toBe('+ <img src=x onerror="alert(1)">')
  })

  it('앵커가 없으면 아무것도 만들지 않는다 (패널 칩으로만 돌아간다)', () => {
    document.body.innerHTML = '<div class="search-pane-v2"></div>'
    expect(renderSetsBar(document, SETS, () => {})).toBe(null)
    expect(document.getElementById(SETS_BAR_ID)).toBe(null)
  })

  it('묶음이 하나도 없으면 줄을 지운다 — 빈 상자를 남기지 않는다', () => {
    document.body.innerHTML = tradeMarkup()
    renderSetsBar(document, SETS, () => {})
    expect(renderSetsBar(document, [], () => {})).toBe(null)
    expect(document.getElementById(SETS_BAR_ID)).toBe(null)
  })

  it('같은 내용이면 노드를 다시 만들지 않는다 (MutationObserver 무한 루프 방지)', () => {
    document.body.innerHTML = tradeMarkup()
    const first = renderSetsBar(document, SETS, () => {})
    const again = renderSetsBar(document, SETS, () => {})
    expect(again).toBe(first) // 동일 노드 — 삽입이 다시 일어나지 않았다
  })

  it('묶음이 바뀌면 다시 그린다', () => {
    document.body.innerHTML = tradeMarkup()
    const first = renderSetsBar(document, SETS, () => {})
    const next = renderSetsBar(document, [...SETS, { id: 's3', name: '이동 속도' }], () => {})
    expect(next).not.toBe(first)
    expect(next.querySelectorAll('.ba-page-set')).toHaveLength(3)
    expect(document.querySelectorAll(`#${SETS_BAR_ID}`)).toHaveLength(1) // 중복 주입 없음
  })

  it('이름만 바뀌어도 다시 그린다 (id 만 비교하면 놓친다)', () => {
    expect(setsSignature(SETS)).not.toBe(setsSignature([{ ...SETS[0], name: '생명력' }, SETS[1]]))
  })

  // 이름만 보고는 무슨 조건이 담겼는지 알 수 없다는 제보 → 호버 툴팁에 조건 목록을 그대로 싣는다.
  it('칩 툴팁에 조건 목록과 값 범위가 들어간다', () => {
    document.body.innerHTML = tradeMarkup()
    const set = { id: 'z', name: '생명력 + 저항', stats: [
      { text: '최대 생명력 +#', value: { min: 80 } },
      { text: '화염 저항 +#%', value: { min: 30, max: 45 } },
      { text: '지능 +#', value: null },
    ] }
    const tip = renderSetsBar(document, [set], () => {}).querySelector('.ba-page-set').getAttribute('data-tip')
    expect(tip).toContain('생명력 + 저항')
    expect(tip).toContain('최대 생명력 +# ≥80')
    expect(tip).toContain('화염 저항 +#% ≥30 ≤45')
    expect(tip).toContain('지능 +#')
    expect(tip).toContain('조건 3개') // 요약
  })

  it('툴팁 본문은 패널 칩과 같은 함수에서 나온다 (두 표면이 갈라지지 않게)', () => {
    document.body.innerHTML = tradeMarkup()
    const set = { id: 'z', name: '캐스터', stats: [{ text: '주문 피해 +#%', value: { min: 70 } }] }
    const tip = renderSetsBar(document, [set], () => {}).querySelector('.ba-page-set').getAttribute('data-tip')
    expect(tip.startsWith(conditionSetTip(set))).toBe(true)
  })

  it('네이티브 title 은 쓰지 않는다 — 커스텀 툴팁과 겹쳐 두 번 뜬다', () => {
    document.body.innerHTML = tradeMarkup()
    const bar = renderSetsBar(document, SETS, () => {})
    expect(bar.querySelector('.ba-page-set').hasAttribute('title')).toBe(false)
  })

  it('bindTip 을 주면 칩마다 물린다', () => {
    document.body.innerHTML = tradeMarkup()
    const bindTip = vi.fn()
    renderSetsBar(document, SETS, () => {}, bindTip)
    expect(bindTip).toHaveBeenCalledTimes(SETS.length)
  })

  it('칩을 누르면 그 묶음과 줄을 넘긴다', () => {
    document.body.innerHTML = tradeMarkup()
    const onPick = vi.fn()
    const bar = renderSetsBar(document, SETS, onPick)
    bar.querySelectorAll('.ba-page-set')[1].click()
    expect(onPick).toHaveBeenCalledWith(SETS[1], bar)
  })
})
