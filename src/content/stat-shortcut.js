// stat-shortcut.js (MAIN world)
// 거래소 능력치 필터 단축키 — Alt+A: '능력치 필터 추가', Alt+G: '능력치 그룹 추가'.
// 카카오(한글)·pathofexile(영문) 양쪽 거래소의 placeholder를 모두 지원한다.
// 능력치 그룹이 여럿이면, 드롭다운이 열린 상태에서 Alt+A를 다시 눌러 그룹별 '필터 추가'를 순환 전환한다.
//
// 왜 MAIN world + Vue 인스턴스 직접 호출인가:
//   vue-multiselect는 합성(synthetic) 이벤트로는 드롭다운이 열리지 않는다(trusted 이벤트 필요).
//   콘텐츠 스크립트는 trusted 이벤트를 만들 수 없으므로, MAIN world에서 컴포넌트 인스턴스
//   (el.__vue__, Vue 2)의 activate()/deactivate()를 직접 호출한다. 실패 시 focus()로 폴백.
(() => {
  // Alt+<key> → placeholder 후보(한글/영문). e.code로 한글 IME/레이아웃 무관.
  const MAP = [
    { code: 'KeyA', ph: ['능력치 필터 추가', 'Add Stat Filter'] },
    { code: 'KeyG', ph: ['능력치 그룹 추가', 'Add Stat Group'] },
  ]
  const SECTION_TITLES = ['능력치 필터', 'Stat Filters'] // 접힌 섹션 펼치기용(한/영)
  const lastIdx = {} // code별 마지막 대상 인덱스 (그룹 여럿일 때 순환/재개용)

  // 화면에 보이는, placeholder가 후보 중 하나를 포함하는 multiselect 입력들 (위→아래 = 그룹 순서)
  const findInputs = (phs) =>
    [...document.querySelectorAll('input.multiselect__input')].filter((i) => {
      const p = i.placeholder || ''
      if (!phs.some((ph) => p.indexOf(ph) >= 0)) return false
      const r = i.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
  const msOf = (input) => input && input.closest('.multiselect')
  const isOpen = (input) => { const ms = msOf(input); return !!(ms && ms.classList.contains('multiselect--active')) }
  const deactivate = (input) => { const ms = msOf(input); try { ms && ms.__vue__ && ms.__vue__.deactivate && ms.__vue__.deactivate() } catch (_) {} }
  const activate = (input) => {
    const ms = msOf(input); const vm = ms && ms.__vue__
    try { if (vm && typeof vm.activate === 'function') { vm.activate(); return true } } catch (_) {}
    try { input.focus() } catch (_) {} // 폴백: 최소한 포커스
    return true
  }

  // 활성화 또는 순환:
  //  - 이미 열려 있으면 '다음' 그룹의 필터 추가로 전환(현재 닫고 → 다음 열기, 끝이면 처음으로)
  //  - 닫혀 있으면 마지막 대상(기억값, 기본=마지막/최근 그룹)을 활성화 → 같은 그룹에 계속 추가
  const activateOrCycle = (m) => {
    const inputs = findInputs(m.ph)
    const n = inputs.length
    if (!n) return false
    const openIdx = inputs.findIndex(isOpen)
    let target
    if (openIdx >= 0) {
      target = (openIdx + 1) % n
      deactivate(inputs[openIdx])
    } else {
      const prev = lastIdx[m.code]
      target = prev == null || prev >= n ? n - 1 : prev
    }
    lastIdx[m.code] = target
    return activate(inputs[target])
  }

  // 접힌 능력치 필터 섹션을 펼침 (필터 추가·그룹 추가 모두 이 섹션 안에 있음)
  const expandSection = () => {
    const title = [...document.querySelectorAll('.filter-title-clickable, .filter-title')]
      .find((t) => SECTION_TITLES.includes((t.textContent || '').trim()))
    if (!title) return false
    title.click()
    return true
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat || !e.altKey || e.ctrlKey || e.metaKey) return
    const m = MAP.find((x) => x.code === e.code)
    if (!m) return
    if (activateOrCycle(m)) { e.preventDefault(); return }
    // 섹션이 접혀 있으면 펼친 뒤(Vue 렌더 비동기) 잠깐 폴링하며 재시도
    if (expandSection()) {
      e.preventDefault()
      let k = 0
      const iv = setInterval(() => { if (activateOrCycle(m) || ++k > 12) clearInterval(iv) }, 30)
    }
  }, true)
  console.log('[BA] stat-shortcut loaded (Alt+A 필터 추가/순환 · Alt+G 그룹 추가 · 한/영 지원)')
})()
