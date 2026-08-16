import { describe, it, expect } from 'vitest'
import { shouldOpenNewTab, hasOpenModifier } from '../src/lib/openTarget.js'

describe('shouldOpenNewTab', () => {
  it("기본 '현재 탭' — 그냥 클릭하면 현재 탭, 수식키면 새 탭", () => {
    expect(shouldOpenNewTab(false, false)).toBe(false)
    expect(shouldOpenNewTab(false, true)).toBe(true)
  })

  it("기본 '새 탭' — 그냥 클릭하면 새 탭, 수식키면 현재 탭(반전)", () => {
    expect(shouldOpenNewTab(true, false)).toBe(true)
    expect(shouldOpenNewTab(true, true)).toBe(false)
  })

  it('저장된 적 없는 설정(undefined)은 현재 탭으로 친다 — 기존 동작 유지', () => {
    expect(shouldOpenNewTab(undefined, false)).toBe(false)
    expect(shouldOpenNewTab(undefined, true)).toBe(true)
  })
})

describe('hasOpenModifier', () => {
  it('Ctrl·⌘ 를 수식키로 본다', () => {
    expect(hasOpenModifier({ ctrlKey: true })).toBe(true)
    expect(hasOpenModifier({ metaKey: true })).toBe(true)
    expect(hasOpenModifier({ shiftKey: true })).toBe(false)
  })

  it('이벤트가 없으면(대화상자 이후 호출 등) 수식키 없음', () => {
    expect(hasOpenModifier(undefined)).toBe(false)
    expect(hasOpenModifier(null)).toBe(false)
  })
})
