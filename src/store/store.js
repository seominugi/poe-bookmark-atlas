// src/store/store.js
const KEY = 'records'
const FOLDERS_KEY = 'folders'
export const HISTORY_CAP = 200 // 히스토리 보관 상한. renderList "더 보기"(60+200)가 실제로 동작하도록 상향

function uid(prefix) { return (prefix || 'r_') + Math.random().toString(36).slice(2) + Date.now().toString(36) }
async function readAll() { return (await chrome.storage.local.get(KEY))[KEY] ?? [] }
async function writeAll(records) { await chrome.storage.local.set({ [KEY]: records }) }
async function readFolders() { return (await chrome.storage.local.get(FOLDERS_KEY))[FOLDERS_KEY] ?? [] }
async function writeFolders(folders) { await chrome.storage.local.set({ [FOLDERS_KEY]: folders }) }

// ── URL 안전성: 거래소(허용 도메인) 링크만 열기·복사·가져오기·내보내기 허용 (피싱·javascript: 차단) ──
const ALLOWED_HOSTS = ['poe.kakaogames.com']
export function isAllowedTradeUrl(url) {
  try {
    const u = new URL(String(url))
    return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname) &&
      (u.pathname.startsWith('/trade2/') || u.pathname.startsWith('/trade/'))
  } catch (_) { return false }
}

const maxBookmarkOrder = (all) => all.reduce((m, r) => (r.kind === 'bookmark' ? Math.max(m, r.order ?? 0) : m), 0)

/** 히스토리 추가(동일 dedupeKey 갱신, 50개 캡). @returns {Promise<object>} */
export async function addHistory(rec) {
  const all = await readAll()
  const now = Date.now()
  const idx = all.findIndex((r) => r.kind === 'history' && r.dedupeKey === rec.dedupeKey)
  let record
  if (idx >= 0) {
    record = { ...all[idx], ...rec, kind: 'history', updatedAt: now }
    all.splice(idx, 1)
  } else {
    record = { ...rec, id: uid(), kind: 'history', createdAt: now, updatedAt: now }
  }
  const histories = all.filter((r) => r.kind === 'history')
  const others = all.filter((r) => r.kind !== 'history')
  const trimmed = [record, ...histories].slice(0, HISTORY_CAP)
  await writeAll([...others, ...trimmed])
  return record
}

/** kind별 조회. game 지정 시 해당 게임만. 북마크는 order 오름차순, 히스토리는 최신순. */
export async function listByKind(kind, game) {
  const list = (await readAll()).filter((r) => r.kind === kind && (!game || r.game === game))
  if (kind === 'bookmark') return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 같은 dedupeKey(조건)·game의 북마크가 있으면 반환 — 중복 저장 방지용 */
export async function findBookmark(dedupeKey, game) {
  if (!dedupeKey) return null
  return (await readAll()).find((r) => r.kind === 'bookmark' && r.dedupeKey === dedupeKey && (!game || r.game === game)) || null
}

export async function promoteToBookmark(id, name) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (!r) return
  r.kind = 'bookmark'
  r.name = name ?? r.name ?? r.title
  r.folderId = r.folderId ?? null
  r.order = maxBookmarkOrder(all) + 1
  r.updatedAt = Date.now()
  await writeAll(all)
}

export async function rename(id, name) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (r) { r.name = name; r.updatedAt = Date.now(); await writeAll(all) }
}

export async function remove(id) {
  await writeAll((await readAll()).filter((r) => r.id !== id))
}

/** 명시적 북마크 저장(현재 검색 직접 저장 시) */
export async function addBookmark(rec, name) {
  const all = await readAll()
  const now = Date.now()
  const record = {
    ...rec, id: uid(), kind: 'bookmark', name: name ?? rec.title,
    folderId: rec.folderId ?? null, order: maxBookmarkOrder(all) + 1,
    createdAt: now, updatedAt: now,
  }
  await writeAll([...all, record])
  return record
}

