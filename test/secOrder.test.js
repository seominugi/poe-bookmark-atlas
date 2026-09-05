// 섹션 순서 — 저장값 정규화와 ▲▼ 이동.
//
// 이 모듈이 막는 사고는 하나다: **저장된 배열을 그대로 믿는 것.**
// 섹션이 늘거나 줄면(또는 다른 버전에서 넘어온 설정이면) 배열에 모르는 키가 있거나 새 키가 빠져 있다.
// 빠진 키를 그냥 두면 그 섹션이 화면에서 통째로 사라지는데, 사용자에겐 '북마크가 없어졌다'로 보인다.
import { describe, it, expect } from 'vitest'
import { SECTIONS, DEFAULT_SEC_ORDER, SECTION_LABEL, normalizeSecOrder, moveSection } from '../src/lib/secOrder.js'

describe('normalizeSecOrder — 저장값을 믿지 않는다', () => {
  it('값이 없으면 기본 순서', () => {
    expect(normalizeSecOrder(undefined)).toEqual(DEFAULT_SEC_ORDER)
    expect(normalizeSecOrder(null)).toEqual(DEFAULT_SEC_ORDER)
    expect(normalizeSecOrder([])).toEqual(DEFAULT_SEC_ORDER)
  })

  it('배열이 아니면 기본 순서 — 손상된 storage 로 화면이 비지 않게', () => {
    expect(normalizeSecOrder('bookmarks')).toEqual(DEFAULT_SEC_ORDER)
    expect(normalizeSecOrder({ 0: 'watch' })).toEqual(DEFAULT_SEC_ORDER)
    expect(normalizeSecOrder(3)).toEqual(DEFAULT_SEC_ORDER)
  })

  it('사용자가 정한 순서는 그대로 지킨다', () => {
    expect(normalizeSecOrder(['watch', 'bookmarks', 'history'])).toEqual(['watch', 'bookmarks', 'history'])
    expect(normalizeSecOrder(['history', 'watch', 'bookmarks'])).toEqual(['history', 'watch', 'bookmarks'])
  })

  it('모르는 키는 버린다 — 없어진 섹션이 남아 있어도 자리를 차지하면 안 된다', () => {
    expect(normalizeSecOrder(['watch', 'sets', 'bookmarks', 'history'])).toEqual(['watch', 'bookmarks', 'history'])
  })

  it('빠진 키는 정본 순서대로 뒤에 채운다 — 섹션이 통째로 사라지는 걸 막는 유일한 방어', () => {
    expect(normalizeSecOrder(['watch'])).toEqual(['watch', 'bookmarks', 'history'])
    expect(normalizeSecOrder(['history', 'bookmarks'])).toEqual(['history', 'bookmarks', 'watch'])
  })

  it('중복은 첫 번째만 남긴다', () => {
    expect(normalizeSecOrder(['watch', 'watch', 'bookmarks'])).toEqual(['watch', 'bookmarks', 'history'])
  })

  it('결과는 언제나 모든 섹션을 정확히 한 번씩 담는다', () => {
    for (const input of [undefined, [], ['x'], ['watch'], ['history', 'history'], ['bookmarks', 'y', 'watch']]) {
      const out = normalizeSecOrder(input)
      expect(out.length).toBe(SECTIONS.length)
      expect([...out].sort()).toEqual([...SECTIONS].sort())
    }
  })

  it('새 배열을 돌려준다 — 호출부가 저장값을 직접 고치지 못하게', () => {
    const src = ['watch', 'bookmarks', 'history']
    expect(normalizeSecOrder(src)).not.toBe(src)
  })
})

describe('moveSection — ▲▼ 한 칸', () => {
  it('위로 한 칸', () => {
    expect(moveSection(DEFAULT_SEC_ORDER, 'watch', -1)).toEqual(['watch', 'bookmarks', 'history'])
  })

  it('아래로 한 칸', () => {
    expect(moveSection(DEFAULT_SEC_ORDER, 'bookmarks', 1)).toEqual(['watch', 'bookmarks', 'history'])
  })

  it('끝에서는 움직이지 않는다 — 순환시키면 맨 위가 갑자기 맨 아래로 가서 눈이 못 따라간다', () => {
    expect(moveSection(DEFAULT_SEC_ORDER, 'bookmarks', -1)).toEqual(DEFAULT_SEC_ORDER)
    expect(moveSection(DEFAULT_SEC_ORDER, 'history', 1)).toEqual(DEFAULT_SEC_ORDER)
  })

  it('모르는 키는 아무 일도 하지 않는다', () => {
    expect(moveSection(DEFAULT_SEC_ORDER, 'sets', -1)).toEqual(DEFAULT_SEC_ORDER)
  })

  it('손상된 저장값 위에서도 안전하다 — 먼저 정규화한 뒤 옮긴다', () => {
    expect(moveSection(['watch'], 'bookmarks', -1)).toEqual(['bookmarks', 'watch', 'history'])
  })

  it('두 번 옮기면 세 섹션 전부 자리를 바꿀 수 있다', () => {
    let o = moveSection(DEFAULT_SEC_ORDER, 'history', -1) // bookmarks, history, watch
    o = moveSection(o, 'history', -1)                     // history, bookmarks, watch
    expect(o).toEqual(['history', 'bookmarks', 'watch'])
  })
})

describe('라벨', () => {
  it('모든 섹션에 사용자가 읽을 이름이 있다 — 설정 목록이 키를 그대로 보여주면 안 된다', () => {
    for (const k of SECTIONS) expect(SECTION_LABEL[k], `라벨 없음: ${k}`).toBeTruthy()
  })
})
