// stat-shortcut.js (MAIN world)
// 거래소 능력치 필터 단축키 — Alt+A: '능력치 필터 추가', Alt+G: '능력치 그룹 추가'.
// 해당 입력(vue-multiselect)을 활성화(드롭다운 열기 + 포커스)해 바로 검색/선택하게 한다.
//
// 왜 MAIN world + Vue 인스턴스 직접 호출인가:
//   vue-multiselect는 합성(synthetic) 이벤트로는 드롭다운이 열리지 않는다(trusted 이벤트 필요).
//   콘텐츠 스크립트는 trusted 이벤트를 만들 수 없으므로, MAIN world에서 컴포넌트 인스턴스
//   (el.__vue__, Vue 2)의 activate()를 직접 호출한다. 실패 시 focus()로 폴백.
(() => {
  // Alt+<key> → 해당 multiselect placeholder 매핑 (e.code로 한글 IME/레이아웃 무관)
  const MAP = [
    { code: 'KeyA', ph: '능력치 필터 추가' },
    { code: 'KeyG', ph: '능력치 그룹 추가' },
  ]
  // 화면에 보이는, placeholder가 일치하는 multiselect 입력들 (그룹마다 하나씩 생길 수 있음)
  const findInputs = (ph) =>
    [...document.querySelectorAll('input.multiselect__input')].filter((i) => {
      if ((i.placeholder || '').indexOf(ph) < 0) return false
      const r = i.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
  // 마지막(가장 최근 그룹)의 vue-multiselect를 활성화
  const activateLast = (ph) => {
    const inputs = findInputs(ph)
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
  // 접힌 '능력치 필터' 섹션을 펼침 (필터 추가·그룹 추가 모두 이 섹션 안에 있음)
  const expandSection = () => {
    const title = [...document.querySelectorAll('.filter-title-clickable, .filter-title')]
      .find((t) => (t.textContent || '').trim() === '능력치 필터')
    if (!title) return false
    title.click()
    return true
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !e.altKey || e.ctrlKey || e.metaKey) return
    const m = MAP.find((x) => x.code === e.code)
    if (!m) return
    if (activateLast(m.ph)) { e.preventDefault(); return }
    // 섹션이 접혀 있으면 펼친 뒤(Vue 렌더 비동기) 잠깐 폴링하며 재시도
    if (expandSection()) {
      e.preventDefault()
      let n = 0
      const iv = setInterval(() => { if (activateLast(m.ph) || ++n > 12) clearInterval(iv) }, 30)
    }
  }, true)
  console.log('[BA] stat-shortcut loaded (Alt+A 능력치 필터 추가 / Alt+G 능력치 그룹 추가)')
})()
