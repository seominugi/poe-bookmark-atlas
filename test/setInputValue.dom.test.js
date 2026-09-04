// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { setInputValue } from '../src/content/setInputValue.js'

function makeInput() {
  const el = document.createElement('input')
  document.body.appendChild(el)
  return el
}

beforeEach(() => { document.body.innerHTML = ''; delete document.execCommand })

describe('setInputValue', () => {
  it('네이티브 setter 로 값이 남으면 native 를 돌려준다', () => {
    const el = makeInput()
    expect(setInputValue(el, '41')).toBe('native')
    expect(el.value).toBe('41')
  })

  it('input 이벤트를 발생시킨다 (Vue 가 듣는 경로)', () => {
    const el = makeInput()
    let seen = 0
    el.addEventListener('input', () => { seen++ })
    setInputValue(el, '41')
    expect(seen).toBe(1)
  })

  it('change 이벤트도 발생시킨다 — Vue 컴포넌트에 따라 input 대신 change 를 듣는 경우가 있다', () => {
    const el = makeInput()
    let seen = 0
    el.addEventListener('change', () => { seen++ })
    setInputValue(el, '41')
    expect(seen).toBe(1)
  })

  it('값이 되돌려지면 execCommand 로 넘어간다', () => {
    const el = makeInput()
    // Vue 흉내: input 이벤트를 받으면 값을 즉시 되돌린다
    el.addEventListener('input', () => { el.value = '' })
    document.execCommand = (cmd, _ui, value) => {
      if (cmd !== 'insertText') return false
      document.activeElement.value = value
      return true
    }
    expect(setInputValue(el, '41')).toBe('exec')
    expect(el.value).toBe('41')
  })

  it('두 경로가 다 막히면 failed 를 돌려주고 값을 건드리지 않는다', () => {
    const el = makeInput()
    el.addEventListener('input', () => { el.value = '' })
    document.execCommand = () => false
    expect(setInputValue(el, '41')).toBe('failed')
    expect(el.value).toBe('')
  })

  it('입력칸이 없으면 failed', () => {
    expect(setInputValue(null, '41')).toBe('failed')
  })

  it('null·undefined 는 "null" 을 써 넣지 않고 failed 로 끊는다', () => {
    for (const bad of [null, undefined]) {
      const el = makeInput()
      el.value = '99'
      expect(setInputValue(el, bad)).toBe('failed')
      expect(el.value).toBe('99') // 사용자 값이 문자열 "null" 로 덮이지 않는다
    }
  })

  // Vue 가 값을 원래 값도 새 값도 아닌 제3의 값으로 바꿔 쓰는 경우가 있다 —
  // 거래소 입력칸에 상한이 걸려 있으면 넣은 값을 잘라서 써 넣는다.
  // 그때 그 잘린 값을 남긴 채 실패하면 사용자는 자기가 넣지도 않은 숫자로 검색하게 된다.
  // `failed` 는 "아무것도 안 바뀌었다" 여야 부르는 쪽이 단순해진다.
  it('우리가 넣은 값만 거부하는 칸이면 원래 값으로 되돌린다', () => {
    const el = makeInput()
    el.value = '99' // 사용자가 원래 갖고 있던 값
    // 넣으려는 41 만 거부하는 칸 흉내. 원래 값 99 는 받아들이므로 복구가 성립한다.
    el.addEventListener('input', () => { if (el.value === '41') el.value = '50' })
    document.execCommand = () => false
    expect(setInputValue(el, '41')).toBe('failed')
    expect(el.value).toBe('99') // 거부당한 50 이 아니라 사용자의 원래 값
  })

  // 위 테스트의 목은 '41' 에만 반응해서, 복구 시도 자체가 같은 방해를 받는 경우를 못 본다.
  // 모든 입력을 다시 쓰는 핸들러(범위 밖 값을 항상 잘라내는 칸)는 복구도 이길 수 없다 —
  // 그게 이 함수가 복구를 '보장' 이 아니라 '최선 노력' 으로만 약속하는 이유다.
  it('모든 입력을 덮어쓰는 칸이면 복구도 막힌다 — 그래도 failed 를 돌려주고 터지지 않는다', () => {
    const el = makeInput()
    el.value = '99'
    el.addEventListener('input', () => { el.value = '50' }) // 무엇을 넣든 50 으로 덮는다
    document.execCommand = () => false
    expect(() => setInputValue(el, '41')).not.toThrow()
    expect(setInputValue(el, '41')).toBe('failed')
    expect(el.value).toBe('50') // 되돌리지 못했다. 문서가 이 한계를 밝힌다
  })

  it('빈 문자열을 넣을 수 있다', () => {
    const el = makeInput()
    el.value = '41'
    expect(setInputValue(el, '')).toBe('native')
    expect(el.value).toBe('')
  })

  it('숫자가 아닌 값도 문자열로 그대로 넣는다 (형변환 책임은 호출자)', () => {
    const el = makeInput()
    expect(setInputValue(el, 'abc')).toBe('native')
    expect(el.value).toBe('abc')
  })

  it('el.select 가 없는 요소에서도 exec 경로가 터지지 않는다', () => {
    const el = makeInput()
    el.addEventListener('input', () => { el.value = '' })
    el.select = undefined // jsdom 외 환경에서 select 가 없는 입력 유형을 흉내
    document.execCommand = (cmd, _ui, value) => {
      if (cmd !== 'insertText') return false
      document.activeElement.value = value
      return true
    }
    expect(() => setInputValue(el, '41')).not.toThrow()
    expect(setInputValue(el, '41')).toBe('exec')
  })
})
