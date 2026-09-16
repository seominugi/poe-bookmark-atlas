// src/content/page-tip.js
// 거래소 페이지 위에 그리는 우리 툴팁(#ba-page-tip). 네이티브 title 툴팁은 쓰지 않는다 — 운영체제 회색 상자라
// 확장의 유리 디자인과 어긋난다(사용자 결정 2026-09-16). 모양은 content-main 의 pobEnsureStyle 이 정한다.
//
// data-tip 의 《…》 는 강조색 span 으로 바꾼다(패널 .ba-tip 과 같은 관례). 줄바꿈(\n)은 CSS pre-line 으로 살린다.

let tipEl = null

export function ensurePageTip(doc = document) {
  if (tipEl && tipEl.ownerDocument === doc && doc.contains(tipEl)) return tipEl
  tipEl = doc.createElement('div')
  tipEl.id = 'ba-page-tip'
  doc.body.appendChild(tipEl)
  return tipEl
}

export function hidePageTip() {
  if (tipEl) tipEl.classList.remove('show')
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/**
 * el 에 마우스를 올리면 data-tip 을 우리 툴팁으로 띄운다. 한 요소에 한 번만 묶는다.
 * @param {Element} el
 * @param {{placement?:'right'|'below'}} [opts]
 *   right — 요소 오른쪽 가운데(좁은 좌측 컬럼의 버튼용, 기존 동작)
 *   below — 요소 아래 왼쪽 정렬, 모자라면 위로(목록 행처럼 폭이 넓은 요소용)
 */
export function bindPageTip(el, { placement = 'right' } = {}) {
  if (!el || el.dataset.baTipBound) return
  el.dataset.baTipBound = '1'
  const doc = el.ownerDocument
  const win = doc.defaultView
  el.addEventListener('mouseenter', () => {
    const raw = el.getAttribute('data-tip'); if (!raw) return
    const tip = ensurePageTip(doc)
    tip.innerHTML = esc(raw).replace(/《([^》]*)》/g, '<span class="ba-tip-accent">$1</span>')
    tip.classList.add('show')
    const r = el.getBoundingClientRect()
    const vw = win.innerWidth, vh = win.innerHeight
    let left, top
    if (placement === 'below') {
      left = Math.max(8, Math.min(vw - tip.offsetWidth - 8, r.left))
      top = r.bottom + 8
      if (top + tip.offsetHeight > vh - 8) top = Math.max(8, r.top - tip.offsetHeight - 8)
    } else {
      left = Math.min(vw - tip.offsetWidth - 8, r.right + 10)
      top = Math.max(8, Math.min(vh - tip.offsetHeight - 8, r.top + r.height / 2 - tip.offsetHeight / 2))
    }
    tip.style.left = left + 'px'; tip.style.top = top + 'px'
  })
  el.addEventListener('mouseleave', hidePageTip)
}
