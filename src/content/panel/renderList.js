import { listByKind } from '../../store/store.js'
import { formatPrice } from '../../lib/formatPrice.js'
import { bindRowActions } from './rowActions.js'

const fmtTime = (t) => {
  const d = (Date.now() - t) / 6e4
  return d < 60 ? `${d | 0}분` : d < 1440 ? `${(d / 60) | 0}시간` : `${(d / 1440) | 0}일`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

export async function renderList(listEl, kind, root) {
  const records = await listByKind(kind)
  if (!records.length) {
    listEl.innerHTML = `<div class="ba-empty">기록이 없습니다.</div>`
    return
  }
  listEl.innerHTML = records
    .map((r) => {
      const price = r.snapshot ? formatPrice(r.snapshot) : ''
      const action =
        kind === 'history'
          ? `<span class="ba-star" data-id="${r.id}" title="북마크로 저장">☆</span>`
          : `<span class="ba-del" data-id="${r.id}" title="삭제">🗑</span>`
      const stats = escapeHtml((r.stats || []).slice(0, 3).join(' · '))
      return `<div class="ba-row" data-url="${encodeURIComponent(r.url)}">
        <div class="ba-line1"><span>🔖 <b>${escapeHtml(r.name || r.title)}</b></span><span class="ba-price">${price}</span></div>
        <div class="ba-line2"><span>${stats}</span><span>${action} ${fmtTime(r.updatedAt)}</span></div>
      </div>`
    })
    .join('')
  bindRowActions(listEl, root, kind)
}
