// @vitest-environment jsdom
// typeFilterDom.js — 거래소 화면의 '아이템 유형'·'아이템 레벨' 을 읽는다.
//
// 거래소 마크업은 확인된 적이 없다. 그래서 클래스 이름이 아니라 **거래소 API 가 준 라벨·옵션 텍스트**로
// 행을 찾고, 확정할 수 없으면 'ok' 가 아닌 상태를 돌려 **부르는 쪽이 마지막 검색 조건으로 되돌아가게** 한다.
// 이 파일의 절반이 "확정하면 안 되는 경우"인 이유다 — 틀린 부위를 읽으면 틀린 티어 값이 들어간다.

import { describe, it, expect, beforeEach } from 'vitest'
import { readLiveTypeFilters } from '../src/content/typeFilterDom.js'

const filterMap = {
  label: { category: '아이템 유형', ilvl: '아이템 레벨', rarity: '아이템 희귀도' },
  options: {
    category: { null: '모두', 'armour.chest': '갑옷', 'armour.helmet': '투구', weapon: '모든 무기' },
    rarity: { null: '모두', unique: '고유' },
  },
}

const OPTION_TEXTS = ['모두', '모든 무기', '갑옷', '투구']

/** 커스텀 드롭다운 — 선택값 하나가 보이고 전체 목록은 숨겨져 DOM 에 남아 있는 흔한 형태. */
function customRow(label, selected, { open = false } = {}) {
  const list = OPTION_TEXTS.map((t) => `<li><span>${t}</span></li>`).join('')
  return `
    <div class="filter">
      <span class="filter-title">${label}</span>
      <div class="multiselect">
        <div class="tags"><span class="single">${selected}</span></div>
        <div class="content" style="${open ? '' : 'display: none;'}"><ul>${list}</ul></div>
      </div>
    </div>`
}

function ilvlRow(maxValue = '') {
  return `
    <div class="filter">
      <span class="filter-title">아이템 레벨</span>
      <input type="number" placeholder="최소">
      <input type="number" placeholder="최대" value="${maxValue}">
    </div>`
}

function mount(html) {
  document.body.innerHTML = `<div class="search-panel">${html}</div>`
}

beforeEach(() => { document.body.innerHTML = '' })

describe('아이템 유형 — 확정하는 경우', () => {
  it('커스텀 드롭다운의 보이는 선택값을 읽는다 (숨은 목록은 무시)', () => {
    mount(customRow('아이템 유형', '갑옷'))
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: 'armour.chest' })
  })

  it("'모두' 는 유형 없음(id null)으로 확정한다", () => {
    mount(customRow('아이템 유형', '모두'))
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: null })
  })

  it('묶음 유형(모든 무기)도 그대로 돌려준다 — 부위 판정은 받는 쪽 몫', () => {
    mount(customRow('아이템 유형', '모든 무기'))
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: 'weapon' })
  })

  it('네이티브 select 는 선택된 옵션만 본다 — 옵션 텍스트가 전부 DOM 에 있어도', () => {
    mount(`
      <div class="filter">
        <span>아이템 유형</span>
        <select>
          <option value="">모두</option>
          <option value="armour.chest">갑옷</option>
          <option value="armour.helmet" selected>투구</option>
        </select>
      </div>`)
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: 'armour.helmet' })
  })

  it('옆 행(아이템 희귀도 모두)이 있어도 자기 행만 본다', () => {
    mount(customRow('아이템 유형', '갑옷') + customRow('아이템 희귀도', '모두'))
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: 'armour.chest' })
  })
})

describe('아이템 유형 — 확정하면 안 되는 경우', () => {
  it('드롭다운이 열려 옵션이 여럿 보이면 ambiguous', () => {
    mount(customRow('아이템 유형', '갑옷', { open: true }))
    expect(readLiveTypeFilters(document, filterMap).category.status).toBe('ambiguous')
  })

  it('라벨이 화면에 없으면 none (유형 필터를 접은 경우 등)', () => {
    mount(ilvlRow('68'))
    expect(readLiveTypeFilters(document, filterMap).category.status).toBe('none')
  })

  it('라벨이 숨겨져 있으면 없는 것으로 본다', () => {
    mount(`<div style="display:none">${customRow('아이템 유형', '갑옷')}</div>`)
    expect(readLiveTypeFilters(document, filterMap).category.status).toBe('none')
  })

  it('필터 맵이 아직 안 왔으면 none', () => {
    mount(customRow('아이템 유형', '갑옷'))
    expect(readLiveTypeFilters(document, { label: {}, options: {} }).category.status).toBe('none')
  })

  it('우리가 페이지에 붙인 요소(ba-*)의 텍스트는 세지 않는다 — 묶음 이름이 "투구" 일 수 있다', () => {
    mount(`
      <div class="filter">
        <span class="filter-title">아이템 유형</span>
        <div class="ba-page-sets"><button class="ba-set">투구</button></div>
        <div class="multiselect"><span class="single">갑옷</span></div>
      </div>`)
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: 'armour.chest' })
  })
})

describe('아이템 레벨 최대', () => {
  it('최대칸 값을 숫자로 읽는다', () => {
    mount(ilvlRow('68'))
    expect(readLiveTypeFilters(document, filterMap).ilvlMax).toEqual({ status: 'ok', value: 68 })
  })

  it('최대칸이 비어 있으면 상한 없음(null)으로 확정한다', () => {
    mount(ilvlRow(''))
    expect(readLiveTypeFilters(document, filterMap).ilvlMax).toEqual({ status: 'ok', value: null })
  })

  it('검색 결과 카드의 "아이템 레벨" 글자는 방해하지 않는다 — 입력칸이 없으니 건너뛴다', () => {
    mount(ilvlRow('75') + `
      <div class="result"><div class="item"><span>아이템 레벨</span><span>80</span></div></div>
      <div class="result"><div class="item"><span>아이템 레벨</span><span>84</span></div></div>`)
    expect(readLiveTypeFilters(document, filterMap).ilvlMax).toEqual({ status: 'ok', value: 75 })
  })

  it('한 컨테이너에 최대칸이 둘이면(아이템 퀄리티와 한 줄) ambiguous', () => {
    mount(`
      <div class="row">
        <span>아이템 레벨</span><input placeholder="최소"><input placeholder="최대" value="60">
        <span>아이템 퀄리티</span><input placeholder="최소"><input placeholder="최대" value="20">
      </div>`)
    expect(readLiveTypeFilters(document, filterMap).ilvlMax.status).toBe('ambiguous')
  })

  it('영문 거래소 placeholder(Max)도 읽는다', () => {
    mount(`<div><span>아이템 레벨</span><input placeholder="Min"><input placeholder="Max" value="70"></div>`)
    expect(readLiveTypeFilters(document, filterMap).ilvlMax).toEqual({ status: 'ok', value: 70 })
  })
})
