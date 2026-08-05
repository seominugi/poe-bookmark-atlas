// @vitest-environment jsdom
// fuzzyPrefix.js — 검색칸에 "~" 접두사를 강제하되, 검색어를 완전히 지울 수 있어야 한다(회귀 버그, 2026-07-22).
//
// jsdom은 document.execCommand를 구현하지 않는다 → 실제 브라우저의 insertText 동작(선택 구간에 텍스트를
// 넣고 input 이벤트를 동기로 발생시킴)을 그대로 흉내내는 최소 모킹을 둔다. 이 모킹 하나만 대체하고
// 나머지(리스너 등록·판정 로직)는 모듈 코드를 그대로 실행해 검증한다.
// (pretendToBeVisual: vitest.config.js에서 전역 설정 — 없으면 jsdom의 el.focus()가 조용히 no-op해
// document.activeElement가 갱신되지 않는다. mock execCommand가 document.activeElement로 대상을 찾는다.)
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initFuzzyPrefix } from '../src/content/fuzzyPrefix.js'

function mockExecCommand() {
  document.execCommand = (cmd, _ui, value) => {
    if (cmd !== 'insertText') return false
    const el = document.activeElement
    if (!el || el.tagName !== 'INPUT') return false
    const s = el.selectionStart ?? el.value.length
    const e = el.selectionEnd ?? el.value.length
    el.value = el.value.slice(0, s) + value + el.value.slice(e)
    el.selectionStart = el.selectionEnd = s + value.length
    el.dispatchEvent(new Event('input', { bubbles: true })) // 실제 execCommand도 동기로 input을 발생시킨다
    return true
  }
}

function makeInput(placeholder, value = '') {
  const input = document.createElement('input')
  input.placeholder = placeholder
  input.value = value
  document.body.appendChild(input)
  input.focus() // 빈 칸이면 모듈 자신의 focusin 핸들러가 이 시점에 이미 "~"를 넣을 수 있다(active=true 모킹 때문)
  // 커서는 지금 실제 값(초기 파라미터가 아니라 focus 부작용 반영 후 input.value) 끝에 둔다 —
  // 안 그러면 방금 자동 삽입된 "~"를 무시하고 커서가 0으로 되돌아가 이어지는 타이핑 테스트가 어긋난다.
  input.setSelectionRange(input.value.length, input.value.length)
  return input
}

const keydown = (el, key) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev.defaultPrevented
}
const fireInput = (el) => el.dispatchEvent(new Event('input', { bubbles: true }))

beforeEach(() => {
  document.body.innerHTML = ''
  mockExecCommand()
  // 실제 사용자 클릭은 navigator.userActivation.isActive = true다 — 모듈의 "페이지 로드 자동포커스 해제"
  // 가드가 이 값으로 실제 클릭과 사이트의 무의미한 자동 포커스를 구분한다(jsdom엔 이 API 자체가 없어 직접 정의).
  // 없으면 테스트의 el.focus()도 자동포커스로 오인돼 1.2초 내에 즉시 blur된다.
  Object.defineProperty(navigator, 'userActivation', { value: { isActive: true }, configurable: true })
  initFuzzyPrefix() // 리스너는 capture 단계에 등록 — 매 테스트 document에 누적되지만 대상 없으면 무해
})
afterEach(() => { document.body.innerHTML = '' })

describe('아이템 검색칸 — 완전히 비울 수 있어야 한다 (회귀)', () => {
  it('전체 삭제(선택 후 삭제)로 값이 빈 문자열이 되면 "~"를 되살리지 않는다', () => {
    const input = makeInput('아이템 검색…', '~형상 없는 반지')
    input.value = '' // Ctrl+A + Delete를 흉내: 선택 구간 전체 삭제 → 네이티브가 value를 직접 비움
    input.selectionStart = input.selectionEnd = 0
    fireInput(input)
    expect(input.value).toBe('')
  })

  it('"~" 한 글자만 남았을 때 Backspace는 막히지 않는다', () => {
    const input = makeInput('아이템 검색…', '~')
    input.selectionStart = input.selectionEnd = 1
    const prevented = keydown(input, 'Backspace')
    expect(prevented).toBe(false) // 더 이상 지우지 못하게 막던 것이 버그였다
  })

  it('막히지 않은 Backspace로 실제 삭제 후에도 "~"가 되살아나지 않는다(엔드투엔드)', () => {
    const input = makeInput('아이템 검색…', '~')
    input.selectionStart = input.selectionEnd = 1
    const prevented = keydown(input, 'Backspace')
    expect(prevented).toBe(false)
    // 브라우저 네이티브 삭제를 흉내(jsdom은 keydown만으론 실제 삭제를 안 함)
    input.value = ''
    input.selectionStart = input.selectionEnd = 0
    fireInput(input)
    expect(input.value).toBe('')
  })

  it('뒤에 다른 글자가 남아 있으면 "~" 삭제는 여전히 막는다(기존 보호 유지)', () => {
    const input = makeInput('아이템 검색…', '~ab')
    input.selectionStart = input.selectionEnd = 1
    const prevented = keydown(input, 'Backspace')
    expect(prevented).toBe(true)
  })
})

