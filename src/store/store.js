// src/store/store.js
const KEY = 'records'
const FOLDERS_KEY = 'folders'
export const HISTORY_CAP = 50

function uid(prefix) { return (prefix || 'r_') + Math.random().toString(36).slice(2) + Date.now().toString(36) }
async function readAll() { return (await chrome.storage.local.get(KEY))[KEY] ?? [] }
async function writeAll(records) { await chrome.storage.local.set({ [KEY]: records }) }
async function readFolders() { return (await chrome.storage.local.get(FOLDERS_KEY))[FOLDERS_KEY] ?? [] }
async function writeFolders(folders) { await chrome.storage.local.set({ [FOLDERS_KEY]: folders }) }

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

/** 스냅샷 갱신(수동 "가격 갱신") */
export async function updateSnapshot(id, snapshot) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (r) { r.snapshot = snapshot; r.updatedAt = Date.now(); await writeAll(all) }
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
export async function markUsedByUrl(url) {
  const all = await readAll()
  let changed = false
  for (const r of all) {
    if (r.kind === 'bookmark' && r.url === url) { r.lastUsedAt = Date.now(); changed = true }
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

export async function addFolder(name, game) {
  const folders = await readFolders()
  const folder = { id: uid('f_'), name: name || '새 폴더', game: game ?? null }
  folders.push(folder)
  await writeFolders(folders)
  return folder
}

export async function renameFolder(id, name) {
  const folders = await readFolders()
  const f = folders.find((x) => x.id === id)
  if (f) { f.name = name; await writeFolders(folders) }
}

/** 폴더 삭제 — 해당 폴더의 북마크는 미분류(folderId=null)로 */
export async function deleteFolder(id) {
  await writeFolders((await readFolders()).filter((f) => f.id !== id))
  const all = await readAll()
  let changed = false
  for (const r of all) if (r.kind === 'bookmark' && r.folderId === id) { r.folderId = null; changed = true }
  if (changed) await writeAll(all)
}
