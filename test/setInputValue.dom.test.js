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

  // 갭 발견 (고치지 않고 보고): Vue 가 input 이벤트 핸들러에서 값을 원래 값도 새 값도 아닌
  // 제3의 값("쓰레기")으로 바꿔버리면, 두 경로가 다 실패해도 그 쓰레기 값이 입력칸에 남는다.
  // 계획서 4번 테스트는 "원래 값이 마침 최종 값과 같은" 경우만 봐서 이 케이스를 못 잡는다.
  // 구현을 고치면(예: 실패 시 원래 값으로 복구) 3단 폴백 계약 밖의 판단이라 스스로 수정하지 않았다 —
  // 현재 실제 동작을 그대로 기록해 둔다.
  it('[알려진 갭] 1단계가 쓰레기 값을 남기고 실패하면 failed 를 반환하지만 그 쓰레기 값이 그대로 남는다', () => {
    const el = makeInput()
    el.value = '99' // 원래 값
    el.addEventListener('input', () => { el.value = 'garbage' })
    document.execCommand = () => false
    expect(setInputValue(el, '41')).toBe('failed')
    expect(el.value).toBe('garbage') // 원래 값(99)도 새 값(41)도 아닌 쓰레기가 그대로 남는다
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
