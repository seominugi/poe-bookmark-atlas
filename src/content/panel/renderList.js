import {
  listByKind, listFolders, moveBookmark, overwriteBookmark, addBookmark,
  addFolder, renameFolder, deleteFolder, promoteToBookmark, remove, removeStaleBookmarks, rename, findBookmark,
  exportBookmarksJSON, importBookmarksJSON, moveFolder, setFolderColor, FOLDER_PALETTE,
} from '../../store/store.js'
import { formatPrice } from '../../lib/formatPrice.js'
import { suggestName } from '../../lib/suggestName.js'
import divineIcon from '../../icons/divine.png'
import exaltedIcon from '../../icons/exalted.png'
import analystIcon from '../../icons/mascot-analyst.webp'
import researcherIcon from '../../icons/mascot-researcher.webp'

// content script(ISOLATED)에선 번들 에셋을 확장 URL로 해석해야 함.
// import 값은 '/assets/..'(호스트 페이지 기준 절대경로)라 그대로 쓰면 poe.kakaogames.com/assets/.. → 404.
const divineUrl = chrome.runtime.getURL(divineIcon)
const exaltedUrl = chrome.runtime.getURL(exaltedIcon)
// 마스코트(시세/동향 버튼·빈 상태) — panel.js도 재사용하도록 export
export const analystUrl = chrome.runtime.getURL(analystIcon)
export const researcherUrl = chrome.runtime.getURL(researcherIcon)

let cleanArmed = 0 // "오래된 항목 정리" 2-클릭 확인 (모듈 레벨 — 재렌더 후에도 유지)
let historyLimit = 60 // 히스토리 점진 렌더 — 처음 60개, "더 보기"로 +200씩 (모듈 레벨 유지)
let bmSearch = '' // 북마크 빠른 검색어 (모듈 레벨 — 재렌더 후에도 유지)
let hsSearch = '' // 히스토리 빠른 검색어
let bmSort = 'order' // 북마크 정렬: order(수동 순) | recent(최근) | name(이름)

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

// 빠른 검색 필터 — 재렌더 없이 행 show/hide (검색창 포커스 유지). 모듈 상태(bmSearch/hsSearch) 기준.
function applyFilters(listEl) {
  const norm = (s) => (s || '').trim().toLowerCase()
  const bm = norm(bmSearch)
  const hs = norm(hsSearch)
  listEl.querySelectorAll('.ba-row[data-kind="history"]').forEach((row) => {
    row.style.display = !hs || (row.dataset.search || '').includes(hs) ? '' : 'none'
  })
  let bmVisible = 0
  listEl.querySelectorAll('.ba-folder').forEach((folder) => {
    let inFolder = 0
    folder.querySelectorAll('.ba-row[data-kind="bookmark"]').forEach((row) => {
      const show = !bm || (row.dataset.search || '').includes(bm)
      row.style.display = show ? '' : 'none'
      if (show) { inFolder++; bmVisible++ }
    })
    // 검색 중 보이는 행 없는 폴더는 숨김 (검색 아닐 땐 항상 표시 — 미분류 드롭 타깃 유지)
    folder.style.display = bm && inFolder === 0 ? 'none' : ''
  })
  const bmBar = listEl.querySelector('.ba-search[data-scope="bm"]')
  let noRes = listEl.querySelector('.ba-no-result')
  if (bm && bmVisible === 0) {
    if (!noRes && bmBar) { noRes = document.createElement('div'); noRes.className = 'ba-no-result'; bmBar.closest('.ba-filter-bar').after(noRes) }
    if (noRes) { noRes.textContent = `"${bmSearch.trim()}"에 해당하는 북마크가 없습니다.`; noRes.hidden = false }
  } else if (noRes) { noRes.hidden = true }
}

// 조건 상세 툴팁 텍스트 — 그룹 타입(및·제외·숫자·가중 합계…)별로 묶어 표시, 구 레코드는 평탄 폴백
function condTipText(r) {
  const groups = r.statGroups
  if (Array.isArray(groups) && groups.length) {
    return groups.map((g) => `[${g.label}]\n${g.filters.map((f) => `  ${f}`).join('\n')}`).join('\n')
  }
  return (r.stats || []).join('\n')
}

