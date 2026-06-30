// src/store/store.js
import { buildAutoNote } from '../lib/autoNote.js'

const KEY = 'records'
const FOLDERS_KEY = 'folders'
const SCHEMA_KEY = 'schemaVersion'
const CURRENT_SCHEMA = 1 // 데이터 스키마 버전. 구조를 바꾸면 +1 하고 MIGRATIONS에 단계 변환을 추가
export const HISTORY_CAP = 200 // 히스토리 보관 상한. renderList "더 보기"(60+200)가 실제로 동작하도록 상향

function uid(prefix) { return (prefix || 'r_') + Math.random().toString(36).slice(2) + Date.now().toString(36) }
async function readAll() { return (await chrome.storage.local.get(KEY))[KEY] ?? [] }
async function writeAll(records) { await chrome.storage.local.set({ [KEY]: records }) }
async function readFolders() { return (await chrome.storage.local.get(FOLDERS_KEY))[FOLDERS_KEY] ?? [] }
async function writeFolders(folders) { await chrome.storage.local.set({ [FOLDERS_KEY]: folders }) }

// ── 스키마 버전 & 마이그레이션 ───────────────────────────────
// 버전 키가 없으면 기존(레거시)·신규 데이터 모두 현재 구조(v1, 지금까지 전부 additive)와 호환되므로 v1로 마킹만 한다.
// 향후 구조를 바꿀 때: CURRENT_SCHEMA를 올리고 MIGRATIONS[새버전] = async (s) => {...} 단계 변환을 추가하면 순차 적용된다.
// 주의: 실제 변환 단계를 넣으면 데이터를 읽기 전에 await ensureSchema()가 끝나도록 호출부를 조정해야 한다.
const MIGRATIONS = {
  // 2: async (s) => { /* v1 → v2: s.records / s.folders 변환 후 반환 */ return s },
}
export async function ensureSchema() {
  const got = (await chrome.storage.local.get(SCHEMA_KEY))[SCHEMA_KEY]
  if (got === CURRENT_SCHEMA) return
  let v = typeof got === 'number' ? got : 1 // 미설정 = 레거시/신규 모두 v1 구조로 간주
  while (v < CURRENT_SCHEMA) {
    const step = MIGRATIONS[v + 1]
    if (step) {
      const s = await step({ records: await readAll(), folders: await readFolders() })
      await writeAll(s.records); await writeFolders(s.folders)
    }
    v++
  }
  await chrome.storage.local.set({ [SCHEMA_KEY]: CURRENT_SCHEMA })
}

// ── 가이드 투어 전용 데모 데이터 ──────────────────────────
// 빈 첫 화면에서도 투어가 기능을 시연하도록 임시 주입(__demo 플래그), 투어 종료 시 제거한다. 실제 저장소는 오염되지 않는다.
const DEMO_FOLDER_ID = '__demo_folder'
export async function isStoreEmpty(game) {
  const all = await readAll()
  const folders = await readFolders()
  return !all.some((r) => r.game === game && !r.__demo) && !folders.some((f) => !f.__demo)
}
export async function seedDemoData(game, league) {
  const all = await readAll()
  if (all.some((r) => r.__demo)) return // 이미 주입됨
  const folders = await readFolders()
  const now = Date.now()
  const u = (h) => `https://poe.kakaogames.com/trade2/search/poe2/${encodeURIComponent(league || 'Standard')}/__demo_${h}`
  const snap = (v, n, low) => ({ valueDiv: v, value: v, unit: 'divine', sampleN: n, lowestAsk: low, method: 'sellable_p25', capturedAt: now })
  const base = { game, league, createdAt: now, updatedAt: now, snapshotAt: now, __demo: true }
  const records = [
    { ...base, id: '__demo_b1', kind: 'bookmark', name: '예시 — 화염 저항 반지', title: '반지', itemType: '반지', url: u('b1'), stats: ['화염 저항 #%', '최대 생명력 #'], otherFilters: [{ key: 'category', label: '유형', value: '반지' }], snapshot: snap(2.3, 12, 1.8), folderId: DEMO_FOLDER_ID, order: -1, lastUsedAt: now, note: '예시 메모 — 위치·빌드·용도' },
    { ...base, id: '__demo_b2', kind: 'bookmark', name: '예시 — 카오스 단검', title: '단검', itemType: '단검', url: u('b2'), stats: ['물리 피해 #', '공격 속도 #%', '치명타 확률 #%'], snapshot: snap(0.5, 8, 0.3), folderId: null, order: -2, lastUsedAt: now },
    { ...base, id: '__demo_h1', kind: 'history', name: '예시 검색 — 생명력 갑옷', title: '갑옷', itemType: '갑옷', url: u('h1'), stats: ['최대 생명력 #', '방어도 #'], snapshot: snap(1.1, 7, 0.9), dedupeKey: '__demo_h1' },
  ]
  await writeFolders([...folders, { id: DEMO_FOLDER_ID, name: '예시 폴더', game, color: '#a78bfa', __demo: true }])
  await writeAll([...all, ...records])
}
export async function clearDemoData() {
  const all = await readAll()
  if (all.some((r) => r.__demo)) await writeAll(all.filter((r) => !r.__demo))
  const folders = await readFolders()
  if (folders.some((f) => f.__demo)) await writeFolders(folders.filter((f) => !f.__demo))
}

