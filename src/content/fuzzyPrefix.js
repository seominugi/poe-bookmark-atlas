// fuzzyPrefix.js (ISOLATED content)
// 능력치(스탯) 필터 검색칸에 포커스가 가면 비어 있을 때 "~"를 자동 입력해
// 퍼지(텍스트) 검색을 기본화한다. React/Vue 제어 입력이라 네이티브 setter + input 이벤트로 반영.

function setControlledValue(el, value) {
  const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
  if (desc && desc.set) desc.set.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// "+ 능력치 필터 추가" 등 스탯 필터 검색 입력칸 식별 (그룹 추가는 제외)
function isStatFilterInput(el) {
  if (!el || el.tagName !== 'INPUT') return false
  const ph = el.getAttribute('placeholder') || ''
  return /능력치\s*필터/.test(ph)
}

export function initFuzzyPrefix() {
  document.addEventListener(
    'focusin',
    (e) => {
      const el = e.target
      if (!isStatFilterInput(el) || el.value !== '') return
      setControlledValue(el, '~')
      try { el.setSelectionRange(1, 1) } catch (_) {}
    },
    true,
  )
}