function rowHtml(r, kind, currentLeague) {
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
  // 저장 당시 리그와 현재 리그가 다르면 흐림 + "이전 리그" 배지 (다른 리그라 안 열릴 수 있음)
  const otherLeague = kind === 'bookmark' && currentLeague && r.league && r.league !== currentLeague
  const leagueBadge = otherLeague
    ? `<span class="ba-badge ba-badge--league" data-tip="저장 당시 리그: ${escapeHtml(r.league)} · 현재: ${escapeHtml(currentLeague)} — 다른 리그라 열리지 않을 수 있어요">이전 리그</span>`
    : ''
  const copyBtn = `<span class="ba-copy" data-id="${r.id}" data-url="${encodeURIComponent(r.url)}" data-tip="검색 링크 복사">🔗</span>`
  const actions =
    kind === 'history'
      ? `<span class="ba-star" data-id="${r.id}" data-name="${title}" data-tip="북마크로 저장">☆</span>${copyBtn}`
      : `<span class="ba-over" data-id="${r.id}" data-tip="최근 검색으로 갱신(덮어쓰기)">🔄</span><span class="ba-rename" data-id="${r.id}" data-name="${title}" data-tip="이름 변경">✎</span><span class="ba-del" data-id="${r.id}" data-tip="삭제">🗑</span>${copyBtn}`
  const grip = kind === 'bookmark'
    ? `<span class="ba-grip" draggable="true" data-id="${r.id}" data-tip="드래그해서 순서·폴더 이동">⠿</span>`
    : ''
  // 북마크는 이름 칩(.ba-open)만 재검색 트리거 → 오클릭 방지. 히스토리는 카드 전체 클릭 유지.
  const titleHtml = kind === 'bookmark'
    ? `🔖 <span class="ba-open" data-tip="검색 다시 열기"><b>${title}</b></span>`
    : `🔖 <b>${title}</b>`
  const searchText = escapeHtml(`${r.name || ''} ${r.title || ''} ${(r.stats || []).join(' ')}`.toLowerCase())
  return `<div class="ba-row${otherLeague ? ' ba-row--dim' : ''}" data-id="${r.id}" data-kind="${kind}" data-order="${r.order ?? 0}" data-folder="${r.folderId ?? ''}" data-search="${searchText}" data-url="${encodeURIComponent(r.url)}">
    <div class="ba-line1"><span class="ba-l1l">${grip}${warn}${titleHtml}${leagueBadge}</span><span class="ba-price">${price}</span></div>
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
  let html = `<div class="ba-sec-head"><span class="ba-sec-title">🔖 북마크 <span class="ba-sec-count">${bookmarks.length}</span></span><span class="ba-sec-actions">${cleanupBtn}<button class="ba-add-folder" data-tip="새 폴더 만들기">+ 폴더</button><span class="ba-import" data-tip="JSON에서 북마크 가져오기">⬆</span><span class="ba-export" data-tip="북마크를 JSON으로 내보내기 (오래된 북마크 제외)">⬇</span></span></div>`
  html += `<div class="ba-filter-bar">
    <input class="ba-search" data-scope="bm" placeholder="🔍 북마크 검색 (이름·조건)" value="${escapeHtml(bmSearch)}" />
    <span class="ba-sort">
      <button class="ba-sort-seg ${bmSort === 'order' ? 'active' : ''}" data-sort="order" data-tip="수동 순서">순서</button>
      <button class="ba-sort-seg ${bmSort === 'recent' ? 'active' : ''}" data-sort="recent" data-tip="최근 사용순">최근</button>
      <button class="ba-sort-seg ${bmSort === 'name' ? 'active' : ''}" data-sort="name" data-tip="이름순">이름</button>
    </span>
  </div>`
  const groups = [{ id: null, name: '미분류' }, ...folders]
  const byFolder = (fid) => bookmarks.filter((b) => (b.folderId ?? null) === fid)
  const sortItems = (arr) => {
    if (bmSort === 'recent') return [...arr].sort((a, b) => (b.lastUsedAt || b.updatedAt || 0) - (a.lastUsedAt || a.updatedAt || 0))
    if (bmSort === 'name') return [...arr].sort((a, b) => String(a.name || a.title).localeCompare(String(b.name || b.title), 'ko'))
    return arr
  }
  // 빈 상태 — 북마크도 사용자 폴더도 없을 때 (마스코트 안내)
  if (bookmarks.length === 0 && folders.length === 0) {
    html += `<div class="ba-empty-bm">
      <img src="${analystUrl}" alt="">
      <b>저장된 북마크가 없어요</b>
      <small>좋은 검색을 찾으면 상단 <span class="hl">현재 검색 저장</span>으로<br>북마크해 두고 언제든 다시 열어보세요</small>
    </div>`
  } else for (const g of groups) {
    const items = sortItems(byFolder(g.id))
    // 미분류는 비어도 항상 표시 — 폴더 밖으로 다시 드래그할 드롭 타깃이 필요
    const fActions =
      g.id !== null
        ? `<span class="ba-folder-up" data-id="${g.id}" data-tip="폴더 위로">▲</span><span class="ba-folder-down" data-id="${g.id}" data-tip="폴더 아래로">▼</span><span class="ba-folder-save" data-fid="${g.id}" data-tip="현재 검색을 이 폴더에 저장">➕</span><span class="ba-folder-rename" data-id="${g.id}" data-name="${escapeHtml(g.name)}" data-tip="이름변경">✎</span><span class="ba-folder-export" data-id="${g.id}" data-name="${escapeHtml(g.name)}" data-tip="이 폴더만 JSON으로 내보내기 (오래된 북마크 제외)">⬇</span><span class="ba-folder-del" data-id="${g.id}" data-tip="폴더 삭제(북마크는 미분류로)">🗑</span>`
        : `<span class="ba-folder-save" data-fid="" data-tip="현재 검색을 미분류에 저장">➕</span>`
    // 폴더 색상 점 — 실폴더는 클릭 시 다음 색으로 순환(미분류는 중립색)
    const folderColor = g.color || '#8b85a8'
    const dot = g.id !== null
      ? `<span class="ba-folder-dot" data-id="${g.id}" data-color="${folderColor}" data-tip="색상 변경" style="background:${folderColor}"></span>`
      : `<span class="ba-folder-dot ba-folder-dot--none"></span>`
    html += `<div class="ba-folder" data-folder="${g.id ?? ''}">
      <div class="ba-folder-head"><span class="ba-folder-name">${dot} ${escapeHtml(g.name)} <span class="ba-folder-count">${items.length}</span></span><span>${fActions}</span></div>
      <div class="ba-folder-body" data-folder="${g.id ?? ''}">${items.map((r) => rowHtml(r, 'bookmark', ui.league)).join('') || '<div class="ba-folder-empty">여기로 드래그</div>'}</div>
    </div>`
  }

  // ── 히스토리 섹션 (점진 렌더) ──
  html += `<div class="ba-sec-head ba-sec-hist"><span class="ba-sec-title">🕘 히스토리 <span class="ba-sec-count">${history.length}</span></span></div>`
  if (history.length) {
    html += `<div class="ba-filter-bar"><input class="ba-search" data-scope="hs" placeholder="🔍 히스토리 검색 (이름·조건)" value="${escapeHtml(hsSearch)}" /></div>`
    html += history.slice(0, historyLimit).map((r) => rowHtml(r, 'history')).join('')
    if (history.length > historyLimit) {
      html += `<button class="ba-more-hist" data-tip="히스토리 더 불러오기">더 보기 (남은 ${history.length - historyLimit}개)</button>`
    }
  } else {
    html += '<div class="ba-empty-sm">최근 검색 기록이 없습니다.</div>'
  }

  listEl.innerHTML = html
  bindAll(listEl, ui)
  applyFilters(listEl) // 재렌더 후 현재 검색어로 필터 재적용
}

function bindAll(listEl, ui) {
  const toast = ui.toast || (() => {})

  // 행 열기 — 히스토리는 카드 전체 클릭, 북마크는 이름 칩(.ba-open)만 (오클릭 방지)
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    if (row.dataset.kind !== 'history') return
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ba-star,.ba-copy,.ba-cond,.ba-stale')) return
      location.href = decodeURIComponent(row.dataset.url)
    })
  })

  // 북마크 이름 칩 클릭 → 재검색
  listEl.querySelectorAll('.ba-open').forEach((s) =>
    s.addEventListener('click', (e) => { e.stopPropagation(); location.href = decodeURIComponent(s.closest('.ba-row').dataset.url) }))

  // 🔗 검색 링크 복사 (북마크·히스토리 공통)
  listEl.querySelectorAll('.ba-copy').forEach((c) =>
    c.addEventListener('click', async (e) => {
      e.stopPropagation()
      const url = decodeURIComponent(c.dataset.url)
      try { await navigator.clipboard.writeText(url); toast('검색 링크를 복사했습니다.') }
      catch (_) {
        const t = document.createElement('textarea'); t.value = url; t.style.position = 'fixed'; t.style.opacity = '0'
        document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t)
        toast('검색 링크를 복사했습니다.')
      }
    }))

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
      const name = ui.showNameInput ? await ui.showNameInput(suggestName(hist)) : prompt('북마크 이름', suggestName(hist))
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

  // ⬆⬇ JSON 가져오기 / 내보내기 (전체 + 폴더 단위, stale 14일↑ 제외)
  const downloadJSON = (obj, name) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const today = () => new Date().toISOString().slice(0, 10)
  const exportBtn = listEl.querySelector('.ba-export')
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    const { json, count, staleExcluded } = await exportBookmarksJSON(ui.game)
    if (!count) { toast(staleExcluded ? '내보낼 북마크가 없습니다 (모두 오래됨).' : '내보낼 북마크가 없습니다.'); return }
    downloadJSON(json, `bookmark-atlas-${today()}.json`)
    toast(`북마크 ${count}개를 내보냈습니다${staleExcluded ? ` (오래된 ${staleExcluded}개 제외)` : ''}.`)
  })
  listEl.querySelectorAll('.ba-folder-export').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation()
    const { json, count, staleExcluded } = await exportBookmarksJSON(ui.game, b.dataset.id)
    if (!count) { toast('내보낼 북마크가 없습니다.'); return }
    downloadJSON(json, `bookmark-atlas-${b.dataset.name}-${today()}.json`)
    toast(`"${b.dataset.name}" 북마크 ${count}개를 내보냈습니다${staleExcluded ? ` (오래된 ${staleExcluded}개 제외)` : ''}.`)
  }))
  const importBtn = listEl.querySelector('.ba-import')
  if (importBtn) importBtn.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json'
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return
      const rd = new FileReader()
      rd.onload = async () => {
        try {
          const { added, skipped } = await importBookmarksJSON(ui.game, JSON.parse(rd.result))
          changed()
          toast(added ? `${added}개 북마크를 가져왔습니다${skipped ? ` (중복 ${skipped}개 제외)` : ''}.` : '추가할 새 북마크가 없습니다.')
        } catch (_) { toast('JSON 형식이 올바르지 않습니다.') }
      }
      rd.readAsText(f)
    }
    inp.click()
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

  // 히스토리 더 보기 (점진 렌더)
  const moreBtn = listEl.querySelector('.ba-more-hist')
  if (moreBtn) moreBtn.addEventListener('click', () => { historyLimit += 200; changed() })

  // 빠른 검색 — 입력 시 재렌더 없이 show/hide (검색창 포커스 유지)
  listEl.querySelectorAll('.ba-search').forEach((inp) => inp.addEventListener('input', () => {
    if (inp.dataset.scope === 'bm') bmSearch = inp.value
    else hsSearch = inp.value
    applyFilters(listEl)
  }))
  // 정렬 토글 — 재렌더
  listEl.querySelectorAll('.ba-sort-seg').forEach((b) => b.addEventListener('click', () => { bmSort = b.dataset.sort; changed() }))

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

  // ▲▼ 폴더 순서 이동
  listEl.querySelectorAll('.ba-folder-up').forEach((s) => s.addEventListener('click', async (e) => {
    e.stopPropagation(); await moveFolder(s.dataset.id, -1); changed()
  }))
  listEl.querySelectorAll('.ba-folder-down').forEach((s) => s.addEventListener('click', async (e) => {
    e.stopPropagation(); await moveFolder(s.dataset.id, 1); changed()
  }))

  // 폴더 색상 점 클릭 → 다음 팔레트 색으로 순환
  listEl.querySelectorAll('.ba-folder-dot[data-id]').forEach((d) => d.addEventListener('click', async (e) => {
    e.stopPropagation()
    const i = FOLDER_PALETTE.indexOf(d.dataset.color)
    await setFolderColor(d.dataset.id, FOLDER_PALETTE[(i + 1) % FOLDER_PALETTE.length]); changed()
  }))

  // ➕ 현재(최근) 검색을 이 폴더/미분류에 바로 저장
  listEl.querySelectorAll('.ba-folder-save').forEach((b) => b.addEventListener('click', async () => {
    const preFolderId = b.dataset.fid || null
    const latest = (await listByKind('history', ui.game))[0]
    if (!latest) { toast('먼저 거래소에서 검색을 실행하세요.'); return }
    const dup = await findBookmark(latest.dedupeKey, ui.game)
    if (dup) { toast('이미 같은 조건의 북마크가 있습니다.'); highlightBookmark(listEl, dup.id); return }
    // 폴더 선택 다이얼로그(해당 폴더 사전 선택, 변경 가능). showSaveInput 없으면 이름만 prompt 폴백.
    const res = ui.showSaveInput
      ? await ui.showSaveInput(suggestName(latest), preFolderId)
      : { name: prompt('북마크 이름', suggestName(latest)), folderId: preFolderId }
    if (!res || res.name === null) return
    await addBookmark({
      game: latest.game, league: latest.league, url: latest.url, title: latest.title,
      itemType: latest.itemType, name: latest.name, stats: latest.stats, statGroups: latest.statGroups,
      priceFilter: latest.priceFilter, snapshot: latest.snapshot, dedupeKey: latest.dedupeKey, folderId: res.folderId,
    }, res.name || latest.title)
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