// ── URL 안전성: 거래소(허용 도메인) 링크만 열기·복사·가져오기·내보내기 허용 (피싱·javascript: 차단) ──
const ALLOWED_HOSTS = ['poe.kakaogames.com', 'www.pathofexile.com']
export function isAllowedTradeUrl(url) {
  try {
    const u = new URL(String(url))
    return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname) &&
      (u.pathname.startsWith('/trade2/') || u.pathname.startsWith('/trade/'))
  } catch (_) { return false }
}

// 아이템 썸네일 이미지: POE 공식 CDN(web.poecdn.com, https)만 허용 — 가져온 북마크의 악성·트래킹 이미지 차단.
const ALLOWED_ICON_HOSTS = ['web.poecdn.com']
export function isAllowedIconUrl(url) {
  try { const u = new URL(String(url)); return u.protocol === 'https:' && ALLOWED_ICON_HOSTS.includes(u.hostname) } catch (_) { return false }
}

// 새 북마크는 폴더 맨 앞(최신 우선)에 오도록 현재 가장 작은 order - 1을 부여
const minBookmarkOrder = (all) => all.reduce((m, r) => (r.kind === 'bookmark' ? Math.min(m, r.order ?? 0) : m), 0)

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
  r.order = minBookmarkOrder(all) - 1
  if (!r.note) r.note = buildAutoNote(r) || undefined // 빈 메모면 검색 조건 요약 자동 채움
  r.updatedAt = Date.now()
  await writeAll(all)
}

export async function rename(id, name) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (r) { r.name = name; r.updatedAt = Date.now(); await writeAll(all) }
}

/** 북마크 메모 설정 — 빈 문자열이면 제거 */
export async function setNote(id, note) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (r) { r.note = note || undefined; r.updatedAt = Date.now(); await writeAll(all) }
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
    folderId: rec.folderId ?? null, order: minBookmarkOrder(all) - 1,
    note: rec.note || buildAutoNote(rec) || undefined, // 빈 메모면 검색 조건 요약 자동 채움
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
  r.otherFilters = source.otherFilters
  r.priceFilter = source.priceFilter
  if (source.icon !== undefined) r.icon = source.icon
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
export async function markUsedByUrl(url, snapshot, icon) {
  const all = await readAll()
  const now = Date.now()
  let changed = false
  for (const r of all) {
    if (r.kind === 'bookmark' && r.url === url) {
      r.lastUsedAt = now
      if (snapshot) { r.snapshot = snapshot; r.snapshotAt = now } // 북마크를 열어 결과가 뜨면 가격 스냅샷 자동 갱신
      if (icon) r.icon = icon // 결과 대표 이미지도 최신 최빈으로 갱신
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

/** 히스토리 전체 삭제 (game 스코프). 북마크는 보존. @returns {Promise<number>} 삭제 개수 */
export async function clearHistory(game) {
  const all = await readAll()
  const kept = all.filter((r) => !(r.kind === 'history' && (!game || r.game === game)))
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

// 폴더 색상 — 자수정(시그니처 바이올렛) 기준 유사색·보색 10색 큐레이트 팔레트.
// 다크 보라 글래스에 어울리도록 선별(무지개 나열 X): 유사색(자수정·인디고·퍼플·푸시아·핑크)
// → 따뜻 대비(로즈·코랄·골드) → 시원 보색(민트·스카이). 새 폴더에 순환 자동 배정.
export const FOLDER_PALETTE = ['#a78bfa', '#818cf8', '#c084fc', '#e879f9', '#f472b6', '#fb7185', '#fb923c', '#fbbf24', '#5eead4', '#38bdf8']
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

/**
 * 폴더를 드래그로 임의 위치에 재배치(인접뿐 아니라 원거리도). moveFolder(±1 스왑)와 별개.
 * beforeId: '' → 맨 앞(미분류 자리), 폴더 id → 그 폴더 바로 앞, null/미발견 → 맨 뒤.
 */
export async function reorderFolder(id, beforeId) {
  if (id === beforeId) return
  const folders = await readFolders()
  const idx = folders.findIndex((f) => f.id === id)
  if (idx < 0) return
  const [moved] = folders.splice(idx, 1)
  const bIdx = beforeId ? folders.findIndex((f) => f.id === beforeId) : -1
  if (beforeId === '') folders.unshift(moved)
  else if (beforeId == null || bIdx < 0) folders.push(moved)
  else folders.splice(bIdx, 0, moved)
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
    if (rest.icon && !isAllowedIconUrl(rest.icon)) delete rest.icon // 허용 CDN 외 이미지는 제거(북마크 자체는 유지)
    await addBookmark({ ...rest, game, folderId }, b.name || b.title)
    added++
  }
  return { added, skipped, foldersAdded, blocked }
}
