// stat-shortcut.js (MAIN world)
// Alt+A → 거래소 '능력치 필터 추가' 입력을 활성화(드롭다운 열기 + 포커스)해 바로 능력치를 검색.
//
// 왜 MAIN world + Vue 인스턴스 직접 호출인가:
//   vue-multiselect는 합성(synthetic) 이벤트로는 드롭다운이 열리지 않는다(trusted 이벤트 필요).
//   콘텐츠 스크립트는 trusted 이벤트를 만들 수 없으므로, MAIN world에서 컴포넌트 인스턴스
//   (el.__vue__, Vue 2)의 activate()를 직접 호출한다. 실패 시 focus()로 폴백.
(() => {
  const PH = '능력치 필터 추가'
  // 화면에 보이는 '능력치 필터 추가' multiselect 입력들 (능력치 그룹마다 하나씩 생성됨)
  const findInputs = () =>
    [...document.querySelectorAll('input.multiselect__input')].filter((i) => {
      if ((i.placeholder || '').indexOf(PH) < 0) return false
      const r = i.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
  // 마지막(가장 최근 그룹)의 vue-multiselect를 활성화
  const activateLast = () => {
    const inputs = findInputs()
    if (!inputs.length) return false
    const input = inputs[inputs.length - 1]
    const ms = input.closest('.multiselect')
    const vm = ms && ms.__vue__
    try {
      if (vm && typeof vm.activate === 'function') { vm.activate(); return true }
    } catch (_) {}
    try { input.focus() } catch (_) {} // 폴백: 최소한 포커스
    return true
  }
  // 접힌 '능력치 필터' 섹션을 펼침 (보이는 입력이 없을 때만)
  const expandSection = () => {
    const title = [...document.querySelectorAll('.filter-title-clickable, .filter-title')]
      .find((t) => (t.textContent || '').trim() === '능력치 필터')
    if (!title) return false
    title.click()
    return true
  }
  window.addEventListener('keydown', (e) => {
    // Alt+A — e.code로 IME/키보드 레이아웃과 무관하게 물리 A키 인식
    if (e.repeat || !e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyA') return
    if (activateLast()) { e.preventDefault(); return }
    // 섹션이 접혀 있으면 펼친 뒤(Vue 렌더 비동기) 잠깐 폴링하며 재시도
    if (expandSection()) {
      e.preventDefault()
      let n = 0
      const iv = setInterval(() => { if (activateLast() || ++n > 12) clearInterval(iv) }, 30)
    }
  }, true)
  console.log('[BA] stat-shortcut loaded (Alt+A → 능력치 필터 추가)')
})()
