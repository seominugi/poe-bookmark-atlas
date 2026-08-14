// src/lib/panelWidth.js
// 패널 폭 — 드래그로 조절하고 uiPanelWidth 에 저장한다.
//
// ⚠ 최소폭 384 는 임의값이 아니다. 액션 행이 최악 폰트(system-ui·Malgun)에서 가용 342px 중
//   336px 을 쓴다(test/actionRowBudget.dom.test.js 실측). 더 좁히면 그 행이 줄바꿈된다.
//   2026-08-13 에 300px 까지 내렸다가(라벨·아이콘을 접는 'narrow 밴드'와 한 세트였다)
//   같은 날 사용자 결정으로 384 로 되돌리고 밴드 코드를 정리했다 — 복원이 필요하면 커밋 f66765d.

export const MIN_W = 384
export const MAX_W = 880

/** 창이 좁아지면 상한도 내려간다 — 패널이 화면을 다 덮지 않게. 160px 은 거래소를 볼 최소 여지. */
export function maxPanelWidth(viewportW) {
  return Math.max(MIN_W, Math.min(MAX_W, (Number(viewportW) || 0) - 160))
}

/**
 * 저장값·드래그값을 실제 적용 가능한 폭으로.
 *
 * ⚠ '값 없음'과 '작은 값'을 구분해야 한다. 둘을 뭉뚱그리면 양쪽에서 다르게 터진다:
 *   - `Number(null)` 은 0 이라, 유한수 검사만 하면 **값 없음이 0px 요청으로** 읽혀 최소폭까지 쪼그라든다.
 *   - 그렇다고 `n > 0` 으로 막으면, 드래그가 하한을 지나쳐 **음수가 될 때 기본폭으로 튀어 오른다**
 *     — 좁히려고 계속 끄는데 패널이 되레 넓어진다(라이브 드래그로 발견, 2026-08-13).
 *   그래서 '값 없음'만 따로 판정하고, 숫자는 음수든 0 이든 **진짜 요청으로 보고 하한에 눌러 담는다.**
 */
export function clampPanelWidth(w, viewportW) {
  const n = Number(w)
  const missing = w === null || w === undefined || w === '' || !Number.isFinite(n)
  const base = missing ? MIN_W : n
  return Math.round(Math.max(MIN_W, Math.min(maxPanelWidth(viewportW), base)))
}
