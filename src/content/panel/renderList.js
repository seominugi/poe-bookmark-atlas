import {
  listByKind, listFolders, moveBookmark, overwriteBookmark, addBookmark,
  addFolder, renameFolder, deleteFolder, promoteToBookmark, remove, removeStaleBookmarks, rename, findBookmark,
} from '../../store/store.js'
import { formatPrice } from '../../lib/formatPrice.js'
import divineIcon from '../../icons/divine.png'
import exaltedIcon from '../../icons/exalted.png'

// content script(ISOLATED)에선 번들 에셋을 확장 URL로 해석해야 함.
// import 값은 '/assets/..'(호스트 페이지 기준 절대경로)라 그대로 쓰면 poe.kakaogames.com/assets/.. → 404.
const divineUrl = chrome.runtime.getURL(divineIcon)
const exaltedUrl = chrome.runtime.getURL(exaltedIcon)

let cleanArmed = 0 // "오래된 항목 정리" 2-클릭 확인 (모듈 레벨 — 재렌더 후에도 유지)

/** 같은 조건의 기존 북마크 행을 스크롤·강조 — 중복 저장 차단 시 위치를 안내 */
export function highlightBookmark(container, id) {
  const row = container && container.querySelector(`.ba-row[data-id="${CSS.escape(id)}"]`)
  if (!row) return
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  row.classList.remove('ba-flash')
  void row.offsetWidth // 리플로우로 애니메이션 재시작
  row.classList.add('ba-flash')
  setTimeout(() => row.classList.remove('ba-flash'), 1800)
}

// 가격 문자열의 단위(div/ex)를 화폐 아이콘으로 치환
function priceHtml(snap) {
  const s = snap ? formatPrice(snap) : ''
  if (!s) return ''
  return s
    .replace(/\bdiv\b/, `<img class="ba-cur" src="${divineUrl}" alt="div">`)
    .replace(/\bex\b/, `<img class="ba-cur" src="${exaltedUrl}" alt="ex">`)
}

