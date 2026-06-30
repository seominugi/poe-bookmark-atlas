import {
  listByKind, listFolders, moveBookmark, overwriteBookmark,
  addFolder, renameFolder, deleteFolder, promoteToBookmark, remove, removeStaleBookmarks, clearHistory, rename, setNote, findBookmark,
  exportBookmarksJSON, importBookmarksJSON, moveFolder, reorderFolder, setFolderColor, FOLDER_PALETTE, isAllowedTradeUrl, isAllowedIconUrl,
} from '../../store/store.js'
import { formatPrice } from '../../lib/formatPrice.js'
import { icon } from '../../lib/icons.js'
import { suggestName } from '../../lib/suggestName.js'
import { buildAutoNote } from '../../lib/autoNote.js'
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

let historyLimit = 60 // 히스토리 점진 렌더 — 처음 60개, "더 보기"로 +200씩 (모듈 레벨 유지)
let bmSearch = '' // 통합 빠른 검색어 (북마크·히스토리 동시 필터, 모듈 레벨 — 재렌더 후에도 유지)
let bmSort = 'recent' // 북마크 정렬 기본: recent(최근·저장 순 → 저장하면 상단). order(수동)·name도 선택 가능
let oneline = false // 북마크 간략(한 줄) 보기 — 이름·가격만 표시. 기본 끔(상세). storage 영속.
const collapsedFolders = new Set() // 접힌 폴더 키(g.id ?? '') — 재렌더 후에도 유지
const collapsedLeagues = new Set() // 리그 기본 접힘(현재 펼침/지난 접힘)에서 토글한 키('L:'+league)

// 정렬·접힌 폴더 선호는 chrome.storage에 영속(재로드 후 유지). 검색어는 의도적으로 휘발(매 세션 초기화).
let uiHydrated = false
async function hydrateUiState() {
  if (uiHydrated) return
  uiHydrated = true
  try {
    const r = await chrome.storage.local.get(['uiBmSort', 'uiCollapsedFolders', 'uiOneline'])
    if (r.uiBmSort) bmSort = r.uiBmSort
    if (typeof r.uiOneline === 'boolean') oneline = r.uiOneline
    if (Array.isArray(r.uiCollapsedFolders)) { collapsedFolders.clear(); r.uiCollapsedFolders.forEach((k) => collapsedFolders.add(k)) }
  } catch (_) {}
}
const saveCollapsed = () => { try { chrome.storage.local.set({ uiCollapsedFolders: [...collapsedFolders] }) } catch (_) {} }
const saveSort = () => { try { chrome.storage.local.set({ uiBmSort: bmSort }) } catch (_) {} }
const saveOneline = () => { try { chrome.storage.local.set({ uiOneline: oneline }) } catch (_) {} }
let focusGripId = null // 키보드 재정렬 후 포커스 복원 대상
let focusBookmarkId = null // 저장·승격 후 스크롤·강조 대상

// 접근성: 아이콘 액션(span)을 키보드 포커스·활성화·라벨 가능하게 (role=button + tabindex + aria-label + Enter/Space)
const A11Y_SEL = '.ba-copy, .ba-over, .ba-rename, .ba-move, .ba-del, .ba-star, .ba-hist-del, .ba-note-btn, .ba-note, .ba-open, .ba-attn[data-act], .ba-folder-rename, .ba-folder-export, .ba-folder-del, .ba-folder-ic[data-id], .ba-sort-seg, .ba-import, .ba-export'
function applyA11y(listEl) {
  listEl.querySelectorAll(A11Y_SEL).forEach((el) => {
    if (el.matches('button, a, input')) return
    el.setAttribute('role', 'button')
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    if (!el.hasAttribute('aria-label') && !(el.textContent || '').trim()) { // 아이콘 전용 → data-tip 첫 줄을 라벨로
      const t = (el.getAttribute('data-tip') || '').split('\n')[0].trim()
      if (t) el.setAttribute('aria-label', t)
    }
  })
  if (!listEl.__a11yKeys) {
    listEl.__a11yKeys = true
    listEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const el = e.target
      if (!el || !el.matches || el.matches('input, textarea')) return
      if (el.getAttribute('role') === 'button') { e.preventDefault(); el.click() }
    })
  }
}

