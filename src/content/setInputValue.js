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
 * @param {string} value
 * @returns {'native'|'exec'|'failed'} 'failed' 면 입력칸은 부르기 전 상태 그대로다
 */
export function setInputValue(el, value) {
  if (!el) return 'failed'
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
  // 'failed' 를 "아무것도 안 바뀌었다"로 만들어 두면 부르는 쪽이 단순해진다.
  try {
    if (el.value !== original) write(el, original)
  } catch (_) { /* 최선 노력 — 되돌리기까지 막히면 더 할 수 있는 게 없다 */ }

  return 'failed'
}
