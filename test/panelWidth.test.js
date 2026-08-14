// 패널 폭 클램프.
//
// 최소폭 384 는 임의값이 아니다 — 액션 행이 최악 폰트에서 가용 342px 중 336px 을 쓴다
// (test/actionRowBudget.dom.test.js 실측). 더 좁히면 그 행이 줄바꿈된다.
// 2026-08-13 에 300px 까지 내렸다가('narrow 밴드'와 한 세트였다) 같은 날 되돌리고 밴드를 폐기했다.
import { describe, it, expect } from 'vitest'
import { clampPanelWidth, maxPanelWidth, MIN_W, MAX_W } from '../src/lib/panelWidth.js'

describe('clampPanelWidth', () => {
  it('최소·최대 밖은 가둔다', () => {
    expect(clampPanelWidth(10, 1920)).toBe(MIN_W)
    expect(clampPanelWidth(99999, 1920)).toBe(MAX_W)
  })

  it('창이 좁으면 상한이 함께 내려간다 — 패널이 화면을 다 덮지 않게', () => {
    expect(maxPanelWidth(800)).toBe(640) // 800 - 160
    expect(clampPanelWidth(880, 800)).toBe(640)
  })

  it('창이 아주 좁아도 최소폭 아래로는 안 내려간다 (거래소가 안 보여도 패널은 쓸 수 있어야 한다)', () => {
    expect(maxPanelWidth(200)).toBe(MIN_W)
    expect(clampPanelWidth(500, 200)).toBe(MIN_W)
  })

  it('값이 없으면 최소폭(= 폭 조절 도입 전 고정폭)으로 떨어진다', () => {
    expect(clampPanelWidth(undefined, 1920)).toBe(MIN_W)
    expect(clampPanelWidth('abc', 1920)).toBe(MIN_W)
    expect(clampPanelWidth(null, 1920)).toBe(MIN_W) // Number(null)=0 → 최소로 가지 않게
  })

  // 2026-08-13 라이브 드래그로 발견. 하한을 지나쳐 끌면 startW + delta 가 음수로 들어오는데,
  // '값 없음'과 뭉뚱그려 처리하면 기본폭으로 튀어 오른다 — 좁히려는데 되레 넓어진다.
  it('음수는 값 없음이 아니라 진짜 요청 — 최소폭으로 눌러 담는다', () => {
    expect(clampPanelWidth(-516, 1920)).toBe(MIN_W)
    expect(clampPanelWidth(0, 1920)).toBe(MIN_W)
  })

  it('정수로 떨어진다 — 소수 px 은 핸들 위치를 미세하게 어긋나게 한다', () => {
    expect(Number.isInteger(clampPanelWidth(432.7, 1920))).toBe(true)
  })
})