let spotTimer = null
/** 북마크 행으로 스크롤하고 스포트라이트 — 주변을 일시적으로 어둡게, 대상만 밝게 강조. 저장·승격·중복안내 공용 */
export function highlightBookmark(container, id) {
  const row = container && container.querySelector(`.ba-row[data-id="${CSS.escape(id)}"]`)
  if (!row) return
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const rootEl = container.closest('.ba-root')
  container.querySelectorAll('.ba-spot-target').forEach((x) => x.classList.remove('ba-spot-target'))
  row.classList.add('ba-spot-target')
  if (rootEl) rootEl.classList.add('ba-spotlighting')
  clearTimeout(spotTimer)
  spotTimer = setTimeout(() => {
    row.classList.remove('ba-spot-target')
    if (rootEl) rootEl.classList.remove('ba-spotlighting')
  }, 1900)
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
// 상대 시간(가격 나이 표시용)
const ago = (t) => {
  const s = Math.max(0, Date.now() - t) / 1000
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}
const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
// 폴더 색(#rrggbb)을 헤더 틴트·레일·배지용 rgba로. 잘못된 값이면 입력 그대로(폴백).
const hexToRgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
const changed = () => document.dispatchEvent(new CustomEvent('ba:records-changed'))
const STALE_MS = 14 * 24 * 60 * 60 * 1000 // 14일 — 이후엔 만료 가능성 경고

// 허용 도메인(거래소) 링크만 연다 — 가져온 데이터의 피싱·javascript: URL 차단.
// Ctrl/⌘ 클릭은 새 탭으로 열어 현재 검색을 유지한다.
function openTradeUrl(url, toast, e) {
  if (!isAllowedTradeUrl(url)) { (toast || (() => {}))('허용되지 않은 링크예요. poe.kakaogames.com 거래소 링크만 열 수 있어요.'); return }
  if (e && (e.ctrlKey || e.metaKey)) window.open(url, '_blank', 'noopener')
  else location.href = url
}

// 빠른 검색 필터 — 재렌더 없이 행 show/hide (검색창 포커스 유지). 통합 검색어(bmSearch) 기준.
function applyFilters(listEl) {
  // 통합 검색어 하나로 북마크·히스토리를 동시에 필터
  const term = (bmSearch || '').trim().toLowerCase()
  // 히스토리
  let hsVisible = 0
  listEl.querySelectorAll('.ba-row[data-kind="history"]').forEach((row) => {
    const show = !term || (row.dataset.search || '').includes(term)
    row.style.display = show ? '' : 'none'
    if (show) hsVisible++
  })
  const hsHead = listEl.querySelector('.ba-sec-hist')
  let hsNoRes = listEl.querySelector('.ba-no-result-hs')
  if (term && hsVisible === 0 && hsHead) {
    if (!hsNoRes) { hsNoRes = document.createElement('div'); hsNoRes.className = 'ba-no-result ba-no-result-hs'; hsHead.after(hsNoRes) }
    hsNoRes.textContent = `"${bmSearch.trim()}"에 해당하는 히스토리가 없습니다.`; hsNoRes.hidden = false
  } else if (hsNoRes) { hsNoRes.hidden = true }
  // 북마크
  let bmVisible = 0
  listEl.querySelectorAll('.ba-folder').forEach((folder) => {
    let inFolder = 0
    folder.querySelectorAll('.ba-row[data-kind="bookmark"]').forEach((row) => {
      const show = !term || (row.dataset.search || '').includes(term)
      row.style.display = show ? '' : 'none'
      if (show) { inFolder++; bmVisible++ }
    })
    // 검색 중 보이는 행 없는 폴더는 숨김 (검색 아닐 땐 항상 표시 — 미분류 드롭 타깃 유지)
    folder.style.display = term && inFolder === 0 ? 'none' : ''
  })
  const bmBar = listEl.querySelector('.ba-search-input[data-scope="bm"]')
  let noRes = listEl.querySelector('.ba-no-result:not(.ba-no-result-hs)')
  if (term && bmVisible === 0) {
    if (!noRes && bmBar) { noRes = document.createElement('div'); noRes.className = 'ba-no-result'; bmBar.closest('.ba-search-row').after(noRes) }
    if (noRes) { noRes.textContent = `"${bmSearch.trim()}"에 해당하는 북마크가 없습니다.`; noRes.hidden = false }
  } else if (noRes) { noRes.hidden = true }
}

// 조건 상세 툴팁 텍스트 — 그룹 타입(및·제외·숫자·가중 합계…)별로 묶어 표시, 구 레코드는 평탄 폴백
function condTipText(r) {
  const lines = []
  const of = r.otherFilters
  if (Array.isArray(of) && of.length) {
    lines.push('[필터]')
    for (const f of of) lines.push(`  ${f.label}: ${f.value}`)
  }
  const groups = r.statGroups
  if (Array.isArray(groups) && groups.length) {
    if (lines.length) lines.push('')
    lines.push('[능력치 필터]')
    for (const g of groups) {
      lines.push(`  · ${g.label}`)
      for (const f of g.filters) lines.push(`    ${f}`)
    }
  } else if (r.stats && r.stats.length) {
    if (lines.length) lines.push('')
    lines.push('[능력치 필터]')
    for (const s of r.stats) lines.push(`  ${s}`)
  }
  return lines.join('\n')
}

function rowHtml(r, kind, currentLeague) {
  const price = priceHtml(r.snapshot)
  const title = escapeHtml(r.name || r.title)
  const stats = r.stats || []
  const when = r.lastUsedAt || r.updatedAt
  const searchText = escapeHtml(`${r.name || ''} ${r.title || ''} ${r.note || ''} ${stats.join(' ')}`.toLowerCase())
  const condTip = escapeHtml(condTipText(r))
  // 조건 칩 카운트 = 비능력치 필터(유형·가격·레벨 등) + 능력치 수 — 히스토리·북마크 공통
  const condCount = (Array.isArray(r.otherFilters) ? r.otherFilters.length : 0) + stats.length
  const condChip = condCount ? `<span class="ba-cond" data-tip="${condTip}">${icon('search', 12)}조건 ${condCount}개</span>` : ''
  // 가격 툴팁 — snapshot 기준 "검색 시점 시세(빠른 판매가 p25)" + 표본 수
  const priceAt = r.snapshotAt || (r.snapshot && r.snapshot.capturedAt)
  const sampleN = r.snapshot && r.snapshot.sampleN
  const priceTip = price ? escapeHtml(`${priceAt ? ago(priceAt) + ' ' : ''}검색 시점 시세 — ${sampleN ? `매물 ${sampleN}개 중 ` : ''}빠르게 팔리는 가격(하위 25% 분위)`) : ''
  // 대표 아이템 이미지 — 북마크·히스토리 공통(검색 결과 최빈 아이콘)
  const thumb = r.icon && isAllowedIconUrl(r.icon) ? `<img class="ba-thumb" src="${escapeHtml(r.icon)}" alt="" loading="lazy" />` : ''

  // ── 히스토리: 카드 전체 클릭으로 재검색 (디자인: 가벼운 글래스 카드) ──
  if (kind === 'history') {
    return `<div class="ba-row ba-hist" data-id="${r.id}" data-kind="history" data-search="${searchText}" data-url="${encodeURIComponent(r.url)}">
      <div class="ba-line1"><span class="ba-l1l">${icon('clock', 13)}${thumb}<b>${title}</b></span><span class="ba-price"${priceTip ? ` data-tip="${priceTip}"` : ''}>${price}</span></div>
      <div class="ba-meta"><span class="ba-star" data-id="${r.id}" data-name="${title}" data-tip="북마크로 저장">${icon('star', 14)}</span><span class="ba-copy" data-id="${r.id}" data-url="${encodeURIComponent(r.url)}" data-tip="검색 링크 복사">${icon('link', 14)}</span><span class="ba-hist-del" data-id="${r.id}" data-tip="이 기록 삭제">${icon('trash', 14)}</span><span class="ba-time">${icon('clock', 11)}${fmtTime(when)}</span>${condChip}</div>
    </div>`
  }

  // ── 북마크: 이름 칩(.ba-open)만 재검색 → 오클릭 방지 ──
  const stale = Date.now() - (r.lastUsedAt || r.createdAt || r.updatedAt || 0) > STALE_MS
  const unsafe = !isAllowedTradeUrl(r.url)
  const dim = stale || unsafe
  // 통합 주의 배지(.ba-attn) — 안전하지 않은 링크 최우선, 그다음 만료. (지난 리그는 거래소가 현재 리그로 리다이렉트하므로 경고 없음)
  const attn = unsafe
    ? `<span class="ba-attn ba-attn--del" data-id="${r.id}" data-act="del" data-tip="허용되지 않은(거래소 외) 링크예요.\n피싱일 수 있어 열기·복사가 차단됩니다.\n클릭하면 삭제합니다.">${icon('alert', 10)}차단된 링크</span>`
    : stale
      ? `<span class="ba-attn ba-attn--del" data-id="${r.id}" data-act="del" data-tip="14일 넘게 안 쓴 북마크예요.\n거래소 링크가 만료돼 못 열 수 있어요.\n클릭하면 삭제합니다.">${icon('trash', 10)}오래됨</span>`
      : ''
  // 능력치 미리보기 칩은 텍스트 길이에 따라 줄바꿈돼 호버(+n) 위치가 흔들림 →
  // 고정 폭 '조건 N개' 단일 칩(호버 시 전체 상세) + 상시 메모로 대체.
  const noteText = r.note || buildAutoNote(r) // 빈 메모면 조건 요약을 렌더 시점에 폴백 표시(저장 X, 편집하면 그때 저장)
  return `<div class="ba-row${dim ? ' ba-attn-dim' : ''}" data-id="${r.id}" data-kind="bookmark" data-order="${r.order ?? 0}" data-folder="${r.folderId ?? ''}" data-search="${searchText}" data-url="${encodeURIComponent(r.url)}">
    <div class="ba-line1">
      <span class="ba-l1l"><span class="ba-grip" draggable="true" data-id="${r.id}" data-tip="드래그해 순서·폴더 이동">${icon('grip', 14)}</span>${thumb}<span class="ba-open" data-tip="${title}&#10;────────&#10;클릭하면 거래소에서 다시 검색">${icon('search', 13)}<b>${title}</b></span></span>
      <span class="ba-price-pill"${priceTip ? ` data-tip="${priceTip}&#10;북마크를 열면 최신 시세로 갱신돼요."` : ''}>${price}</span>
    </div>
    <div class="ba-meta-row">${attn}${condChip}<div class="ba-note-slot" data-id="${r.id}" data-note="${escapeHtml(noteText)}">${noteText ? `<span class="ba-note${r.note ? '' : ' ba-note--auto'}" data-tip="${r.note ? '클릭해 메모 편집' : '검색 조건 자동 요약 — 클릭해 메모로 저장·편집'}">${icon('chat', 11)}<span>${escapeHtml(noteText)}</span></span>` : `<span class="ba-note ba-note--empty" data-tip="클릭해 메모 추가">${icon('chat', 11)}<span>+ 메모</span></span>`}</div></div>
    <div class="ba-rowfoot">
      <span class="time">${icon('clock', 11)}${fmtTime(when)}</span>
      <span class="acts"><span class="ba-act copy ba-copy" data-id="${r.id}" data-url="${encodeURIComponent(r.url)}" data-tip="검색 링크 복사">${icon('link', 13)}</span><span class="ba-act over ba-over" data-id="${r.id}" data-tip="최근 검색으로 갱신(덮어쓰기)">${icon('refresh', 13)}</span><span class="ba-act rename ba-rename" data-id="${r.id}" data-name="${title}" data-tip="이름 변경">${icon('pencil', 12)}</span><span class="ba-act move ba-move" data-id="${r.id}" data-folder="${r.folderId ?? ''}" data-tip="다른 폴더로 이동">${icon('folder', 12)}</span><span class="ba-act del ba-del" data-id="${r.id}" data-tip="삭제">${icon('trash', 12)}</span></span>
    </div>
  </div>`
}

// 폴더 하나의 헤더+본문 HTML (리그 섹션 안에서 재사용)
function folderHtml(g, items, currentLeague) {
  const fActions =
    g.id !== null
      ? `<span class="ba-folder-rename" data-id="${g.id}" data-name="${escapeHtml(g.name)}" data-tip="이름변경">${icon('pencil', 13)}</span><span class="ba-folder-export" data-id="${g.id}" data-name="${escapeHtml(g.name)}" data-tip="이 폴더만 JSON으로 내보내기 (오래된 북마크 제외)">${icon('download', 13)}</span><span class="ba-folder-del" data-id="${g.id}" data-tip="폴더 삭제(북마크는 미분류로)">${icon('trash', 13)}</span>`
      : ''
  // 현재 거래소 검색을 이 폴더에 바로 저장 — 본문 하단 전체폭 칩(시인성↑). 저장 다이얼로그가 이 폴더를 미리 선택한 채 열림
  const saveChip = `<button class="ba-folder-savechip" data-id="${g.id ?? ''}" data-tip="현재 거래소 검색을 이 폴더에 저장">${icon('plus', 13)}이 폴더에 현재 검색 저장</button>`
  const folderColor = g.color || (g.id === null ? '#a78bfa' : '#8b85a8')
  const fkey = g.id ?? ''
  const collapsed = collapsedFolders.has(fkey)
  const fgrip = g.id !== null
    ? `<span class="ba-folder-grip" draggable="true" data-id="${g.id}" data-tip="드래그해 폴더 순서 이동" style="color:${folderColor}">${icon('grip', 14)}</span>`
    : ''
  const chevron = `<span class="ba-folder-chevron">${icon('chevronRight', 13)}</span>`
  const folderIc = g.id !== null
    ? `<span class="ba-folder-ic" data-id="${g.id}" data-color="${folderColor}" data-tip="폴더 색상 변경" style="color:${folderColor}">${icon('folder', 15)}</span>`
    : `<span class="ba-folder-ic" style="color:${folderColor}">${icon('folder', 15)}</span>`
  const headStyle = `background:${hexToRgba(folderColor, g.id === null ? 0.1 : 0.15)};border-left-color:${folderColor}`
  const countStyle = `color:${folderColor};background:${hexToRgba(folderColor, 0.16)}`
  return `<div class="ba-folder${collapsed ? ' ba-folder--collapsed' : ''}" data-folder="${fkey}">
      <div class="ba-folder-head" data-id="${fkey}" style="${headStyle}">${fgrip}${chevron}${folderIc}<span class="ba-folder-name">${escapeHtml(g.name)}</span><span class="ba-folder-count" style="${countStyle}">${items.length}</span><span class="ba-folder-actions">${fActions}</span></div>
      <div class="ba-folder-body" data-folder="${fkey}" style="border-left-color:${hexToRgba(folderColor, 0.34)}">${saveChip}${items.map((r) => rowHtml(r, 'bookmark', currentLeague)).join('') || '<div class="ba-folder-empty">여기로 드래그</div>'}</div>
    </div>`
}

// 북마크 + 히스토리를 한 스크롤에 통합 렌더 (탭 없음 → 패널 전체 높이 활용)
export async function renderList(listEl, root, ui = {}) {
  await hydrateUiState()
  const [bookmarks, folders, history] = await Promise.all([
    listByKind('bookmark', ui.game),
    listFolders(ui.game),
    listByKind('history', ui.game),
  ])

  // ── 북마크 섹션 (폴더 그룹) ──
  const now = Date.now()
  const staleN = bookmarks.filter((b) => now - (b.lastUsedAt || b.createdAt || b.updatedAt || 0) > STALE_MS).length
  const cleanupBtn = staleN > 0
    ? `<button class="ba-clean-stale" data-tip="14일 넘게 안 쓴 북마크를 한 번에 정리해요.\n오래된 검색은 거래소 필터·파라미터가 바뀌면\n더 이상 불러오지 못할 수 있거든요.">${icon('broom', 13)}오래된 ${staleN}</button>`
    : ''
  const sortToggle = `<span class="ba-seg">
      <span class="ba-sort-seg ${bmSort === 'order' ? 'active' : ''}" data-sort="order" data-tip="수동 순서">순서</span>
      <span class="ba-sort-seg ${bmSort === 'recent' ? 'active' : ''}" data-sort="recent" data-tip="최근 사용순">최근</span>
      <span class="ba-sort-seg ${bmSort === 'name' ? 'active' : ''}" data-sort="name" data-tip="이름순">이름</span>
    </span>`
  const onelineBtn = `<button class="ba-oneline-toggle" data-tip="${oneline ? '북마크를 상세히 보기 (조건·메모·액션 표시)' : '북마크를 한 줄로 간략히 보기 (이름만 — 스크롤 절약)'}">${icon(oneline ? 'chevronDown' : 'chevronRight', 12)}${oneline ? '상세히' : '간략히'}</button>`
  let html = `<div class="ba-sec-head"><span class="ba-sec-title">${icon('bookmark', 15)}<span>북마크</span><span class="ba-sec-count">${bookmarks.length}</span></span><span class="ba-sec-actions">${sortToggle}</span></div>`
  html += `<div class="ba-search-row"><span class="ba-search">${icon('search', 13)}<input class="ba-search-input" data-scope="bm" placeholder="북마크·히스토리 검색 (이름·조건)" value="${escapeHtml(bmSearch)}" /></span></div>`
  // 모든 폴더 접기/펼치기 토글 — 실폴더가 있을 때만(미분류 포함 2개 이상). 라벨은 현재 접힘 상태로 결정.
  const allKeys = ['', ...folders.map((f) => f.id)]
  const allCollapsed = allKeys.every((k) => collapsedFolders.has(k))
  const collapseAllBtn = folders.length >= 1
    ? `<button class="ba-collapse-all" data-tip="${allCollapsed ? '모든 폴더 펼치기' : '모든 폴더 접기'}">${icon(allCollapsed ? 'chevronDown' : 'chevronRight', 12)}${allCollapsed ? '모든 폴더 펼치기' : '모든 폴더 접기'}</button>`
    : ''
  // 검색 아래 별도 액션 행 (.dc.html): 오래된 정리 · 가져오기 · 내보내기 · 모두 접기 · 폴더 추가 (우측 정렬)
  html += `<div class="ba-action-row">${onelineBtn}${cleanupBtn}<span class="ba-io-group"><span class="ba-import" data-tip="JSON에서 북마크 가져오기">${icon('upload', 14)}</span><span class="ba-export" data-tip="북마크를 JSON으로 내보내기 (오래된 북마크 제외)">${icon('download', 14)}</span></span>${collapseAllBtn}<button class="ba-add-folder" data-tip="새 폴더 만들기">${icon('folderPlus', 13)}폴더 추가</button></div>`
  const groups = [{ id: null, name: '미분류' }, ...folders]
  const sortItems = (arr) => {
    if (bmSort === 'recent') return [...arr].sort((a, b) => (b.lastUsedAt || b.updatedAt || 0) - (a.lastUsedAt || a.updatedAt || 0))
    if (bmSort === 'name') return [...arr].sort((a, b) => String(a.name || a.title).localeCompare(String(b.name || b.title), 'ko'))
    return arr
  }
  // 빈 상태 — 북마크·폴더·히스토리 전부 없을 때 (마스코트 안내)
  if (bookmarks.length === 0 && folders.length === 0 && history.length === 0) {
    html += `<div class="ba-empty-bm">
      <img src="${analystUrl}" alt="">
      <b>저장된 북마크가 없어요</b>
      <small>좋은 검색을 찾으면 상단 <span class="hl">현재 검색 저장</span>으로<br>북마크해 두고 언제든 다시 열어보세요</small>
    </div>`
  } else {
    // ── 리그 섹션 (접이식) — 현재 리그는 펼침, 지난 리그는 접어서 아카이브(리다이렉트로 열림) ──
    const leagueMap = ui.getLeagueMap ? ui.getLeagueMap() : {}
    const seen = new Set()
    const orderedLeagues = [ui.league, ...bookmarks.map((b) => b.league), ...history.map((h) => h.league)]
      .filter((l) => l && !seen.has(l) && seen.add(l))
    for (const league of orderedLeagues) {
      const isCurrent = league === ui.league
      const lgBm = bookmarks.filter((b) => (b.league || '') === league)
      const lgHs = history.filter((h) => (h.league || '') === league)
      if (!isCurrent && !lgBm.length && !lgHs.length) continue
      const key = 'L:' + league
      // 기본: 현재 리그 펼침 / 지난 리그 접힘. collapsedLeagues에 키가 있으면 그 기본을 반전.
      const collapsed = collapsedLeagues.has(key) ? isCurrent : !isCurrent
      const lgName = leagueMap[league] || league
      html += `<div class="ba-league${collapsed ? ' ba-league--collapsed' : ''}" data-league="${escapeHtml(league)}">
      <div class="ba-league-head" data-key="${escapeHtml(key)}">
        <span class="ba-league-chevron">${icon('chevronRight', 13)}</span>
        <span class="ba-league-ic">${icon('trophy', 14)}</span>
        <span class="ba-league-name">${escapeHtml(lgName)}</span>
        <span class="ba-league-badge${isCurrent ? ' current' : ''}">${isCurrent ? '현재' : '지난'}</span>
        <span class="ba-league-count">${lgBm.length}</span>
      </div>
      <div class="ba-league-body">`
      // 폴더 그룹 (이 리그 북마크). 빈 폴더는 숨김 — 단 현재 리그 미분류는 드롭 타깃으로 유지
      for (const g of groups) {
        const items = sortItems(lgBm.filter((b) => (b.folderId ?? null) === g.id))
        if (!items.length && !(isCurrent && g.id === null)) continue
        html += folderHtml(g, items, ui.league)
      }
      // 히스토리 (이 리그) — 전체 삭제는 game 전체이므로 현재 리그 섹션에만 노출
      if (lgHs.length) {
        html += `<div class="ba-sec-head ba-sec-hist"><span class="ba-sec-title">${icon('clock', 14)}<span>히스토리</span><span class="ba-sec-count">${lgHs.length}</span></span>${isCurrent ? `<span class="ba-sec-actions"><button class="ba-clear-hist" data-tip="히스토리 전체 삭제 (북마크는 영향 없음)">${icon('trash', 12)}전체 삭제</button></span>` : ''}</div>`
        html += lgHs.slice(0, historyLimit).map((r) => rowHtml(r, 'history')).join('')
        if (lgHs.length > historyLimit) html += `<button class="ba-more-hist" data-tip="히스토리 더 불러오기">더 보기 (남은 ${lgHs.length - historyLimit}개)</button>`
      }
      html += `</div></div>`
    }
  }

  listEl.innerHTML = html
  listEl.classList.toggle('ba-oneline', oneline) // 북마크 간략(한 줄) 보기 영속 반영
  bindAll(listEl, ui)
  applyFilters(listEl) // 재렌더 후 현재 검색어로 필터 재적용
  if (focusGripId) { // 키보드 재정렬 후 포커스 복원 (연속 이동 가능)
    const g = listEl.querySelector(`.ba-grip[data-id="${CSS.escape(focusGripId)}"]`)
    focusGripId = null
    if (g) g.focus()
  }
  if (focusBookmarkId) { // 저장·승격 후 해당 북마크로 스크롤·강조
    const id = focusBookmarkId
    focusBookmarkId = null
    highlightBookmark(listEl, id)
  }
}

function bindAll(listEl, ui) {
  const toast = ui.toast || (() => {})

  // 행 열기 — 히스토리는 카드 전체 클릭, 북마크는 이름 칩(.ba-open)만 (오클릭 방지)
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    if (row.dataset.kind !== 'history') return
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ba-star,.ba-copy,.ba-cond,.ba-stale,.ba-hist-del')) return
      openTradeUrl(decodeURIComponent(row.dataset.url), toast, e)
    })
  })

  // 북마크 이름 칩 클릭 → 재검색
  listEl.querySelectorAll('.ba-open').forEach((s) =>
    s.addEventListener('click', (e) => { e.stopPropagation(); openTradeUrl(decodeURIComponent(s.closest('.ba-row').dataset.url), toast, e) }))

  // 🔗 검색 링크 복사 (북마크·히스토리 공통)
  listEl.querySelectorAll('.ba-copy').forEach((c) =>
    c.addEventListener('click', async (e) => {
      e.stopPropagation()
      const url = decodeURIComponent(c.dataset.url)
      if (!isAllowedTradeUrl(url)) { toast('허용되지 않은 링크는 복사할 수 없어요.'); return }
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

  // 🗑 삭제 (히스토리 행 — 단일 기록 제거)
  listEl.querySelectorAll('.ba-hist-del').forEach((d) =>
    d.addEventListener('click', async (e) => { e.stopPropagation(); await remove(d.dataset.id); changed() }))

  // ✎ 북마크 이름 변경
  listEl.querySelectorAll('.ba-rename').forEach((s) =>
    s.addEventListener('click', async () => {
      const name = ui.showNameInput ? await ui.showNameInput(s.dataset.name || '') : prompt('새 이름', s.dataset.name || '')
      if (name === null) return
      await rename(s.dataset.id, name || s.dataset.name || ''); changed()
    }))

  // 📁 다른 폴더로 이동 — 폴더를 선택해 이동(원거리 이동도 드래그 없이)
  listEl.querySelectorAll('.ba-move').forEach((m) =>
    m.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!ui.showFolderPick) return // 패널 컨텍스트에서만 동작
      const curFolder = m.dataset.folder || null
      const fid = await ui.showFolderPick(curFolder)
      if (fid === false) return // 취소
      if ((curFolder || null) === (fid || null)) { toast('이미 그 폴더에 있어요.'); return }
      // 대상 폴더 맨 뒤로 (order = 해당 폴더 최대 order + 1)
      const inTarget = (await listByKind('bookmark', ui.game)).filter((b) => (b.folderId ?? null) === (fid ?? null))
      const maxOrder = inTarget.reduce((mx, b) => Math.max(mx, b.order ?? 0), 0)
      await moveBookmark(m.dataset.id, { folderId: fid ?? null, order: maxOrder + 1 }); changed(); toast('이동했습니다.')
    }))

  // 📝 메모 편집 (인라인) — 메모 줄·메모 버튼 공통
  const startNoteEdit = (slot) => {
    if (!slot || slot.querySelector('.ba-note-edit')) return
    const id = slot.dataset.id
    slot.innerHTML = `<input class="ba-note-edit" value="${escapeHtml(slot.dataset.note || '')}" placeholder="메모 (위치·빌드·용도 등)" maxlength="120" />`
    const inp = slot.querySelector('.ba-note-edit'); inp.focus(); inp.select()
    let done = false
    const commit = async (save) => { if (done) return; done = true; if (save) await setNote(id, inp.value.trim()); changed() }
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(true) } else if (e.key === 'Escape') { e.preventDefault(); commit(false) } })
    inp.addEventListener('blur', () => commit(true))
  }
  listEl.querySelectorAll('.ba-note').forEach((n) => n.addEventListener('click', (e) => { e.stopPropagation(); startNoteEdit(n.closest('.ba-note-slot')) }))

  // ☆ 히스토리 → 북마크 승격 (같은 조건 북마크가 있으면 중복 저장 방지)
  listEl.querySelectorAll('.ba-star').forEach((s) =>
    s.addEventListener('click', async () => {
      const hist = (await listByKind('history', ui.game)).find((r) => r.id === s.dataset.id)
      const dup = hist && (await findBookmark(hist.dedupeKey, ui.game))
      if (dup) { toast('이미 같은 조건의 북마크가 있습니다.'); highlightBookmark(listEl, dup.id); return }
      const name = ui.showNameInput ? await ui.showNameInput(suggestName(hist), '북마크 이름') : prompt('북마크 이름', suggestName(hist))
      if (name === null) return
      focusBookmarkId = s.dataset.id
      await promoteToBookmark(s.dataset.id, name || undefined); changed()
    }))

  // 🔄 최근 검색으로 덮어쓰기
  listEl.querySelectorAll('.ba-over').forEach((o) =>
    o.addEventListener('click', async () => {
      const latest = (await listByKind('history', ui.game))[0]
      if (!latest) { toast('갱신할 최근 검색이 없습니다.'); return }
      await overwriteBookmark(o.dataset.id, {
        game: latest.game, league: latest.league, url: latest.url, title: latest.title,
        itemType: latest.itemType, stats: latest.stats, statGroups: latest.statGroups,
        otherFilters: latest.otherFilters, priceFilter: latest.priceFilter, icon: latest.icon,
        snapshot: latest.snapshot, dedupeKey: latest.dedupeKey,
      })
      changed(); toast('최근 검색으로 갱신했습니다.')
    }))

  // attn 배지 클릭 — 오래됨(stale)=삭제(갱신은 거래소 링크 만료로 실패할 수 있어 삭제로), 이전 리그=재검색
  listEl.querySelectorAll('.ba-attn[data-act]').forEach((a) =>
    a.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (a.dataset.act === 'open') { openTradeUrl(decodeURIComponent(a.closest('.ba-row').dataset.url), toast, e); return }
      if (a.dataset.act === 'del') { await remove(a.dataset.id); changed(); toast('오래된 북마크를 삭제했습니다.') }
    }))

  // ⊟ 모든 폴더 접기/펼치기 토글 — 하나라도 펼쳐져 있으면 모두 접기, 모두 접혀 있으면 모두 펼치기
  const collapseAllBtn = listEl.querySelector('.ba-collapse-all')
  if (collapseAllBtn) collapseAllBtn.addEventListener('click', () => {
    const keys = [...listEl.querySelectorAll('.ba-folder')].map((f) => f.dataset.folder)
    const allCollapsed = keys.length > 0 && keys.every((k) => collapsedFolders.has(k))
    if (allCollapsed) keys.forEach((k) => collapsedFolders.delete(k))
    else keys.forEach((k) => collapsedFolders.add(k))
    saveCollapsed(); changed()
  })

  // + 폴더
  const addBtn = listEl.querySelector('.ba-add-folder')
  if (addBtn) addBtn.addEventListener('click', async () => {
    const name = ui.showNameInput ? await ui.showNameInput('새 폴더', '새 폴더 이름') : prompt('폴더 이름', '새 폴더')
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
    const { json, count, staleExcluded, unsafeExcluded } = await exportBookmarksJSON(ui.game)
    if (!count) { toast(staleExcluded || unsafeExcluded ? '내보낼 북마크가 없습니다 (오래됨·차단 제외).' : '내보낼 북마크가 없습니다.'); return }
    downloadJSON(json, `bookmark-atlas-${today()}.json`)
    const ex = [staleExcluded ? `오래된 ${staleExcluded}개` : '', unsafeExcluded ? `안전하지 않은 ${unsafeExcluded}개` : ''].filter(Boolean).join(', ')
    toast(`북마크 ${count}개를 내보냈습니다${ex ? ` (${ex} 제외)` : ''}.`)
  })
  listEl.querySelectorAll('.ba-folder-export').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation()
    const { json, count, staleExcluded, unsafeExcluded } = await exportBookmarksJSON(ui.game, b.dataset.id)
    if (!count) { toast('내보낼 북마크가 없습니다.'); return }
    downloadJSON(json, `bookmark-atlas-${b.dataset.name}-${today()}.json`)
    const ex = [staleExcluded ? `오래된 ${staleExcluded}개` : '', unsafeExcluded ? `안전하지 않은 ${unsafeExcluded}개` : ''].filter(Boolean).join(', ')
    toast(`"${b.dataset.name}" 북마크 ${count}개를 내보냈습니다${ex ? ` (${ex} 제외)` : ''}.`)
  }))
  const importBtn = listEl.querySelector('.ba-import')
  if (importBtn) importBtn.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json'
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return
      const rd = new FileReader()
      rd.onload = async () => {
        try {
          const { added, skipped, blocked } = await importBookmarksJSON(ui.game, JSON.parse(rd.result))
          changed()
          const ex = [skipped ? `중복 ${skipped}개` : '', blocked ? `차단 ${blocked}개(허용 도메인 외)` : ''].filter(Boolean).join(', ')
          toast(added ? `${added}개 북마크를 가져왔습니다${ex ? ` (${ex} 제외)` : ''}.` : (blocked ? `허용 도메인 외 링크 ${blocked}개를 차단했습니다.` : '추가할 새 북마크가 없습니다.'))
        } catch (_) { toast('JSON 형식이 올바르지 않습니다.') }
      }
      rd.readAsText(f)
    }
    inp.click()
  })

  // 🧹 오래된 북마크 일괄 정리 — 2클릭 확인 + 버튼에 카운트다운(3초)
  const cleanBtn = listEl.querySelector('.ba-clean-stale')
  if (cleanBtn) {
    const cleanOrig = cleanBtn.innerHTML
    let cdTimer = null
    const resetClean = () => { clearInterval(cdTimer); cdTimer = null; cleanBtn.innerHTML = cleanOrig; cleanBtn.classList.remove('armed') }
    cleanBtn.addEventListener('click', async () => {
      if (cdTimer) { // 무장 상태에서 다시 누름 → 삭제 확정
        resetClean()
        const n = await removeStaleBookmarks(ui.game, STALE_MS)
        changed(); toast(`오래된 북마크 ${n}개를 정리했습니다.`)
        return
      }
      let sec = 3 // 첫 클릭 → 무장 + 카운트다운
      cleanBtn.classList.add('armed')
      cleanBtn.innerHTML = `${icon('trash', 13)}한 번 더! (${sec})`
      cdTimer = setInterval(() => {
        sec -= 1
        if (sec <= 0) resetClean()
        else cleanBtn.innerHTML = `${icon('trash', 13)}한 번 더! (${sec})`
      }, 1000)
    })
  }

  // 🧹 히스토리 전체 삭제 — 2클릭 확인 + 카운트다운(3초)
  const clearHistBtn = listEl.querySelector('.ba-clear-hist')
  if (clearHistBtn) {
    const orig = clearHistBtn.innerHTML
    let cdTimer = null
    const reset = () => { clearInterval(cdTimer); cdTimer = null; clearHistBtn.innerHTML = orig; clearHistBtn.classList.remove('armed') }
    clearHistBtn.addEventListener('click', async () => {
      if (cdTimer) { reset(); const n = await clearHistory(ui.game); changed(); toast(`히스토리 ${n}개를 모두 삭제했습니다.`); return }
      let sec = 3
      clearHistBtn.classList.add('armed')
      clearHistBtn.innerHTML = `${icon('trash', 12)}한 번 더! (${sec})`
      cdTimer = setInterval(() => { sec -= 1; if (sec <= 0) reset(); else clearHistBtn.innerHTML = `${icon('trash', 12)}한 번 더! (${sec})` }, 1000)
    })
  }

  // 히스토리 더 보기 (점진 렌더)
  const moreBtn = listEl.querySelector('.ba-more-hist')
  if (moreBtn) moreBtn.addEventListener('click', () => { historyLimit += 200; changed() })

  // 빠른 검색 — 입력 시 재렌더 없이 show/hide (검색창 포커스 유지)
  listEl.querySelectorAll('.ba-search-input').forEach((inp) => inp.addEventListener('input', () => {
    bmSearch = inp.value
    applyFilters(listEl)
  }))
  // 정렬 토글 — 재렌더
  listEl.querySelectorAll('.ba-sort-seg').forEach((b) => b.addEventListener('click', () => { bmSort = b.dataset.sort; saveSort(); changed() }))
  // 간략(한 줄) 보기 토글 — 재렌더 없이 클래스만 전환(검색·스크롤 유지), 영속 저장
  const onelineToggle = listEl.querySelector('.ba-oneline-toggle')
  if (onelineToggle) onelineToggle.addEventListener('click', () => {
    oneline = !oneline; saveOneline()
    listEl.classList.toggle('ba-oneline', oneline)
    onelineToggle.innerHTML = `${icon(oneline ? 'chevronDown' : 'chevronRight', 12)}${oneline ? '상세히' : '간략히'}`
    onelineToggle.dataset.tip = oneline ? '북마크를 상세히 보기 (조건·메모·액션 표시)' : '북마크를 한 줄로 간략히 보기 (이름만 — 스크롤 절약)'
  })

  // 폴더 하단 칩 → 현재 검색을 그 폴더에 바로 저장 (해당 폴더가 선택된 저장 다이얼로그)
  listEl.querySelectorAll('.ba-folder-savechip').forEach((s) => s.addEventListener('click', (e) => {
    e.stopPropagation()
    if (ui.saveCurrentSearch) ui.saveCurrentSearch(s.dataset.id || null)
  }))

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

  // 폴더 색 아이콘 클릭 → 헤더 아래 색 그리드 토글(프리셋 10색 중 선택)
  listEl.querySelectorAll('.ba-folder-ic[data-id]').forEach((d) => d.addEventListener('click', (e) => {
    e.stopPropagation()
    const folder = d.closest('.ba-folder')
    const head = d.closest('.ba-folder-head')
    const existing = folder.querySelector('.ba-color-grid')
    if (existing) { existing.remove(); return } // 다시 클릭 → 닫기
    const grid = document.createElement('div')
    grid.className = 'ba-color-grid'
    grid.innerHTML = FOLDER_PALETTE
      .map((c) => `<span class="ba-color-chip${c === d.dataset.color ? ' active' : ''}" data-color="${c}" style="background:${c}" role="button" tabindex="0" aria-label="폴더 색상 ${c}"></span>`)
      .join('')
    head.after(grid)
    const pick = async (c) => { await setFolderColor(d.dataset.id, c); changed() }
    grid.querySelectorAll('.ba-color-chip').forEach((chip) => {
      chip.addEventListener('click', (ev) => { ev.stopPropagation(); pick(chip.dataset.color) })
      chip.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(chip.dataset.color) } })
    })
  }))

  // 폴더 헤더 클릭 → 접기/펼치기 (액션·색·이름편집 클릭은 제외)
  listEl.querySelectorAll('.ba-folder-head').forEach((head) => head.addEventListener('click', (e) => {
    if (e.target.closest('.ba-folder-actions, .ba-folder-ic, .ba-folder-edit, .ba-folder-grip')) return
    const folder = head.closest('.ba-folder')
    const key = head.dataset.id || ''
    if (folder.classList.toggle('ba-folder--collapsed')) collapsedFolders.add(key)
    else collapsedFolders.delete(key)
    saveCollapsed()
  }))

  // 리그 헤더 클릭 → 접기/펼치기 (기본 현재 펼침·지난 접힘에서 토글 — collapsedLeagues에 반전 키 기록)
  listEl.querySelectorAll('.ba-league-head').forEach((head) => head.addEventListener('click', () => {
    const key = head.dataset.key
    head.closest('.ba-league').classList.toggle('ba-league--collapsed')
    if (collapsedLeagues.has(key)) collapsedLeagues.delete(key)
    else collapsedLeagues.add(key)
  }))

  bindDnD(listEl)
  applyA11y(listEl)
}