/** 북마크를 새 검색(source)으로 덮어쓰기 — name·folderId·order·id·createdAt 유지 */
export async function overwriteBookmark(id, source) {
  const all = await readAll()
  const r = all.find((x) => x.id === id && x.kind === 'bookmark')
  if (!r) return
  r.game = source.game
  r.league = source.league
  r.url = source.url
  r.title = source.title
  r.itemType = source.itemType
  r.stats = source.stats
  r.statGroups = source.statGroups
  r.priceFilter = source.priceFilter
  r.snapshot = source.snapshot
  r.dedupeKey = source.dedupeKey
  r.updatedAt = Date.now()
  await writeAll(all)
}

/** DnD: 북마크의 폴더/순서 갱신 */
export async function moveBookmark(id, patch) {
  const all = await readAll()
  const r = all.find((x) => x.id === id && x.kind === 'bookmark')
  if (!r) return
  if (patch.folderId !== undefined) r.folderId = patch.folderId
  if (typeof patch.order === 'number') r.order = patch.order
  r.updatedAt = Date.now()
  await writeAll(all)
}

/** 저장된 검색을 열어 결과가 실제 로드되면 호출 — 해당 URL 북마크의 lastUsedAt 갱신(만료 경고 해제) */
export async function markUsedByUrl(url, snapshot) {
  const all = await readAll()
  const now = Date.now()
  let changed = false
  for (const r of all) {
    if (r.kind === 'bookmark' && r.url === url) {
      r.lastUsedAt = now
      if (snapshot) { r.snapshot = snapshot; r.snapshotAt = now } // 북마크를 열어 결과가 뜨면 가격 스냅샷 자동 갱신
      changed = true
    }
  }
  if (changed) await writeAll(all)
}

/** 오래된(staleMs 이상 미사용) 북마크 일괄 삭제. game 스코프. @returns {Promise<number>} 삭제 개수 */
export async function removeStaleBookmarks(game, staleMs, now = Date.now()) {
  const all = await readAll()
  const isStale = (r) =>
    r.kind === 'bookmark' &&
    (!game || r.game === game) &&
    now - (r.lastUsedAt || r.createdAt || r.updatedAt || 0) > staleMs
  const kept = all.filter((r) => !isStale(r))
  const removed = all.length - kept.length
  if (removed > 0) await writeAll(kept)
  return removed
}

// ── 폴더 (game 스코프) ──
/** game 지정 시 해당 게임 폴더 + 게임 미지정(레거시) 폴더. */
export async function listFolders(game) {
  const folders = await readFolders()
  return game ? folders.filter((f) => !f.game || f.game === game) : folders
}

// 폴더 색상 — 새 폴더에 5색 팔레트를 순환 자동 배정(같은 game 스코프 폴더 수 기준)
export const FOLDER_PALETTE = ['#a78bfa', '#7dd3fc', '#5eead4', '#fbbf24', '#fb7185']
export async function addFolder(name, game, color) {
  const folders = await readFolders()
  const scopeCount = folders.filter((f) => (f.game ?? null) === (game ?? null)).length
  const folder = {
    id: uid('f_'), name: name || '새 폴더', game: game ?? null,
    color: color || FOLDER_PALETTE[scopeCount % FOLDER_PALETTE.length],
  }
  folders.push(folder)
  await writeFolders(folders)
  return folder
}

/** 폴더 색상 변경 */
export async function setFolderColor(id, color) {
  const folders = await readFolders()
  const f = folders.find((x) => x.id === id)
  if (f) { f.color = color; await writeFolders(folders) }
}

export async function renameFolder(id, name) {
  const folders = await readFolders()
  const f = folders.find((x) => x.id === id)
  if (f) { f.name = name; await writeFolders(folders) }
}

/** 폴더 순서 이동 — folders 배열에서 같은 game 스코프의 인접 폴더와 스왑. dir<0 위로, dir>0 아래로. */
export async function moveFolder(id, dir) {
  const folders = await readFolders()
  const idx = folders.findIndex((f) => f.id === id)
  if (idx < 0) return
  const scope = folders[idx].game ?? null
  const sameScope = (f) => (f.game ?? null) === scope
  let swapIdx = -1
  if (dir < 0) { for (let i = idx - 1; i >= 0; i--) if (sameScope(folders[i])) { swapIdx = i; break } }
  else { for (let i = idx + 1; i < folders.length; i++) if (sameScope(folders[i])) { swapIdx = i; break } }
  if (swapIdx < 0) return
  const tmp = folders[idx]; folders[idx] = folders[swapIdx]; folders[swapIdx] = tmp
  await writeFolders(folders)
}

