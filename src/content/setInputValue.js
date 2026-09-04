// src/content/setInputValue.js
// Vue 가 제어하는 입력칸에 값을 넣는다. 성공했는지 **읽어서 확인**하고, 안 되면 다음 경로로 간다.
//
// 배경: fuzzyPrefix.js 가 기록한 대로 능력치 이름 칸(vue-multiselect)은 네이티브 setter 로 넣으면
// Vue 가 즉시 되돌린다. 숫자 칸도 그럴지는 확인되지 않았으므로 실패를 정상 경로로 다룬다.
// execCommand('insertText') 는 user activation 이 있을 때만 동작하는데, 칩 클릭 핸들러 안이라 보장된다.

const nativeSetter = () =>
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

/**
 * @param {HTMLInputElement|null} el
 * @param {string} value
 * @returns {'native'|'exec'|'failed'}
 */
export function setInputValue(el, value) {
  if (!el) return 'failed'
  const text = String(value)

  // 1) 네이티브 setter + 이벤트 — Vue 는 addEventListener 로 듣기 때문에 isTrusted 여부는 상관없다
  try {
    const set = nativeSetter()
    if (set) {
      set.call(el, text)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      if (el.value === text) return 'native'
    }
  } catch (_) { /* 다음 경로 */ }

  // 2) 실제 타이핑 경로 — 값을 비우고 넣는다
  try {
    el.focus()
    el.select?.()
    if (document.execCommand('insertText', false, text) && el.value === text) return 'exec'
  } catch (_) { /* 다음 경로 */ }

  return 'failed'
}