function bindDnD(listEl) {
  let dragId = null
  const clearOver = () => listEl.querySelectorAll('.ba-dragover, .ba-body-dragover').forEach((x) => x.classList.remove('ba-dragover', 'ba-body-dragover'))

  // 드래그는 전용 그립(⠿)에서만 시작 — 행 클릭(열기)과 분리
  listEl.querySelectorAll('.ba-grip').forEach((grip) => {
    const gripRow = grip.closest('.ba-row')
    grip.addEventListener('dragstart', (e) => { dragId = grip.dataset.id; e.dataTransfer.effectAllowed = 'move'; gripRow.classList.add('ba-dragging') })
    grip.addEventListener('dragend', () => { gripRow.classList.remove('ba-dragging'); dragId = null; clearOver() })
    // 키보드 재정렬: Alt+↑/↓ (드래그 대안) + 포커스·라벨
    grip.setAttribute('tabindex', '0')
    grip.setAttribute('role', 'button')
    grip.setAttribute('aria-label', '순서 이동 — 드래그 또는 Alt+위/아래')
    grip.addEventListener('keydown', async (e) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
      e.preventDefault()
      const row = grip.closest('.ba-row')
      const body = row.closest('.ba-folder-body'); if (!body) return
      const rows = [...body.querySelectorAll('.ba-row')]
      const i = rows.indexOf(row)
      const dir = e.key === 'ArrowUp' ? -1 : 1
      const target = rows[i + dir]; if (!target) return
      const targetOrder = parseFloat(target.dataset.order)
      const beyond = rows[i + 2 * dir]
      const newOrder = beyond ? (targetOrder + parseFloat(beyond.dataset.order)) / 2 : targetOrder + dir
      focusGripId = row.dataset.id
      await moveBookmark(row.dataset.id, { folderId: row.dataset.folder || null, order: newOrder }); changed()
    })
  })

  // 북마크 행만 드롭 타깃 (히스토리 행은 그립이 없어 제외)
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    if (!row.querySelector('.ba-grip')) return
    row.addEventListener('dragover', (e) => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; clearOver(); row.classList.add('ba-dragover') })
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
    body.addEventListener('dragover', (e) => {
      if (!dragId) return
      e.preventDefault()
      if (e.target.closest('.ba-row')) return // 행 위면 행 핸들러가 삽입 위치를 강조
      clearOver(); body.classList.add('ba-body-dragover')
    })
    body.addEventListener('drop', async (e) => {
      e.preventDefault()
      clearOver()
      if (!dragId) return
      const folderId = body.dataset.folder || null
      const maxOrder = [...body.querySelectorAll('.ba-row')].reduce((m, r) => Math.max(m, parseFloat(r.dataset.order) || 0), 0)
      await moveBookmark(dragId, { folderId, order: maxOrder + 1 }); changed()
    })
  })

  // ── 폴더 순서 드래그 재배치 (헤더 그립) — 인접뿐 아니라 원거리도 ──
  let folderDragId = null
  const clearFolderDrop = () => listEl.querySelectorAll('.ba-folder-drop').forEach((x) => x.classList.remove('ba-folder-drop'))
  listEl.querySelectorAll('.ba-folder-grip').forEach((grip) => {
    const folderEl = grip.closest('.ba-folder')
    grip.addEventListener('dragstart', (e) => { folderDragId = grip.dataset.id; e.dataTransfer.effectAllowed = 'move'; folderEl.classList.add('ba-folder-dragging') })
    grip.addEventListener('dragend', () => { folderEl.classList.remove('ba-folder-dragging'); folderDragId = null; clearFolderDrop() })
    // 키보드 폴더 이동 (드래그 대안 — Alt+위/아래로 한 칸씩)
    grip.setAttribute('tabindex', '0')
    grip.setAttribute('role', 'button')
    grip.setAttribute('aria-label', '폴더 순서 이동 — 드래그 또는 Alt+위/아래')
    grip.addEventListener('keydown', async (e) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
      e.preventDefault()
      await moveFolder(grip.dataset.id, e.key === 'ArrowUp' ? -1 : 1); changed()
    })
  })
  listEl.querySelectorAll('.ba-folder').forEach((folderEl) => {
    folderEl.addEventListener('dragover', (e) => {
      if (folderDragId == null) return // 북마크 드래그는 기존 핸들러가 처리
      e.preventDefault(); clearFolderDrop(); folderEl.classList.add('ba-folder-drop')
    })
    folderEl.addEventListener('drop', async (e) => {
      if (folderDragId == null) return
      e.preventDefault(); e.stopPropagation(); clearFolderDrop()
      const rect = folderEl.getBoundingClientRect()
      const after = e.clientY - rect.top > rect.height / 2 // 폴더 하단 절반에 놓으면 그 '뒤'로
      let beforeId
      if (after) {
        const next = folderEl.nextElementSibling
        beforeId = next && next.classList.contains('ba-folder') ? next.dataset.folder : null // ''(미분류)·id·null(맨뒤)
      } else {
        beforeId = folderEl.dataset.folder // ''(미분류=맨앞)·id(그 앞)
      }
      if (folderDragId === beforeId) return
      await reorderFolder(folderDragId, beforeId); changed()
    })
  })
}
