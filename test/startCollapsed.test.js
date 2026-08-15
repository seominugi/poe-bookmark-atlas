import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { startCollapsed, AUTO_COLLAPSE_MAX_W } from '../src/lib/startCollapsed.js'

// 이 규칙이 layout-preload(선반영)와 panel.js(마운트)에서 갈라지면,
// 마운트가 접은 걸 storage 가 펴면서 페이지 로드마다 패널이 가장자리에서 밀려 들어온다.
describe('startCollapsed', () => {
  it('사용자가 직접 편 적이 있으면 좁은 창에서도 펼친 채 시작한다', () => {
    expect(startCollapsed({ collapsedPref: false }, 1200)).toBe(false)
  })

  it('사용자가 직접 접은 적이 있으면 넓은 창에서도 접힌 채 시작한다', () => {
    expect(startCollapsed({ collapsedPref: true }, 2560)).toBe(true)
  })

  it('선호가 없으면(첫 사용) 창 폭으로 정한다', () => {
    expect(startCollapsed(null, AUTO_COLLAPSE_MAX_W - 1)).toBe(true)
    expect(startCollapsed(null, AUTO_COLLAPSE_MAX_W)).toBe(false)
    expect(startCollapsed({}, 1000)).toBe(true)
  })

  it('collapsedPref 가 boolean 이 아니면 선호로 치지 않는다', () => {
    expect(startCollapsed({ collapsedPref: 'true' }, 2560)).toBe(false)
  })
})

// layout-preload 는 첫 페인트 전에 **동기로** 끝나야 해서 이 모듈을 import 할 수 없다
// (crxjs 가 import 를 보면 비동기 동적 import 로더로 바꾼다). 그래서 규칙이 중복돼 있고,
// 중복이 갈라지지 않는지를 여기서 지킨다.
describe('layout-preload 의 중복 규칙', () => {
  const src = readFileSync(new URL('../src/content/layout-preload.js', import.meta.url), 'utf8')

  it('import 를 쓰지 않는다 (쓰면 비동기 로더가 되어 선반영이 무의미해진다)', () => {
    expect(/^\s*import\s/m.test(src)).toBe(false)
  })

  it('접힘 임계값이 startCollapsed 와 같다', () => {
    expect(src).toContain(`window.innerWidth < ${AUTO_COLLAPSE_MAX_W}`)
  })

  it('collapsedPref 를 우선 신뢰한다', () => {
    expect(src).toContain("typeof v?.collapsedPref === 'boolean'")
  })
})
