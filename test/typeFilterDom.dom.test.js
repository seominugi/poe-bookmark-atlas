// @vitest-environment jsdom
// typeFilterDom.js — 거래소 화면의 '아이템 유형'·'아이템 레벨' 을 읽는다.
//
// 거래소 마크업은 확인된 적이 없다. 그래서 클래스 이름이 아니라 **거래소 API 가 준 라벨·옵션 텍스트**로
// 행을 찾고, 확정할 수 없으면 'ok' 가 아닌 상태를 돌려 **부르는 쪽이 마지막 검색 조건으로 되돌아가게** 한다.
// 이 파일의 절반이 "확정하면 안 되는 경우"인 이유다 — 틀린 부위를 읽으면 틀린 티어 값이 들어간다.

import { describe, it, expect, beforeEach } from 'vitest'
import { readLiveTypeFilters } from '../src/content/typeFilterDom.js'
import { buildFilterMap } from '../src/lib/filterMap.js'

// ⚠ 필터 맵을 손으로 만들지 않는다 — **거래소 `data/filters` 응답 모양 그대로** buildFilterMap 에 통과시킨다.
// 손으로 만든 맵에 `모두` 를 넣어 두었던 탓에, 실제 빌더가 id null 옵션(`모두`)을 빼는 것을 테스트가
// 못 잡았다. 라이브에서 유형을 `모두` 로 되돌리면 'none' 이 났다(2026-09-13 Claude 직접 실측).
const filterMap = buildFilterMap({
  result: [
    {
      id: 'type_filters',
      filters: [
        {
          id: 'category', text: '아이템 유형', fullSpan: true,
          option: { options: [
            { id: null, text: '모두' },
            { id: 'weapon', text: '모든 무기' },
            { id: 'armour.chest', text: '갑옷' },
            { id: 'armour.helmet', text: '투구' },
          ] },
        },
        {
          id: 'rarity', text: '아이템 희귀도',
          option: { options: [{ id: null, text: '모두' }, { id: 'unique', text: '고유' }] },
        },
        { id: 'ilvl', text: '아이템 레벨', minMax: true },
      ],
    },
  ],
})

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

// 2026-09-13 사용자 콘솔에서 떠온 poe2 카카오 거래소의 실제 유형 필터 마크업(옵션 <li> 만 뺐다).
// 선택값이 **글자가 아니라 입력칸**에 있다 — `<input class="multiselect__input" placeholder="갑옷">`,
// value 프로퍼티도 "갑옷". 이걸 모르고 보이는 글자만 세서 닫힌 상태에서 'none' 이 났다(첫 배포 #49).
// value 는 HTML 속성이 아니라 프로퍼티라 outerHTML 에 안 찍힌다 — mountRealType 이 JS 로 넣는다.
describe('실제 거래소 마크업 (2026-09-13 실측)', () => {
  const REAL = `
    <div class="filter-group-body">
      <div class="filter filter-property full-span"><!----> <span class="filter-body"><div class="filter-title"> 아이템 유형 <!----></div> <!----> <span class="sep"></span> <div tabindex="-1" class="multiselect filter-select modified" style="width: 271px;"><div class="multiselect__select"></div> <div class="multiselect__tags"><div class="multiselect__tags-wrap" style="display: none;"></div> <!----> <div class="multiselect__spinner" style="display: none;"></div> <input name="" type="text" autocomplete="off" placeholder="갑옷" class="multiselect__input"> <!----></div> <div class="multiselect__content-wrapper" style="max-height: 300px; display: none;"><ul class="multiselect__content" style="display: inline-block;"> <li><span>모두</span></li><li><span>갑옷</span></li><li><span>투구</span></li> </ul></div></div> <!----> <!----> <!----></span> <!----></div>
      <div class="filter filter-property full-span"><!----> <span class="filter-body"><div class="filter-title"> 아이템 희귀도 <!----></div> <!----> <span class="sep"></span> <div tabindex="-1" class="multiselect filter-select" style="width: 271px;"><div class="multiselect__select"></div> <div class="multiselect__tags"><div class="multiselect__tags-wrap" style="display: none;"></div> <!----> <div class="multiselect__spinner" style="display: none;"></div> <input name="" type="text" autocomplete="off" placeholder="모두" class="multiselect__input"> <!----></div> <div class="multiselect__content-wrapper" style="max-height: 300px; display: none;"><ul class="multiselect__content" style="display: inline-block;"> <li><span>모두</span></li><li><span>고유</span></li> </ul></div></div> <!----> <!----> <!----></span> <!----></div>
      <div class="filter filter-property"><!----> <span class="filter-body"><div class="filter-title"> 아이템 레벨 <!----></div> <!----> <!----> <!----> <!----> <span class="sep"></span> <input type="number" placeholder="최소" class="form-control minmax"> <span class="sep"></span> <input type="number" placeholder="최대" class="form-control minmax"></span> <!----></div>
      <div class="filter filter-property spaced"><!----> <span class="filter-body"><div class="filter-title"> 아이템 퀄리티 <!----></div> <!----> <!----> <!----> <!----> <span class="sep"></span> <input type="number" placeholder="최소" class="form-control minmax"> <span class="sep"></span> <input type="number" placeholder="최대" class="form-control minmax"></span> <!----></div>
    </div>`

  function mountRealType({ typeValue = '갑옷', rarityValue = '모두', open = false } = {}) {
    document.body.innerHTML = REAL
    const [typeInput, rarityInput] = document.querySelectorAll('.multiselect__input')
    typeInput.value = typeValue
    typeInput.setAttribute('placeholder', typeValue)
    rarityInput.value = rarityValue
    if (open) typeInput.closest('.multiselect').querySelector('.multiselect__content-wrapper').style.display = ''
    return { typeInput }
  }

  it('닫힌 드롭다운의 입력칸에서 선택값을 읽는다', () => {
    mountRealType()
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: 'armour.chest' })
  })

  it('옆 행 아이템 희귀도의 "모두" 에 끌려가지 않는다 — 유형 "모두" 와 글자가 같다', () => {
    mountRealType({ typeValue: '투구', rarityValue: '모두' })
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: 'armour.helmet' })
  })

  it('유형이 "모두" 면 id null 로 확정한다', () => {
    mountRealType({ typeValue: '모두' })
    expect(readLiveTypeFilters(document, filterMap).category).toEqual({ status: 'ok', id: null })
  })

  it('드롭다운이 열려 목록이 보이면 ambiguous — 로그에서 실제로 본 그대로', () => {
    mountRealType({ open: true })
    expect(readLiveTypeFilters(document, filterMap).category.status).toBe('ambiguous')
  })

  it('검색하려고 입력칸에 친 글자는 목록이 닫혀 있을 때만 믿는다 — 열려 있으면 ambiguous', () => {
    const { typeInput } = mountRealType({ open: true })
    typeInput.value = '투' // 치는 중 — placeholder 는 아직 '갑옷'
    expect(readLiveTypeFilters(document, filterMap).category.status).toBe('ambiguous')
  })

  it('아이템 레벨 최대칸을 읽는다 (아이템 퀄리티는 별도 행이라 섞이지 않는다)', () => {
    mountRealType()
    const maxes = [...document.querySelectorAll('input[placeholder="최대"]')]
    maxes[0].value = '70' // 아이템 레벨
    maxes[1].value = '20' // 아이템 퀄리티
    expect(readLiveTypeFilters(document, filterMap).ilvlMax).toEqual({ status: 'ok', value: 70 })
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
