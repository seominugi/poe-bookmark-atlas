import {
  listByKind, listFolders, moveBookmark, overwriteBookmark, addBookmark,
  addFolder, renameFolder, deleteFolder, promoteToBookmark, remove,
} from '../../store/store.js'
import { formatPrice } from '../../lib/formatPrice.js'

const fmtTime = (t) => {
  const d = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const changed = () => document.dispatchEvent(new CustomEvent('ba:records-changed'))
const STALE_MS = 14 * 24 * 60 * 60 * 1000 // 14일 — 이후엔 만료 가능성 경고

function rowHtml(r, kind) {
  const price = r.snapshot ? formatPrice(r.snapshot) : ''
  const title = escapeHtml(r.name || r.title)
  const stats = escapeHtml((r.stats || []).slice(0, 3).join(' · '))
  const when = r.lastUsedAt || r.updatedAt
  const stale = kind === 'bookmark' && Date.now() - (r.lastUsedAt || r.createdAt || r.updatedAt || 0) > STALE_MS
  const warn = stale
    ? `<span class="ba-stale" title="오래된 북마크 — 거래소 저장 링크가 만료됐을 수 있어요. 클릭해 결과가 뜨면 자동 갱신됩니다.">⚠</span> `
    : ''
  const actions =
    kind === 'history'
      ? `<span class="ba-star" data-id="${r.id}" data-name="${title}" title="북마크로 저장">☆</span>`
      : `<span class="ba-over" data-id="${r.id}" title="최근 검색으로 갱신(덮어쓰기)">🔄</span><span class="ba-del" data-id="${r.id}" title="삭제">🗑</span>`
  const drag = kind === 'bookmark' ? ' draggable="true"' : ''
  return `<div class="ba-row"${drag} data-id="${r.id}" data-order="${r.order ?? 0}" data-folder="${r.folderId ?? ''}" data-url="${encodeURIComponent(r.url)}">
    <div class="ba-line1"><span>${warn}🔖 <b>${title}</b></span><span class="ba-price">${price}</span></div>
    <div class="ba-line2"><span>${stats}</span><span>${actions} ${fmtTime(when)}</span></div>
  </div>`
}

export async function renderList(listEl, kind, root, ui = {}) {
  if (kind === 'history') {
    const records = await listByKind('history', ui.game)
    listEl.innerHTML = records.length
      ? records.map((r) => rowHtml(r, 'history')).join('')
      : `<div class="ba-empty">기록이 없습니다.</div>`
    bindHistory(listEl, ui)
    return
  }

  // 북마크: 폴더 그룹 + 드래그앤드롭
  const [bookmarks, folders] = await Promise.all([listByKind('bookmark', ui.game), listFolders(ui.game)])
  if (!bookmarks.length && !folders.length) {
    listEl.innerHTML = `<div class="ba-bm-toolbar"><button class="ba-add-folder">+ 새 폴더</button></div>
      <div class="ba-empty">저장된 북마크가 없습니다.<br>검색 후 ☆ 또는 "현재 검색 저장"</div>`
    bindBookmark(listEl, ui)
    return
  }

  const groups = [{ id: null, name: '미분류' }, ...folders]
  const byFolder = (fid) => bookmarks.filter((b) => (b.folderId ?? null) === fid)

  let html = `<div class="ba-bm-toolbar"><button class="ba-add-folder">+ 새 폴더</button></div>`
  for (const g of groups) {
    const items = byFolder(g.id)
    // 미분류는 비어도 항상 표시 — 폴더 밖으로 다시 드래그할 드롭 타깃이 필요
    const fActions =
      g.id !== null
        ? `<span class="ba-folder-save" data-fid="${g.id}" title="현재 검색을 이 폴더에 저장">➕</span><span class="ba-folder-rename" data-id="${g.id}" title="이름변경">✎</span><span class="ba-folder-del" data-id="${g.id}" title="폴더 삭제(북마크는 미분류로)">🗑</span>`
        : `<span class="ba-folder-save" data-fid="" title="현재 검색을 미분류에 저장">➕</span>`
    html += `<div class="ba-folder" data-folder="${g.id ?? ''}">
      <div class="ba-folder-head"><span class="ba-folder-name">📁 ${escapeHtml(g.name)} <span class="ba-folder-count">${items.length}</span></span><span>${fActions}</span></div>
      <div class="ba-folder-body" data-folder="${g.id ?? ''}">${items.map((r) => rowHtml(r, 'bookmark')).join('') || '<div class="ba-folder-empty">여기로 드래그</div>'}</div>
    </div>`
  }
  listEl.innerHTML = html
  bindBookmark(listEl, ui)
}

function bindRowOpen(listEl) {
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ba-star,.ba-over,.ba-del')) return
      location.href = decodeURIComponent(row.dataset.url)
    })
  })
}