describe('아이템 검색칸 — 기본 접두사 동작(기존 회귀 방지)', () => {
  it('빈 칸을 클릭하면 즉시 "~"가 붙고, 그 뒤에 이어 타이핑된다', () => {
    // 빈 칸 포커스(실제 클릭)만으로 focusin 핸들러가 이미 "~"를 넣는다 — 이어서 'a'를 타이핑하면 그 뒤에 붙어야 한다.
    const input = makeInput('아이템 검색…', '')
    expect(input.value).toBe('~') // 포커스만으로 이미 삽입됨
    document.execCommand('insertText', false, 'a') // 실제 타이핑 경로
    expect(input.value).toBe('~a')
  })

  it('붙여넣기 등으로 "~" 없이 값이 채워지면 보강한다', () => {
    const input = makeInput('아이템 검색…', '')
    input.value = 'abc' // paste
    fireInput(input)
    expect(input.value).toBe('~abc')
  })

  it('커서가 "~" 바로 뒤(위치 1)에 있을 때 ArrowLeft로 "~" 앞으로 못 넘어간다(기존 동작)', () => {
    const input = makeInput('아이템 검색…', '~abc')
    input.selectionStart = input.selectionEnd = 1
    const prevented = keydown(input, 'ArrowLeft')
    expect(prevented).toBe(true)
    expect(input.selectionStart).toBe(1)
  })
})

describe('설정으로 끄면 "~"를 강제하지 않는다 (uiFuzzyPrefix, 2026-08-05 제보)', () => {
  // 저장소 변경 이벤트로 직접 뒤집는다 — 모듈이 실제로 쓰는 경로이고, 비동기 get을 기다릴 필요가 없다.
  const setFuzzy = (on) => globalThis.__fireStorageChange({ uiFuzzyPrefix: { newValue: on } }, 'local')
  afterEach(() => setFuzzy(true)) // enabled는 모듈 레벨 상태 — 다음 테스트로 새지 않게 되돌린다

  it('꺼져 있으면 빈 칸을 클릭해도 "~"가 붙지 않는다', () => {
    setFuzzy(false)
    expect(makeInput('아이템 검색…', '').value).toBe('')
  })

  it('꺼져 있으면 "~" 없이 값이 채워져도 보강하지 않는다', () => {
    setFuzzy(false)
    const input = makeInput('아이템 검색…', '')
    input.value = 'abc'
    fireInput(input)
    expect(input.value).toBe('abc')
  })

  it('꺼져 있으면 "~" 보호(Backspace·ArrowLeft 차단)도 하지 않는다', () => {
    setFuzzy(false)
    const input = makeInput('아이템 검색…', '~abc')
    input.selectionStart = input.selectionEnd = 1
    expect(keydown(input, 'Backspace')).toBe(false)
    expect(keydown(input, 'ArrowLeft')).toBe(false)
  })

  it('능력치 필터칸도 함께 꺼진다', () => {
    setFuzzy(false)
    expect(makeInput('+ 능력치 필터 추가', '').value).toBe('')
  })

  it('다시 켜면 새로고침 없이 즉시 원래대로 동작한다', () => {
    setFuzzy(false)
    expect(makeInput('아이템 검색…', '').value).toBe('')
    setFuzzy(true)
    expect(makeInput('아이템 검색…', '').value).toBe('~')
  })
})

describe('대상이 아닌 입력은 건드리지 않는다', () => {
  it('placeholder가 안 맞는 입력은 무시한다', () => {
    const input = makeInput('가격', '100')
    input.value = ''
    fireInput(input)
    expect(input.value).toBe('') // 관계없는 입력은 보강 대상이 아니므로 그대로
  })

  it('능력치 필터 입력에도 동일하게 적용된다(완전 삭제 허용)', () => {
    const input = makeInput('+ 능력치 필터 추가', '~')
    input.selectionStart = input.selectionEnd = 1
    expect(keydown(input, 'Backspace')).toBe(false)
  })
})
