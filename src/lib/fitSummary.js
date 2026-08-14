// src/lib/fitSummary.js
// 조건 요약을 '조건 경계'에서 끊는다 — 글자 중간에서 자르는 말줄임 대신.
//
// 왜 (2026-08-13 제보 "말줄임 최소화"에 대한 실측 결론):
//   조건 요약은 조건 수 × 스탯명 길이라, 어떤 폭에서도 다 안 들어간다.
//   실측(북마크 26개) — 잘림 비율: 384px 65% / 480px 58% / 880px **46%**. 넓혀도 절반이 잘린다.
//   보완책들도 계산해 봤지만 전부 부족했다:
//     · 2줄 허용 → 65%→54%(384) / 46%→31%(880). 카드 +18px 을 내고 11~15%p 만 산다.
//     · 반복 단어 압축 → 전체 절감 잠재력 20%. 최장 169자는 41% 줄여도 100자라 여전히 안 들어간다.
//   그래서 "다 보여준다"를 포기하고 **보이는 것만은 온전하게** 한다. 남은 개수는 왼쪽의
//   '조건 N개' 배지가 이미 말해주고, 전체는 호버 툴팁에 그대로 있다.
//
// CSS 로는 불가능하다(text-overflow 는 글자 단위) — 그래서 측정이 필요하다.

export const SEP = ' · '

/**
 * 들어가는 만큼의 조건만 남긴다. 최소 1개는 남긴다 —
 * 하나도 못 넣으면 빈 칸이 되는데, 그건 잘린 것보다 나쁘다(그 경우는 CSS 말줄임에 맡긴다).
 *
 * @param {string} full 전체 요약 ('A · B · C')
 * @param {number} available 쓸 수 있는 px
 * @param {(s:string)=>number} measure 문자열 → px (canvas measureText 등)
 * @returns {string} 잘라낸 요약
 */
export function fitByParts(full, available, measure) {
  const text = typeof full === 'string' ? full : ''
  if (!text) return ''
  if (!(available > 0) || typeof measure !== 'function') return text
  if (measure(text) <= available) return text // 통째로 들어가면 그대로

  const parts = text.split(SEP)
  if (parts.length <= 1) return text // 조건이 하나뿐이면 끊을 경계가 없다 → CSS 말줄임에 맡긴다

  let kept = parts[0]
  for (let i = 1; i < parts.length; i++) {
    const next = kept + SEP + parts[i]
    if (measure(next) > available) break
    kept = next
  }
  return kept
}

/** 요소의 계산된 폰트로 폭을 재는 함수를 만든다. 캔버스라 리플로가 없다. */
export function makeMeasurer(el, doc = (el && el.ownerDocument) || document) {
  const cs = (doc.defaultView || window).getComputedStyle(el)
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`
  const ctx = doc.createElement('canvas').getContext('2d')
  if (!ctx) return null
  ctx.font = font
  const cache = new Map()
  return (s) => {
    let w = cache.get(s)
    if (w === undefined) { w = ctx.measureText(s).width; cache.set(s, w) }
    return w
  }
}

/**
 * 목록 안의 모든 조건 요약을 다시 맞춘다. 폭이 바뀔 때마다 불린다.
 *
 * ⚠ 읽기(폭)를 전부 끝낸 뒤에 쓰기(텍스트)를 한다 — 섞으면 요소마다 강제 리플로가 걸려
 *   카드가 수십 개일 때 눈에 띄게 느려진다(레이아웃 스래싱).
 * 원본은 dataset.full 에 담아둔다 — 다시 넓혔을 때 되돌릴 근거가 필요하다.
 */
export function fitCondSummaries(rootEl) {
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return 0
  const els = [...rootEl.querySelectorAll('.ba-cond-tx')]
  if (!els.length) return 0

  const measure = makeMeasurer(els[0])
  if (!measure) return 0

  // ① 먼저 전부 원문으로 되돌린다.
  //    ⚠ 이 단계가 없으면 **다시 넓혀도 복원되지 않는다.** 줄인 뒤의 clientWidth 는 '쓸 수 있는 폭'이
  //    아니라 '줄어든 내용의 폭'이라, 그 값으로 다시 재면 계속 줄어든 상태에 갇힌다.
  for (const el of els) {
    if (el.dataset.full === undefined) el.dataset.full = el.textContent || ''
    el.textContent = el.dataset.full
  }
  // ② 읽기만 — 위 쓰기가 여기서 한 번에 반영된다(요소마다 강제 리플로가 걸리지 않게 읽기/쓰기를 분리).
  const jobs = els.map((el) => ({ el, full: el.dataset.full, available: el.clientWidth }))
  // ③ 쓰기만
  let changed = 0
  for (const { el, full, available } of jobs) {
    const next = fitByParts(full, available, measure)
    if (el.textContent !== next) { el.textContent = next; changed++ }
  }
  return changed
}
