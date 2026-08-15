// src/lib/startCollapsed.js
// "패널을 접힌 채로 시작할 것인가" — **한 곳에서만** 정한다.
//
// 왜 모듈로 뺐나 (2026-08-16): 같은 규칙이 layout-preload.js(document_start 선반영)와
// panel.js(마운트) 두 곳에 각각 적혀 있었고, 한쪽만 고치는 바람에 둘이 어긋났다.
// 어긋나면 증상이 바로 눈에 띈다 — 마운트가 창 폭으로 **추측해 접고**, 곧이어 도착한
// storage 가 **펴면서** collapsed 의 translateX(±132%) 가 풀린다. 그게 페이지를 열 때마다
// 패널이 가장자리에서 밀려 들어오는 모션이다(고빈도라 넣지 않기로 한 효과).
//
// 규칙: 사용자가 직접 접고 펴 본 적이 있으면 그 선택만 믿는다. 없을 때만 창 폭으로 정한다.
export const AUTO_COLLAPSE_MAX_W = 1700 // 이보다 좁으면 거래소 검색 영역과 겹쳐서 접고 시작한다

export function startCollapsed(cache, innerWidth) {
  // ⚠ 창 폭 때문에 접힌 '일시 상태'는 collapsedPref 로 저장하지 않는다(호출부 책임).
  //   그게 굳으면 넓은 화면에서도 계속 접힌 채라 사용자에겐 '패널이 사라진' 것으로 보인다.
  if (typeof (cache && cache.collapsedPref) === 'boolean') return cache.collapsedPref
  return innerWidth < AUTO_COLLAPSE_MAX_W
}
