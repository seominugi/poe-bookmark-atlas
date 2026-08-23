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

// ── 폭 밴드 ──────────────────────────────────────────────────────────
// 넓힌 폭을 무엇으로 바꿔 줄지의 경계. 라운드 숫자로 고른 게 아니라 **각 구간이 줄바꿈 없이
// 한 줄에 들어가는 실측 최소폭**(max-content)에 최악 폰트(system-ui·Malgun) 여유를 얹었다.
//   상단 액션(저장·시세·동향) 336 / 목록 머리(제목·검색·정렬) 462 → 둘 다 500 에서 쾌적
//   푸터(문구·소셜3·가이드·설정) 580 · 카드 한 줄 승격(조건 요약 안 잘림) 643 → 640
//   카드 액션바(라이브·복사·갱신, 89px) → 640 에 붙이면 조건 칸이 57px 로 죽는다.
//     ⚠ 첫 추정 760 은 목업(짧은 리그명) 기준이었다. 하네스 실측(리그명 'Runes of Aldur')에선
//       760 에서 조건 칸이 86px 까지 떨어진다. 820 에서 120px 로, 시안에서 합의한 폭에 가장 가깝다.
// ⚠ 여기 숫자를 늘릴 땐 반드시 다시 재라. test/panelBand.test.js 가 경계를, 
//   test/panelBands.dom.test.js 가 "그 폭에서 정말 한 줄인가"를 지킨다.
export const BAND_M = 500   // 상단 3버튼 + 검색 합류
export const BAND_L = 640   // 푸터 한 줄 + 카드 한 줄 승격
export const BAND_XL = 820  // 카드 액션바 상시 노출

/** 폭 → 밴드 이름. CSS 는 .ba-root[data-band] 로 이 값을 받는다. */
export function panelBand(w) {
  const n = Number(w) || 0
  if (n >= BAND_XL) return 'xl'
  if (n >= BAND_L) return 'l'
  if (n >= BAND_M) return 'm'
  return 's'
}

/**
 * 다음 밴드까지 남은 거리 — 드래그 배지가 "얼마나 더 가면 무엇을 얻나"를 말하게 한다.
 * 창이 좁아 다음 경계에 닿을 수 없으면 null 이다(닿지 못할 보상을 약속하지 않는다).
 */
export function nextBandAt(w, viewportW) {
  const n = Number(w) || 0
  const cap = maxPanelWidth(viewportW)
  const at = [BAND_M, BAND_L, BAND_XL].find((b) => n < b && b <= cap)
  return at === undefined ? null : { at, band: panelBand(at), remain: at - n }
}

/** 스테퍼가 찍을 정거장. 밴드 경계와 **같은 값이어야** 한다 — 여기서 다시 적지 않고 파생시킨다. */
export const BAND_STOPS = [MIN_W, BAND_M, BAND_L, BAND_XL]

/**
 * 드래그 배지 스테퍼가 그릴 상태. 계산을 여기 두는 이유는 px 판단을 한 곳에 모으기 위해서다
 * (panel.js 가 경계를 다시 알면 두 곳이 갈라진다 — 폭 결합 4곳이 하드코딩돼 틈이 생겼던 그 사고).
 *
 *  done : 이미 지나온 정거장
 *  at   : 지금 서 있는 구간
 *  up   : 바로 다음 정거장 (⚠ 'next' 라 부르지 않는다 — 배지 문구 클래스와 이름이 겹친다)
 *  off  : 창이 좁아 **닿을 수 없는** 정거장. 닿지 못할 곳을 켜 두면 배지가 거짓말을 한다
 *  todo : 그 외 앞쪽 정거장
 *
 * fill 은 현재 구간의 진행도 0~1 — 다음 정거장까지 얼마나 왔는지를 막대로 채우는 데 쓴다.
 */
export function bandProgress(w, viewportW) {
  const n = clampPanelWidth(w, viewportW)
  const cap = maxPanelWidth(viewportW)
  const idx = BAND_STOPS.filter((s) => n >= s).length - 1
  const stops = BAND_STOPS.map((at, i) => {
    let state = 'todo'
    if (at > cap) state = 'off'
    else if (i < idx) state = 'done'
    else if (i === idx) state = 'at'
    else if (i === idx + 1) state = 'up'
    return { at, state }
  })
  const from = BAND_STOPS[idx]
  const to = BAND_STOPS[idx + 1]
  const reachable = to !== undefined && to <= cap
  const fill = reachable ? Math.max(0, Math.min(1, (n - from) / (to - from))) : 0
  return { index: idx, stops, fill }
}

/**
 * 설정 세그먼트의 4단. '최대'만 창 폭에서 파생된다 — 고정 880 으로 박으면 좁은 창에서
 * 눌러도 안 되는 버튼이 된다. 반대로 고정값 프리셋은 창이 좁으면 아예 못 쓰므로 enabled:false 로 알린다.
 */
export function widthPresets(viewportW) {
  const cap = maxPanelWidth(viewportW)
  return [
    { key: 'base', w: MIN_W, enabled: true },
    { key: 'wide', w: BAND_M, enabled: cap >= BAND_M },
    { key: 'wider', w: BAND_L, enabled: cap >= BAND_L },
    { key: 'max', w: cap, enabled: true }, // 항상 유효 — 값 자체가 상한이다
  ]
}

/**
 * 지금 폭이 어느 프리셋에 해당하는가 = **자기 이하 중 가장 큰 프리셋**.
 * 밴드로 판정하지 않는 이유: '더 넓게'(640)와 '최대'가 같은 밴드에 속할 수 있다.
 * 이 규칙이면 드래그로 601px 에 멈춰도 세그먼트가 늘 하나를 가리킨다(빈 선택이 없다).
 */
export function activePreset(w, viewportW) {
  const n = clampPanelWidth(w, viewportW)
  const ps = widthPresets(viewportW).filter((p) => p.enabled && p.w <= n)
  return ps.length ? ps[ps.length - 1].key : 'base'
}