const fmtTime = (t) => {
  const d = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `${yy}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const changed = () => document.dispatchEvent(new CustomEvent('ba:records-changed'))
const STALE_MS = 14 * 24 * 60 * 60 * 1000 // 14일 — 이후엔 만료 가능성 경고

// 조건 상세 툴팁 텍스트 — 그룹 타입(및·제외·숫자·가중 합계…)별로 묶어 표시, 구 레코드는 평탄 폴백
function condTipText(r) {
  const groups = r.statGroups
  if (Array.isArray(groups) && groups.length) {
    return groups.map((g) => `[${g.label}]\n${g.filters.map((f) => `  ${f}`).join('\n')}`).join('\n')
  }
  return (r.stats || []).join('\n')
}

function rowHtml(r, kind) {
  const price = priceHtml(r.snapshot)
  const title = escapeHtml(r.name || r.title)
  const statItems = r.stats || []
  // 카드엔 조건 개수만 가볍게, 상세는 hover 툴팁(그룹 타입별 줄바꿈)으로
  const condSummary = statItems.length
    ? `<span class="ba-cond" data-tip="${escapeHtml(condTipText(r))}">🔎 조건 ${statItems.length}개</span>`
    : ''
  const when = r.lastUsedAt || r.updatedAt
  const stale = kind === 'bookmark' && Date.now() - (r.lastUsedAt || r.createdAt || r.updatedAt || 0) > STALE_MS
  const warn = stale
    ? `<span class="ba-stale" data-tip="오래된 북마크 — 거래소 저장 링크가 만료됐을 수 있어요. 클릭해 결과가 뜨면 자동 갱신됩니다.">⚠</span> `
    : ''
  const actions =
    kind === 'history'
      ? `<span class="ba-star" data-id="${r.id}" data-name="${title}" data-tip="북마크로 저장">☆</span>`
      : `<span class="ba-over" data-id="${r.id}" data-tip="최근 검색으로 갱신(덮어쓰기)">🔄</span><span class="ba-rename" data-id="${r.id}" data-name="${title}" data-tip="이름 변경">✎</span><span class="ba-del" data-id="${r.id}" data-tip="삭제">🗑</span>`
  const grip = kind === 'bookmark'
    ? `<span class="ba-grip" draggable="true" data-id="${r.id}" data-tip="드래그해서 순서·폴더 이동">⠿</span>`
    : ''
  return `<div class="ba-row" data-id="${r.id}" data-order="${r.order ?? 0}" data-folder="${r.folderId ?? ''}" data-url="${encodeURIComponent(r.url)}">
    <div class="ba-line1"><span class="ba-l1l">${grip}${warn}🔖 <b>${title}</b></span><span class="ba-price">${price}</span></div>
    <div class="ba-meta">${actions}<span class="ba-time">${fmtTime(when)}</span>${condSummary}</div>
  </div>`
}

// 북마크 + 히스토리를 한 스크롤에 통합 렌더 (탭 없음 → 패널 전체 높이 활용)
export async function renderList(listEl, root, ui = {}) {
  const [bookmarks, folders, history] = await Promise.all([
    listByKind('bookmark', ui.game),
    listFolders(ui.game),
    listByKind('history', ui.game),
  ])

  // ── 북마크 섹션 (폴더 그룹) ──
  const now = Date.now()
  const staleN = bookmarks.filter((b) => now - (b.lastUsedAt || b.createdAt || b.updatedAt || 0) > STALE_MS).length
  const cleanupBtn = staleN > 0
    ? `<button class="ba-clean-stale" data-tip="14일 이상 미사용 북마크 ${staleN}개를 일괄 삭제">🧹 오래된 항목 ${staleN}</button>`
    : ''
  let html = `<div class="ba-sec-head"><span class="ba-sec-title">🔖 북마크 <span class="ba-sec-count">${bookmarks.length}</span></span><span class="ba-sec-actions">${cleanupBtn}<button class="ba-add-folder" data-tip="새 폴더 만들기">+ 폴더</button></span></div>`
  const groups = [{ id: null, name: '미분류' }, ...folders]
  const byFolder = (fid) => bookmarks.filter((b) => (b.folderId ?? null) === fid)
  for (const g of groups) {
    const items = byFolder(g.id)
    // 미분류는 비어도 항상 표시 — 폴더 밖으로 다시 드래그할 드롭 타깃이 필요
    const fActions =
      g.id !== null
        ? `<span class="ba-folder-save" data-fid="${g.id}" data-tip="현재 검색을 이 폴더에 저장">➕</span><span class="ba-folder-rename" data-id="${g.id}" data-name="${escapeHtml(g.name)}" data-tip="이름변경">✎</span><span class="ba-folder-del" data-id="${g.id}" data-tip="폴더 삭제(북마크는 미분류로)">🗑</span>`
        : `<span class="ba-folder-save" data-fid="" data-tip="현재 검색을 미분류에 저장">➕</span>`
    html += `<div class="ba-folder" data-folder="${g.id ?? ''}">
      <div class="ba-folder-head"><span class="ba-folder-name">📁 ${escapeHtml(g.name)} <span class="ba-folder-count">${items.length}</span></span><span>${fActions}</span></div>
      <div class="ba-folder-body" data-folder="${g.id ?? ''}">${items.map((r) => rowHtml(r, 'bookmark')).join('') || '<div class="ba-folder-empty">여기로 드래그</div>'}</div>
    </div>`
  }

  // ── 히스토리 섹션 ──
  html += `<div class="ba-sec-head ba-sec-hist"><span class="ba-sec-title">🕘 히스토리 <span class="ba-sec-count">${history.length}</span></span></div>`
  html += history.length
    ? history.map((r) => rowHtml(r, 'history')).join('')
    : `<div class="ba-empty-sm">최근 검색 기록이 없습니다.</div>`

  listEl.innerHTML = html
  bindAll(listEl, ui)
}

function bindAll(listEl, ui) {
  const toast = ui.toast || (() => {})

  // 행 열기 (그립·액션 클릭은 제외)
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ba-star,.ba-over,.ba-rename,.ba-del,.ba-grip,.ba-stale')) return
      location.href = decodeURIComponent(row.dataset.url)
    })
  })

  // 🗑 삭제 (북마크 행)
  listEl.querySelectorAll('.ba-del').forEach((d) =>
    d.addEventListener('click', async () => { await remove(d.dataset.id); changed() }))

  // ✎ 북마크 이름 변경
  listEl.querySelectorAll('.ba-rename').forEach((s) =>
    s.addEventListener('click', async () => {
      const name = ui.showNameInput ? await ui.showNameInput(s.dataset.name || '') : prompt('새 이름', s.dataset.name || '')
      if (name === null) return
      await rename(s.dataset.id, name || s.dataset.name || ''); changed()
    }))

  // ☆ 히스토리 → 북마크 승격 (같은 조건 북마크가 있으면 중복 저장 방지)
  listEl.querySelectorAll('.ba-star').forEach((s) =>
    s.addEventListener('click', async () => {
      const hist = (await listByKind('history', ui.game)).find((r) => r.id === s.dataset.id)
      const dup = hist && (await findBookmark(hist.dedupeKey, ui.game))
      if (dup) { toast('이미 같은 조건의 북마크가 있습니다.'); highlightBookmark(listEl, dup.id); return }
      const name = ui.showNameInput ? await ui.showNameInput(s.dataset.name || '') : prompt('북마크 이름', s.dataset.name || '')
      if (name === null) return
      await promoteToBookmark(s.dataset.id, name || undefined); changed()
    }))

  // 🔄 최근 검색으로 덮어쓰기
  listEl.querySelectorAll('.ba-over').forEach((o) =>
    o.addEventListener('click', async () => {
      const latest = (await listByKind('history', ui.game))[0]
      if (!latest) { toast('갱신할 최근 검색이 없습니다.'); return }
      await overwriteBookmark(o.dataset.id, {
        game: latest.game, league: latest.league, url: latest.url, title: latest.title,
        itemType: latest.itemType, stats: latest.stats, statGroups: latest.statGroups, priceFilter: latest.priceFilter,
        snapshot: latest.snapshot, dedupeKey: latest.dedupeKey,
      })
      changed(); toast('최근 검색으로 갱신했습니다.')
    }))

  // + 폴더
  const addBtn = listEl.querySelector('.ba-add-folder')
  if (addBtn) addBtn.addEventListener('click', async () => {
    const name = ui.showNameInput ? await ui.showNameInput('새 폴더') : prompt('폴더 이름', '새 폴더')
    if (name === null) return
    await addFolder(name || '새 폴더', ui.game); changed()
  })

  // 🧹 오래된 북마크 일괄 정리 (2-클릭 확인 — 네이티브 다이얼로그 없이 토스트로)
  const cleanBtn = listEl.querySelector('.ba-clean-stale')
  if (cleanBtn) cleanBtn.addEventListener('click', async () => {
    if (Date.now() - cleanArmed < 4000) {
      cleanArmed = 0
      const n = await removeStaleBookmarks(ui.game, STALE_MS)
      changed(); toast(`오래된 북마크 ${n}개를 정리했습니다.`)
    } else {
      cleanArmed = Date.now()
      toast('한 번 더 누르면 오래된 북마크를 삭제합니다.')
    }
  })

  // ✎ 폴더 이름 변경 — 현재 이름에서 바로 인라인 수정
  listEl.querySelectorAll('.ba-folder-rename').forEach((s) => s.addEventListener('click', () => {
    const id = s.dataset.id
    const nameEl = s.closest('.ba-folder-head').querySelector('.ba-folder-name')
    if (nameEl.querySelector('.ba-folder-edit')) return // 이미 편집 중
    nameEl.innerHTML = `<input class="ba-folder-edit" value="${escapeHtml(s.dataset.name || '')}" maxlength="40" />`
    const input = nameEl.querySelector('.ba-folder-edit')
    input.focus(); input.select()
    let done = false
    const commit = async (save) => {
      if (done) return
      done = true
      const v = input.value.trim()
      if (save && v) await renameFolder(id, v)
      changed() // 재렌더로 폴더 헤더 복원
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(true) }
      else if (e.key === 'Escape') { e.preventDefault(); commit(false) }
    })
    input.addEventListener('blur', () => commit(true))
  }))
  listEl.querySelectorAll('.ba-folder-del').forEach((s) => s.addEventListener('click', async () => {
    await deleteFolder(s.dataset.id); changed()
  }))

  // ➕ 현재(최근) 검색을 이 폴더/미분류에 바로 저장
  listEl.querySelectorAll('.ba-folder-save').forEach((b) => b.addEventListener('click', async () => {
    const folderId = b.dataset.fid || null
    const latest = (await listByKind('history', ui.game))[0]
    if (!latest) { toast('먼저 거래소에서 검색을 실행하세요.'); return }
    const dup = await findBookmark(latest.dedupeKey, ui.game)
    if (dup) { toast('이미 같은 조건의 북마크가 있습니다.'); highlightBookmark(listEl, dup.id); return }
    const name = ui.showNameInput ? await ui.showNameInput(latest.name || latest.title) : prompt('북마크 이름', latest.name || latest.title)
    if (name === null) return
    await addBookmark({
      game: latest.game, league: latest.league, url: latest.url, title: latest.title,
      itemType: latest.itemType, name: latest.name, stats: latest.stats, statGroups: latest.statGroups,
      priceFilter: latest.priceFilter, snapshot: latest.snapshot, dedupeKey: latest.dedupeKey, folderId,
    }, name || latest.title)
    changed(); toast('저장했습니다.')
  }))

  bindDnD(listEl)
}

function bindDnD(listEl) {
  let dragId = null
  const clearOver = () => listEl.querySelectorAll('.ba-dragover').forEach((x) => x.classList.remove('ba-dragover'))

  // 드래그는 전용 그립(⠿)에서만 시작 — 행 클릭(열기)과 분리
  listEl.querySelectorAll('.ba-grip').forEach((grip) => {
    const gripRow = grip.closest('.ba-row')
    grip.addEventListener('dragstart', (e) => { dragId = grip.dataset.id; e.dataTransfer.effectAllowed = 'move'; gripRow.classList.add('ba-dragging') })
    grip.addEventListener('dragend', () => { gripRow.classList.remove('ba-dragging'); dragId = null; clearOver() })
  })

  // 북마크 행만 드롭 타깃 (히스토리 행은 그립이 없어 제외)
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    if (!row.querySelector('.ba-grip')) return
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
