// src/content/layout-preload.js
// run_at: document_start — **페이지가 그려지기 전에** 패널이 앉을 자리를 미리 비운다.
//
// 왜 이게 필요한가 (2026-08-15, "왼쪽 배치 시 오른쪽에서 밀리듯 로딩된다" 제보의 진짜 원인):
//   패널을 띄우는 content-main.js 는 `document_idle` 에 돈다 — 거래소 화면이 **이미 다 그려진 뒤**다.
//   그때 <html> 에 margin 412px 을 걸면, 전체 폭으로 그려져 있던 화면이 통째로 밀린다.
//   패널을 감추든(1차), 여백을 미루든(2차), 배치를 동기 캐시로 앞당기든(3차) 소용이 없었다 —
//   셋 다 '첫 페인트 이후'라는 사실을 못 바꾸기 때문이다. 유일한 해법은 첫 페인트 **전에** 거는 것이다.
//
// 정본은 chrome.storage 이고, 여기서 읽는 localStorage 는 panel.js 가 써 두는 거울이다
//   (chrome.storage 는 비동기라 document_start 에서 쓸 수 없다 — 이 스크립트의 존재 이유가 그것이다).
// 캐시가 없으면(첫 설치) 아무것도 하지 않는다. 그 한 번은 예전처럼 밀리고, 그 뒤로 캐시가 생긴다.
// ⛔ 이 파일에는 import 를 쓰지 않는다. crxjs 가 import 를 발견하면 이 스크립트를
//    **비동기 동적 import 로더**로 바꿔 버린다 — 그러면 첫 페인트 뒤에 실행될 수 있어
//    이 파일이 존재하는 이유 자체가 무너진다. (2026-08-16 빌드 산출물로 확인)
//    그래서 접힘 규칙은 src/lib/startCollapsed.js 와 **의도적으로 중복**해 둔다.
//    둘이 갈라지지 않는지는 test/startCollapsed.test.js 가 이 파일의 소스를 읽어 검사한다.
try {
  const v = JSON.parse(localStorage.getItem('baPanelLayout') || 'null')
  const el = document.documentElement
  // startCollapsed() 와 같은 규칙: 사용자가 직접 토글한 값만 믿고, 없으면 창 폭으로 정한다.
  const collapsed = typeof v?.collapsedPref === 'boolean' ? v.collapsedPref : window.innerWidth < 1700
  if (el && v && (v.side === 'left' || v.side === 'right') && !collapsed) {
    const px = (Number(v.width) || 384) + 28 + 'px' // 패널 폭 + 좌우 여백(14+14) — panel.js applyPagePush 와 같은 식
    el.style.setProperty('transition', 'none', 'important') // 미리 거는 여백이 애니메이션되면 그게 또 '밀림'이다
    el.style.setProperty(v.side === 'left' ? 'margin-left' : 'margin-right', px, 'important')
    el.dataset.baPreload = v.side // 뒤에 뜨는 패널이 '이미 자리가 잡혀 있음'을 확인할 수 있게(디버깅용 표식)
  }
} catch (_) {
  // localStorage 가 막힌 환경(쿠키 차단 등)에서는 조용히 포기한다 — 패널 동작 자체엔 영향이 없다.
}
