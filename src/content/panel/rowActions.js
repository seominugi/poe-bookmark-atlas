import { promoteToBookmark, remove } from '../../store/store.js'

export function bindRowActions(listEl, root, kind) {
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('.ba-star') || e.target.closest('.ba-del')) return
      location.href = decodeURIComponent(row.dataset.url) // 저장된 검색 재오픈
    }
  })
  listEl.querySelectorAll('.ba-star').forEach((s) => {
    s.onclick = async () => {
      const name = prompt('북마크 이름 (비우면 제목 사용)', '') || undefined
      await promoteToBookmark(s.dataset.id, name)
      document.dispatchEvent(new CustomEvent('ba:records-changed'))
    }
  })
  listEl.querySelectorAll('.ba-del').forEach((d) => {
    d.onclick = async () => {
      await remove(d.dataset.id)
      document.dispatchEvent(new CustomEvent('ba:records-changed'))
    }
  })
}