/** 폴더 삭제 — 해당 폴더의 북마크는 미분류(folderId=null)로 */
export async function deleteFolder(id) {
  await writeFolders((await readFolders()).filter((f) => f.id !== id))
  const all = await readAll()
  let changed = false
  for (const r of all) if (r.kind === 'bookmark' && r.folderId === id) { r.folderId = null; changed = true }
  if (changed) await writeAll(all)
}

// ── JSON 내보내기 / 가져오기 ──
const EXPORT_STALE_MS = 14 * 24 * 60 * 60 * 1000 // 오래된(14일↑ 미사용) 북마크는 내보내기에서 제외

/**
 * 북마크를 JSON으로 내보낼 데이터 생성. folderId === undefined → 전체, null → 미분류, 'fid' → 특정 폴더.
 * stale(14일↑ 미사용) 북마크는 항상 제외하고 제외 개수를 함께 반환.
 * @returns {Promise<{json: object, count: number, staleExcluded: number}>}
 */
export async function exportBookmarksJSON(game, folderId, now = Date.now()) {
  const all = await listByKind('bookmark', game)
  let scoped = folderId === undefined ? all : all.filter((b) => (b.folderId ?? null) === folderId)
  const total = scoped.length
  scoped = scoped.filter((b) => now - (b.lastUsedAt || b.createdAt || b.updatedAt || 0) <= EXPORT_STALE_MS)
  const staleExcluded = total - scoped.length
  scoped = scoped.filter((b) => isAllowedTradeUrl(b.url)) // 허용 도메인 외 URL은 내보내지 않음(피싱 전파 차단)
  const unsafeExcluded = total - staleExcluded - scoped.length
  const folders =
    folderId === undefined
      ? await listFolders(game)
      : (await listFolders(game)).filter((f) => f.id === folderId)
  return {
    json: {
      app: 'poe-bookmark-atlas', version: 1, exportedAt: new Date(now).toISOString(),
      game: game ?? null, scope: folderId === undefined ? 'all' : (folderId || 'uncategorized'),
      staleExcluded, unsafeExcluded, folders, bookmarks: scoped,
    },
    count: scoped.length,
    staleExcluded,
    unsafeExcluded,
  }
}

/**
 * JSON에서 북마크를 가져오기. 같은 dedupeKey 중복은 건너뛰고, 없는 폴더만 이름 기준으로 생성(id 매핑),
 * 북마크는 새 id·order를 발급한다.
 * @returns {Promise<{added: number, skipped: number, foldersAdded: number}>}
 */
export async function importBookmarksJSON(game, data) {
  const inB = Array.isArray(data && data.bookmarks) ? data.bookmarks : []
  const inF = Array.isArray(data && data.folders) ? data.folders : []
  const existing = await listFolders(game)
  const idMap = {} // 가져온 폴더 id → 현재 폴더 id
  let foldersAdded = 0
  for (const f of inF) {
    if (!f || !f.name) continue
    const match = existing.find((x) => x.name === f.name)
    if (match) { idMap[f.id] = match.id }
    else { const created = await addFolder(f.name, game); idMap[f.id] = created.id; existing.push(created); foldersAdded++ }
  }
  let added = 0
  let skipped = 0
  let blocked = 0
  for (const b of inB) {
    if (!b) continue
    if (!isAllowedTradeUrl(b.url)) { blocked++; continue } // 허용 도메인 외 URL은 가져오지 않음(피싱 차단)
    if (b.dedupeKey && (await findBookmark(b.dedupeKey, game))) { skipped++; continue }
    const folderId = b.folderId != null ? (idMap[b.folderId] ?? null) : null
    // 기존 메타(id·kind·order·시간)는 버리고 addBookmark가 새로 발급하도록 한다
    const { id, kind, order, createdAt, updatedAt, lastUsedAt, ...rest } = b
    await addBookmark({ ...rest, game, folderId }, b.name || b.title)
    added++
  }
  return { added, skipped, foldersAdded, blocked }
}
