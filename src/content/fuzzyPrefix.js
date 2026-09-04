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
//
// 형제 파일: src/content/setInputValue.js 가 **숫자 칸**(능력치 필터의 min/max)에 같은 문제를
// 다룬다. 대상 요소가 겹치지 않아 서로 간섭하지 않는다(여기는 placeholder 로 이름·검색 칸만 고른다).
// execCommand 관련 동작이 바뀌면 두 파일을 함께 봐야 한다.

const PREFIX = '~'
const SETTING_KEY = 'uiFuzzyPrefix'

// 퍼지 접두사 강제 on/off (설정 → 기본 켬). 정확히 일치하는 스탯만 찾으려는 사용자에겐
// "~"가 방해가 된다는 제보로 도입.
// 리스너는 항상 붙이고 '동작'만 이 플래그로 가른다 — initFuzzyPrefix를 async로 만들면
// 아래 1.2초 자동포커스 가드 창을 저장소 응답 대기에 갉아먹혀 기존 동작에 회귀가 난다.
// 끄더라도 '페이지 로드 시 자동 포커스 해제'는 유지한다 — 제보와 무관한 별개 편의 기능이라
// 한 토글에 묶으면 "~"만 끄려던 사용자가 그것까지 잃는다.
let enabled = true

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
  // 0) 설정 로드 + 변경 구독(설정 모달에서 끄면 새로고침 없이 즉시 반영).
  //    chrome이 없는 환경(테스트)에서는 조용히 기본값(켬)을 유지한다.
  try {
    chrome.storage.local.get(SETTING_KEY).then((r) => {
      if (r && typeof r[SETTING_KEY] === 'boolean') enabled = r[SETTING_KEY]
    }).catch(() => {})
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch[SETTING_KEY]) enabled = ch[SETTING_KEY].newValue !== false
    })
  } catch (_) {}

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
      if (enabled && active && el.value === '') prependTilde(el)
    },
    true,
  )

  // 2) 입력 후 "~"가 없으면 보강 — 붙여넣기·전체삭제·영문 첫 입력 복구 (안전망)
  //    한글 IME 조합(isComposing) 중에는 execCommand 호출 금지 → 재귀 호출 경고 발생.
  //    조합 입력은 compositionend에서 보강한다.
  //    완전히 비운 경우(value === '')는 보강하지 않는다 — 안 그러면 검색어를 절대 지울 수 없다
  //    (Backspace·Ctrl+A+Delete 등 무엇으로 지워도 매번 "~"가 즉시 되살아나던 버그, 사용자 제보).
  document.addEventListener(
    'input',
    (e) => {
      if (!enabled || busy || e.isComposing || !isTarget(e.target)) return
      if (e.target.value === '') return
      if (!e.target.value.startsWith(PREFIX)) prependTilde(e.target)
    },
    true,
  )
  // 한글 등 IME 조합 종료 후 보강 (조합 중 execCommand 재귀 회피)
  document.addEventListener(
    'compositionend',
    (e) => {
      if (!enabled || busy || !isTarget(e.target)) return
      if (e.target.value === '') return
      if (!e.target.value.startsWith(PREFIX)) prependTilde(e.target)
    },
    true,
  )

  // 3) 맨 앞 "~" 보호 — Backspace로 삭제하거나 좌측 이동으로 "~" 앞에 입력하지 못하게.
  //    단 "~"만 남았을 때(뒤에 다른 글자 없음)는 막지 않는다 — 그래야 마지막 한 글자까지
  //    지워 검색칸을 완전히 비울 수 있다(위 2번 안전망이 빈 값은 다시 채우지 않으므로 그대로 비워진다).
  document.addEventListener(
    'keydown',
    (e) => {
      const el = e.target
      if (!enabled || !isTarget(el) || !el.value.startsWith(PREFIX)) return
      const s = el.selectionStart ?? 0
      const end = el.selectionEnd ?? 0
      if (e.key === 'Backspace' && s === 1 && end === 1 && el.value.length > PREFIX.length) { e.preventDefault(); return }
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
