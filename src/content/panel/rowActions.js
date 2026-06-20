import { promoteToBookmark, remove } from '../../store/store.js'

export function bindRowActions(listEl, root, kind, showNameInput) {
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('.ba-star') || e.target.closest('.ba-del')) return
      location.href = decodeURIComponent(row.dataset.url) // 저장된 검색 재오픈
    }
  })
  listEl.querySelectorAll('.ba-star').forEach((s) => {
    s.onclick = async () => {
      const name = showNameInput
        ? await showNameInput(s.dataset.name || '')
        : prompt('북마크 이름', s.dataset.name || '')
      if (name === null) return // 취소
      await promoteToBookmark(s.dataset.id, name || undefined)
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
