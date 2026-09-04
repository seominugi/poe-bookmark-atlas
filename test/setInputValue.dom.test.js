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

  // Vue 가 값을 원래 값도 새 값도 아닌 제3의 값으로 바꿔 쓰는 경우가 있다 —
  // 거래소 입력칸에 상한이 걸려 있으면 넣은 값을 잘라서 써 넣는다.
  // 그때 그 잘린 값을 남긴 채 실패하면 사용자는 자기가 넣지도 않은 숫자로 검색하게 된다.
  // `failed` 는 "아무것도 안 바뀌었다" 여야 부르는 쪽이 단순해진다.
  it('두 경로가 다 실패하면 Vue 가 써 넣은 제3의 값도 원래 값으로 되돌린다', () => {
    const el = makeInput()
    el.value = '99' // 사용자가 원래 갖고 있던 값
    // 상한 50 이 걸린 칸 흉내 — 넣으려는 41 은 통과할 것 같지만 여기선 무조건 잘라 다른 값을 쓴다.
    // 원래 값 99 는 그대로 두므로, 복구 시도가 이 핸들러에 다시 막히지 않는다.
    el.addEventListener('input', () => { if (el.value === '41') el.value = '50' })
    document.execCommand = () => false
    expect(setInputValue(el, '41')).toBe('failed')
    expect(el.value).toBe('99') // 잘린 50 이 아니라 사용자의 원래 값
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
