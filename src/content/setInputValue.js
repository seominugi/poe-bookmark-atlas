// src/content/setInputValue.js
// Vue 가 제어하는 입력칸에 값을 넣는다. 성공했는지 **읽어서 확인**하고, 안 되면 다음 경로로 간다.
//
// 배경: fuzzyPrefix.js 가 기록한 대로 능력치 이름 칸(vue-multiselect)은 네이티브 setter 로 넣으면
// Vue 가 즉시 되돌린다. 숫자 칸도 그럴지는 확인되지 않았으므로 실패를 정상 경로로 다룬다.
// execCommand('insertText') 는 user activation 이 있을 때만 동작하는데, 칩 클릭 핸들러 안이라 보장된다.

const nativeSetter = () =>
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

/** 값을 써 넣고 Vue 가 듣는 이벤트를 발생시킨다. */
function write(el, text) {
  const set = nativeSetter()
  if (set) set.call(el, text)
  else el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * @param {HTMLInputElement|null} el
 * @param {string|number} value
 * @returns {'native'|'exec'|'failed'}
 *
 * `'failed'` 면 **원래 값으로 되돌리려 시도한다 — 보장이 아니라 최선 노력이다.**
 * 무엇을 넣든 덮어쓰는 칸(범위 밖 값을 항상 잘라내는 검증기 등)은 복구도 같은 방해를 받는다.
 * 그런 칸은 어떤 방법으로도 이길 수 없으므로, 부르는 쪽은 `'failed'` 를 "값이 안 들어갔다"로만
 * 읽고 화면 상태를 스스로 가정하지 않아야 한다.
 */
export function setInputValue(el, value) {
  // null·undefined 를 그냥 넘기면 String() 이 "null" 을 만들어 검색창에 글자로 박힌다.
  // 설계상 여기 올 일은 없지만, 오면 조용히 틀린 검색이 되므로 입구에서 끊는다.
  if (!el || value == null) return 'failed'
  const text = String(value)
  const original = el.value // 다 실패하면 여기로 되돌린다

  // 1) 네이티브 setter + 이벤트 — Vue 는 addEventListener 로 듣기 때문에 isTrusted 여부는 상관없다
  try {
    write(el, text)
    if (el.value === text) return 'native'
  } catch (_) { /* 다음 경로 */ }

  // 2) 실제 타이핑 경로 — 값을 비우고 넣는다
  try {
    el.focus()
    el.select?.()
    if (document.execCommand('insertText', false, text) && el.value === text) return 'exec'
  } catch (_) { /* 다음 경로 */ }

  // 3) 둘 다 실패. 이때 칸에는 우리가 넣으려던 값도, 사용자의 원래 값도 아닌 것이 남아 있을 수 있다 —
  // 상한이 걸린 칸이면 Vue 가 잘라서 써 넣는다. 그대로 두면 사용자는 넣지도 않은 숫자로 검색하게 된다.
  // 되돌려 보되 결과를 확인하지는 않는다: 모든 입력을 덮어쓰는 칸이면 이 시도도 같은 방해를 받고,
  // 그때 할 수 있는 게 더 없다(위 JSDoc 의 '최선 노력'이 이 뜻이다).
  try {
    if (el.value !== original) write(el, original)
  } catch (_) { /* 되돌리기까지 막히면 더 할 수 있는 게 없다 */ }

  return 'failed'
}
