// fuzzyPrefix.js (ISOLATED content)
// 거래소의 "아이템 검색" · "+ 능력치 필터 추가" 입력칸에 항상 맨 앞 "~"를 유지해
// 퍼지(부분 일치) 검색을 기본화한다. 실수로 "~"를 지워도 자동 복구한다.
//
// 구현 메모(중요):
//  - 이 입력칸은 vue-multiselect 제어 입력이라 네이티브 value setter로 값을 넣으면
//    Vue가 즉시 되돌린다 → 이전 버전(native setter + input 이벤트)이 동작하지 않던 근본 원인.
//  - 실제 타이핑 경로인 document.execCommand('insertText')로 넣으면 정상 반영된다.
//    단 execCommand는 user activation(실제 사용자 제스처)이 있을 때만 동작하므로,
//    클릭·타이핑 등 제스처가 있는 순간엔 항상 보장된다. 제스처 없는 자동 포커스(페이지 로드)는
//    첫 키 입력 시점의 input 핸들러가 "~"를 보강한다(라이브 trusted 입력으로 검증).

const PREFIX = '~'

// 스탯 필터("+ 능력치 필터 추가") · 아이템 검색("아이템 검색…")만 대상.
// "+ 능력치 그룹 추가"는 정규식상 자동 제외된다.
function isTarget(el) {
  if (!el || el.tagName !== 'INPUT') return false
  const ph = el.getAttribute('placeholder') || ''
  return /능력치\s*필터/.test(ph) || /아이템\s*검색/.test(ph)
}

let busy = false // execCommand가 다시 input을 발생시켜 재진입하는 것 방지
// 맨 앞에 "~" 삽입. execCommand는 포커스된 입력에 실제 타이핑처럼 반영된다.
function prependTilde(el) {
  if (busy) return
  busy = true
  try {
    const caret = el.selectionStart ?? 0
    el.setSelectionRange(0, 0)
    document.execCommand('insertText', false, PREFIX)
    const c = Math.max(1, caret + 1)
    try { el.setSelectionRange(c, c) } catch (_) {}
  } finally {
    busy = false
  }
}

export function initFuzzyPrefix() {
  // 1) 포커스 진입 시 빈 칸이면 "~" 미리 삽입 (클릭=제스처가 있어 바로 반영)
  document.addEventListener(
    'focusin',
    (e) => { if (isTarget(e.target) && e.target.value === '') prependTilde(e.target) },
    true,
  )

  // 2) 입력 후 "~"가 없으면 보강 — 첫 글자 입력·붙여넣기·전체삭제 모두 복구 (안전망)
  document.addEventListener(
    'input',
    (e) => {
      if (busy || !isTarget(e.target)) return
      if (!e.target.value.startsWith(PREFIX)) prependTilde(e.target)
    },
    true,
  )

  // 3) 맨 앞 "~" 보호 — Backspace로 삭제하거나 좌측 이동으로 "~" 앞에 입력하지 못하게
  document.addEventListener(
    'keydown',
    (e) => {
      const el = e.target
      if (!isTarget(el) || !el.value.startsWith(PREFIX)) return
      const s = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      if (e.key === 'Backspace' && s === 1 && end === 1) { e.preventDefault(); return }
      if ((e.key === 'Home' || e.key === 'ArrowLeft') && s <= 1 && !e.shiftKey) {
        e.preventDefault()
        try { el.setSelectionRange(1, 1) } catch (_) {}
      }
    },
    true,
  )

  // 4) 페이지 로드 시 이미 포커스된 빈 칸(자동 포커스) — 제스처가 없으면 첫 입력에서 보강된다
  if (isTarget(document.activeElement) && document.activeElement.value === '') prependTilde(document.activeElement)
}
