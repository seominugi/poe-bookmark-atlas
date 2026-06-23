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
  // 1) 포커스 처리
  //    - 페이지 로드 직후(1.2초) "제스처 없는 자동 포커스"는 해제한다 → 새로고침해도
  //      검색칸에 포커스/드롭다운이 잡히지 않는다. 사이트가 다시 포커스해도 최대 10회만 대응(무한 루프 방지).
  //    - 사용자가 직접 클릭/탭(제스처)한 빈 칸에는 "~"를 삽입한다. (실제 클릭은 userActivation이 있어 해제되지 않음)
  const guardUntil = Date.now() + 1200
  let autoBlurs = 0
  document.addEventListener(
    'focusin',
    (e) => {
      const el = e.target
      if (!isTarget(el)) return
      const active = !!(navigator.userActivation && navigator.userActivation.isActive)
      if (!active && Date.now() < guardUntil && autoBlurs < 10) { autoBlurs++; el.blur(); return }
      if (active && el.value === '') prependTilde(el)
    },
    true,
  )

  // 2) 입력 후 "~"가 없으면 보강 — 붙여넣기·전체삭제·영문 첫 입력 복구 (안전망)
  //    한글 IME 조합(isComposing) 중에는 execCommand 호출 금지 → 재귀 호출 경고 발생.
  //    조합 입력은 compositionend에서 보강한다.
  document.addEventListener(
    'input',
    (e) => {
      if (busy || e.isComposing || !isTarget(e.target)) return
      if (!e.target.value.startsWith(PREFIX)) prependTilde(e.target)
    },
    true,
  )
  // 한글 등 IME 조합 종료 후 보강 (조합 중 execCommand 재귀 회피)
  document.addEventListener(
    'compositionend',
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

  // 페이지 로드 시 사이트가 이미 검색칸을 자동 포커스했으면 즉시 해제한다(사용자가 원치 않음).
  if (isTarget(document.activeElement)) { autoBlurs++; document.activeElement.blur() }
}
