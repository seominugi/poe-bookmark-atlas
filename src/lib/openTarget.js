// src/lib/openTarget.js
// 저장된 검색을 **어디에** 열 것인가 — 설정값과 수식키를 한 규칙으로 합친다.
//
// 규칙: 수식키(Ctrl/⌘)는 값을 정하지 않고 **설정을 뒤집는다**. 브라우저 링크의 보편 동작이라
// 사용자가 따로 배울 게 없고, 기본이 '새 탭'인 사람에게도 수식키가 여전히 쓸모를 갖는다
// (Ctrl=새 탭으로 고정하면 그 사람에겐 수식키가 죽은 키가 된다).
export function shouldOpenNewTab(prefNewTab, hasModifier) {
  return !!prefNewTab !== !!hasModifier
}

/** 클릭 이벤트에서 수식키 여부만 뽑는다 — 이벤트가 없는 호출부(대화상자 이후 등)는 false. */
export function hasOpenModifier(e) {
  return !!(e && (e.ctrlKey || e.metaKey))
}