function bindHistory(listEl, ui) {
  bindRowOpen(listEl)
  listEl.querySelectorAll('.ba-star').forEach((s) => {
    s.addEventListener('click', async () => {
      const name = ui.showNameInput ? await ui.showNameInput(s.dataset.name || '') : prompt('북마크 이름', s.dataset.name || '')
      if (name === null) return
      await promoteToBookmark(s.dataset.id, name || undefined)
      changed()
    })
  })
  listEl.querySelectorAll('.ba-del').forEach((d) => {
    d.addEventListener('click', async () => { await remove(d.dataset.id); changed() })
  })
}

function bindBookmark(listEl, ui) {
  bindRowOpen(listEl)
  const toast = ui.toast || (() => {})

  const addBtn = listEl.querySelector('.ba-add-folder')
  if (addBtn) addBtn.addEventListener('click', async () => {
    const name = ui.showNameInput ? await ui.showNameInput('새 폴더') : prompt('폴더 이름', '새 폴더')
    if (name === null) return
    await addFolder(name || '새 폴더', ui.game); changed()
  })

  listEl.querySelectorAll('.ba-folder-rename').forEach((s) => s.addEventListener('click', async () => {
    const name = ui.showNameInput ? await ui.showNameInput('') : prompt('새 폴더 이름', '')
    if (!name) return
    await renameFolder(s.dataset.id, name); changed()
  }))
  listEl.querySelectorAll('.ba-folder-del').forEach((s) => s.addEventListener('click', async () => {
    await deleteFolder(s.dataset.id); changed()
  }))

  // ➕ 현재(최근) 검색을 이 폴더/미분류에 바로 저장
  listEl.querySelectorAll('.ba-folder-save').forEach((b) => b.addEventListener('click', async () => {
    const folderId = b.dataset.fid || null
    const latest = (await listByKind('history', ui.game))[0]
    if (!latest) { toast('먼저 거래소에서 검색을 실행하세요.'); return }
    const name = ui.showNameInput ? await ui.showNameInput(latest.name || latest.title) : prompt('북마크 이름', latest.name || latest.title)
    if (name === null) return
    await addBookmark({
      game: latest.game, league: latest.league, url: latest.url, title: latest.title,
      itemType: latest.itemType, name: latest.name, stats: latest.stats,
      priceFilter: latest.priceFilter, snapshot: latest.snapshot, dedupeKey: latest.dedupeKey, folderId,
    }, name || latest.title)
    changed(); toast('저장했습니다.')
  }))

  // 🔄 최근 검색으로 덮어쓰기
  listEl.querySelectorAll('.ba-over').forEach((o) => o.addEventListener('click', async () => {
    const latest = (await listByKind('history', ui.game))[0]
    if (!latest) { toast('갱신할 최근 검색이 없습니다.'); return }
    await overwriteBookmark(o.dataset.id, {
      game: latest.game, league: latest.league, url: latest.url, title: latest.title,
      itemType: latest.itemType, stats: latest.stats, priceFilter: latest.priceFilter,
      snapshot: latest.snapshot, dedupeKey: latest.dedupeKey,
    })
    changed(); toast('최근 검색으로 갱신했습니다.')
  }))

  listEl.querySelectorAll('.ba-row .ba-del').forEach((d) => d.addEventListener('click', async () => {
    await remove(d.dataset.id); changed()
  }))

  bindDnD(listEl)
}

function bindDnD(listEl) {
  let dragId = null
  const clearOver = () => listEl.querySelectorAll('.ba-dragover').forEach((x) => x.classList.remove('ba-dragover'))

  listEl.querySelectorAll('.ba-row[draggable="true"]').forEach((row) => {
    row.addEventListener('dragstart', (e) => { dragId = row.dataset.id; e.dataTransfer.effectAllowed = 'move'; row.classList.add('ba-dragging') })
    row.addEventListener('dragend', () => { row.classList.remove('ba-dragging'); dragId = null; clearOver() })
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clearOver(); row.classList.add('ba-dragover') })
    row.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation(); clearOver()
      if (!dragId || dragId === row.dataset.id) return
      const targetOrder = parseFloat(row.dataset.order)
      const folderId = row.dataset.folder || null
      const prev = row.previousElementSibling
      const prevOrder = prev && prev.classList.contains('ba-row') ? parseFloat(prev.dataset.order) : null
      const newOrder = prevOrder != null ? (prevOrder + targetOrder) / 2 : targetOrder - 1
      await moveBookmark(dragId, { folderId, order: newOrder }); changed()
    })
  })

  // 폴더 빈 공간으로 드롭 → 해당 폴더 맨 뒤로 이동
  listEl.querySelectorAll('.ba-folder-body').forEach((body) => {
    body.addEventListener('dragover', (e) => { e.preventDefault() })
    body.addEventListener('drop', async (e) => {
      e.preventDefault()
      if (!dragId) return
      const folderId = body.dataset.folder || null
      const maxOrder = [...body.querySelectorAll('.ba-row')].reduce((m, r) => Math.max(m, parseFloat(r.dataset.order) || 0), 0)
      await moveBookmark(dragId, { folderId, order: maxOrder + 1 }); changed()
    })
  })
}
