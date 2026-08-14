// src/store/store.js
import { sanitizeQuery, isAllowedTradeUrl } from '../lib/tradeSearch.js'

const KEY = 'records'
const FOLDERS_KEY = 'folders'
const SETS_KEY = 'conditionSets' // 조건 묶음 — records(북마크·히스토리)와 생명주기가 달라 folders처럼 별도 키
const WATCH_KEY = 'watchlist' // 찜한 매물 — 팔리면 사라지므로 records와 생명주기가 다르다(같은 근거로 별도 키)
const SCHEMA_KEY = 'schemaVersion'
const CURRENT_SCHEMA = 2 // 데이터 스키마 버전. 구조를 바꾸면 +1 하고 MIGRATIONS에 단계 변환을 추가
export const HISTORY_CAP = 200 // 히스토리 보관 상한. renderList "더 보기"(60+200)가 실제로 동작하도록 상향

function uid(prefix) { return (prefix || 'r_') + Math.random().toString(36).slice(2) + Date.now().toString(36) }
async function readAll() { return (await chrome.storage.local.get(KEY))[KEY] ?? [] }
async function writeAll(records) { await chrome.storage.local.set({ [KEY]: records }) }
async function readSets() { return (await chrome.storage.local.get(SETS_KEY))[SETS_KEY] ?? [] }
async function writeSets(sets) { await chrome.storage.local.set({ [SETS_KEY]: sets }) }
async function readFolders() { return (await chrome.storage.local.get(FOLDERS_KEY))[FOLDERS_KEY] ?? [] }
async function writeFolders(folders) { await chrome.storage.local.set({ [FOLDERS_KEY]: folders }) }

// ── 스키마 버전 & 마이그레이션 ───────────────────────────────
// 버전 키가 없으면 기존(레거시)·신규 데이터 모두 현재 구조(v1, 지금까지 전부 additive)와 호환되므로 v1로 마킹만 한다.
// 향후 구조를 바꿀 때: CURRENT_SCHEMA를 올리고 MIGRATIONS[새버전] = async (s) => {...} 단계 변환을 추가하면 순차 적용된다.
// 주의: 실제 변환 단계를 넣으면 데이터를 읽기 전에 await ensureSchema()가 끝나도록 호출부를 조정해야 한다.
const MIGRATIONS = {
  // v2 (2026-08-13): 북마크 메모 기능 제거 — 저장된 note 필드를 지운다(사용자 결정: 되돌리지 않음).
  //   대부분 저장 시 자동 요약으로 채워진 값이었고 조건 요약 칩과 내용이 겹쳤다.
  2: async (s) => {
    for (const r of s.records) delete r.note
    return s
  },
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

/**
 * 투어가 가리킬 대상이 실제로 있는지 — 없으면 데모를 띄운다.
 * "저장소가 통째로 비었나"로 판정하면 안 된다: 히스토리만 쌓이고 북마크는 0개인 흔한 상태에서
 * 북마크 이름·가격·폴더 아이콘 스텝이 통째로 가리킬 게 없어진다(사용자 제보 2026-07-22, 5·6·8스텝).
 * 데모는 폴더 1 + 북마크 2(가격 스냅샷 포함)를 넣으므로 아래 세 조건을 모두 메운다.
 */
export async function needsTourDemo(game) {
  const all = await readAll()
  const bookmarks = all.filter((r) => r.kind === 'bookmark' && r.game === game && !r.__demo)
  const folders = (await readFolders()).filter((f) => !f.__demo && (!f.game || f.game === game))
  return bookmarks.length === 0 || folders.length === 0 || !bookmarks.some((b) => b.snapshot)
}

export async function seedDemoData(game, league) {
  const all = await readAll()
  if (all.some((r) => r.__demo)) return // 이미 주입됨
  const folders = await readFolders()
  const now = Date.now()
  // 데모 링크도 게임에 맞는 경로로 — 투어 중 실수로 클릭해도 엉뚱한 게임의 404로 가지 않게
  const basePath = game === 'poe1' ? '/trade/search/' : '/trade2/search/poe2/'
  const u = (h) => `https://poe.kakaogames.com${basePath}${encodeURIComponent(league || 'Standard')}/__demo_${h}`
  const snap = (v, n, low) => ({ valueDiv: v, value: v, unit: 'divine', sampleN: n, lowestAsk: low, method: 'sellable_p25', capturedAt: now })
  const base = { game, league, createdAt: now, updatedAt: now, snapshotAt: now, __demo: true }
  const records = [
    // query(원본 검색 바디)를 함께 넣는다 — 없으면 조건 칩이 '클릭해서 능력치 추가'(.ba-cond--add)로 살아나지 않아
    // 조건 칩 스텝과 ⋯ → "조건 묶음으로 등록" 액션이 데모 카드에서 통째로 사라진다.
    { ...base, id: '__demo_b1', kind: 'bookmark', name: '예시 — 화염 저항 반지', title: '반지', itemType: '반지', url: u('b1'), stats: ['화염 저항 #%', '최대 생명력 #'], otherFilters: [{ key: 'category', label: '유형', value: '반지' }], snapshot: snap(2.3, 12, 1.8), folderId: DEMO_FOLDER_ID, order: -1, lastUsedAt: now, query: { query: { status: { option: 'online' }, type: '반지', stats: [{ type: 'and', filters: [{ id: 'explicit.stat_demo_fire_res', value: { min: 30 } }, { id: 'explicit.stat_demo_life', value: { min: 80 } }] }] } } },
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

/**
 * 조건 묶음 줄(#ba-sets)은 묶음이 0개면 hidden이라 투어가 가리킬 대상이 없다.
 * 북마크 데모(needsTourDemo)와 판정을 합치면 안 된다 — 북마크가 잔뜩 있어도 묶음은 0개일 수 있고,
 * 그때 북마크 데모까지 주입하면 멀쩡한 목록에 '예시' 카드가 끼어든다.
 */
export async function needsConditionSetDemo(game) {
  return !(await readSets()).some((s) => s && !s.__demo && (!game || s.game === game))
}

export async function seedDemoSets(game) {
  const sets = await readSets()
  if (sets.some((s) => s.__demo)) return // 이미 주입됨
  const now = Date.now()
  const maxOrder = sets.reduce((m, s) => Math.max(m, s.order ?? 0), 0)
  // 스탯 id는 '__demo_' 접두 — 실수로 얹혀도 거래소가 모르는 id라 검색이 바뀌지 않는다.
  const demo = [
    { name: '예시 — 저항 묶음', itemType: null, stats: [
      { id: 'explicit.stat_demo_fire_res', text: '화염 저항 #%', value: { min: 35 } },
      { id: 'explicit.stat_demo_cold_res', text: '냉기 저항 #%', value: { min: 35 } },
    ] },
    { name: '예시 — 생명력', itemType: null, stats: [{ id: 'explicit.stat_demo_life', text: '최대 생명력 #', value: { min: 90 } }] },
  ]
  await writeSets([
    ...sets,
    ...demo.map((d, n) => ({
      id: `__demo_cs${n + 1}`, name: d.name, game: game ?? null,
      stats: d.stats, groups: [{ type: 'and', filters: d.stats }], itemType: d.itemType,
      order: maxOrder + 1 + n, createdAt: now, __demo: true,
    })),
  ])
}

export async function clearDemoSets() {
  const sets = await readSets()
  if (sets.some((s) => s.__demo)) await writeSets(sets.filter((s) => !s.__demo))
}

// URL 안전성(거래소 도메인만 허용)의 정본은 lib/tradeSearch.js — 그쪽이 이관용 URL 조립에도 쓰기 때문에
// 순환 import를 피하려고 정의를 옮겼다. 기존 import 경로(store)를 유지하기 위해 재수출한다.
export { isAllowedTradeUrl }

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
    folderId: rec.folderId ?? null, order: minBookmarkOrder(all) - 1,
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
  r.query = source.query // 리그 이관용 raw 검색 조건도 새 검색 것으로 교체
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

/**
 * 여러 북마크를 한 폴더로 한 번에 옮긴다(대상 폴더 맨 뒤에 붙이되 서로의 상대 순서는 유지).
 * 하나씩 moveBookmark를 부르면 매번 저장소 읽기·쓰기가 반복되고 중간 상태가 노출되므로 한 번에 쓴다.
 * @param {string[]} ids @param {string|null} folderId
 * @returns {Promise<number>} 실제로 옮긴 개수
 */
export async function moveBookmarks(ids, folderId) {
  const wanted = new Set(Array.isArray(ids) ? ids : [])
  if (!wanted.size) return 0
  const all = await readAll()
  const target = folderId ?? null
  let order = all.reduce((m, r) => (r.kind === 'bookmark' && (r.folderId ?? null) === target ? Math.max(m, r.order ?? 0) : m), 0)
  // 화면에 보이던 순서(order 오름차순) 그대로 뒤에 붙인다
  const moving = all
    .filter((r) => r.kind === 'bookmark' && wanted.has(r.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  if (!moving.length) return 0
  const now = Date.now()
  for (const r of moving) { r.folderId = target; r.order = ++order; r.updatedAt = now }
  await writeAll(all)
  return moving.length
}

/**
 * 저장된 검색을 열어 결과가 실제 로드되면 호출 — 해당 URL 북마크의 lastUsedAt 갱신(만료 경고 해제),
 * 스냅샷·아이콘 갱신. fields가 오면 검색 조건을 최신 파서 형식으로 재기록한다
 * (구 북마크에 능력치 수치 등 반영 = 하위호환 업그레이드). 표시명(name)·폴더·순서·id·생성시각은 보존.
 */
export async function markUsedByUrl(url, snapshot, icon, fields) {
  const all = await readAll()
  const now = Date.now()
  let changed = false
  for (const r of all) {
    if (r.kind === 'bookmark' && r.url === url) {
      r.lastUsedAt = now
      if (snapshot) { r.snapshot = snapshot; r.snapshotAt = now } // 북마크를 열어 결과가 뜨면 가격 스냅샷 자동 갱신
      if (icon) r.icon = icon // 결과 대표 이미지도 최신 최빈으로 갱신
      if (fields) { // 검색 조건 재기록(구 북마크 업그레이드) — name·folderId·order·id·createdAt는 건드리지 않음
        r.title = fields.title
        r.itemType = fields.itemType
        r.stats = fields.stats
        r.statGroups = fields.statGroups
        r.otherFilters = fields.otherFilters
        r.priceFilter = fields.priceFilter
        if (fields.dedupeKey) r.dedupeKey = fields.dedupeKey
        if (fields.query) r.query = fields.query // 리그 이관용 raw 조건 — 구 북마크 업그레이드
      }
      changed = true
    }
  }
  if (changed) await writeAll(all)
}

/**
 * 같은 조건(dedupeKey)의 북마크 중 raw 검색 조건(query)이 없는 것에 채운다.
 * query는 나중에 도입돼서 그 전에 저장한 북마크엔 없다 → 사용자가 그 조건으로 다시 검색하는 순간
 * 자동으로 채워 넣어 리그 이관이 가능해진다(있는 값은 덮지 않는다).
 * @returns {Promise<number>} 채운 개수
 */
export async function backfillQuery(dedupeKey, game, query) {
  if (!dedupeKey || !query) return 0
  const all = await readAll()
  let filled = 0
  for (const r of all) {
    if (r.kind === 'bookmark' && r.dedupeKey === dedupeKey && (!game || r.game === game) && !r.query) { r.query = query; filled++ }
  }
  if (filled) await writeAll(all)
  return filled
}

/**
 * 리그 이관 성공 반영 — 북마크의 링크·리그를 새로 만든 검색으로 교체한다.
 * 이름·폴더·순서·메모·id·생성시각·조건(query)은 그대로 두어 "같은 북마크가 되살아난" 것으로 보이게 한다.
 * 방금 사용했으므로 lastUsedAt도 갱신(= 오래됨 경고 해제).
 * @returns {Promise<boolean>} 대상 북마크를 찾아 갱신했으면 true
 */
export async function migrateBookmarkLeague(id, url, league) {
  const all = await readAll()
  const r = all.find((x) => x.id === id && x.kind === 'bookmark')
  if (!r) return false
  const now = Date.now()
  r.url = url
  r.league = league
  r.updatedAt = now
  r.lastUsedAt = now
  await writeAll(all)
  return true
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

// ── 조건 묶음 (game 스코프) ──
// 자주 쓰는 조건 뭉치. 칩 하나로 현재 검색에 얹는다(lib/conditionSet.js 참조).
// 게임별로 스탯 id 체계가 달라 poe1/poe2를 섞으면 검색이 깨지므로 스코프를 엄격히 지킨다.

/** 이 게임의 조건 묶음 — 등록 순(order) */
export async function listConditionSets(game) {
  return (await readSets())
    .filter((s) => s && (!game || s.game === game))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/**
 * 조건 묶음 등록. set은 extractConditionSet 결과({stats, itemType}).
 * @returns {Promise<object|null>} 담을 조건이 없으면 null
 */
export async function addConditionSet(name, game, set) {
  const stats = Array.isArray(set && set.stats) ? set.stats.filter((s) => s && s.id) : []
  const itemType = (set && set.itemType) || null
  if (!stats.length && !itemType) return null
  const sets = await readSets()
  const maxOrder = sets.reduce((m, s) => Math.max(m, s.order ?? 0), 0)
  // groups(능력치 그룹 구조)는 검색 의미 그 자체라 반드시 함께 보관한다 —
  // 평탄 stats만 남기면 '숫자 N' 그룹이 and 로 합쳐져 훨씬 좁은 검색이 된다(lib/conditionSet.js 참조).
  const groups = Array.isArray(set && set.groups) ? set.groups : []
  const record = {
    id: uid('cs_'), name: name || itemType || '새 묶음', game: game ?? null,
    stats, groups, itemType, order: maxOrder + 1, createdAt: Date.now(),
  }
  sets.push(record)
  await writeSets(sets)
  return record
}

/** @returns {Promise<object|null>} 삭제한 레코드 — 실행취소로 되살릴 때 그대로 넘긴다 */
export async function removeConditionSet(id) {
  const sets = await readSets()
  const removed = sets.find((s) => s.id === id) || null
  if (removed) await writeSets(sets.filter((s) => s.id !== id))
  return removed
}

/** 삭제 실행취소 — order까지 그대로 되살려 원래 자리로 돌아오게 한다. 이미 있으면 무시. */
export async function restoreConditionSet(record) {
  if (!record || !record.id) return
  const sets = await readSets()
  if (sets.some((s) => s.id === record.id)) return
  sets.push(record)
  await writeSets(sets)
}

export async function renameConditionSet(id, name) {
  const sets = await readSets()
  const s = sets.find((x) => x.id === id)
  if (s && name) { s.name = name; await writeSets(sets) }
}

/**
 * 칩 순서 이동 — 같은 game 스코프의 인접 묶음과 order를 스왑. dir<0 앞으로, dir>0 뒤로.
 * ⚠ moveFolder와 달리 배열 인덱스가 아니라 **정렬된 순서**에서 이웃을 찾는다 —
 * 폴더는 배열 순서 그대로 표시하지만 묶음은 order로 정렬해 표시하므로, 인덱스로 찾으면
 * 한 번 스왑한 뒤부터 화면 순서와 배열 순서가 어긋나 이동이 먹지 않는다.
 */
export async function moveConditionSet(id, dir) {
  const sets = await readSets()
  const cur = sets.find((s) => s.id === id)
  if (!cur) return
  const scope = cur.game ?? null
  const scoped = sets.filter((s) => (s.game ?? null) === scope).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const target = scoped[scoped.findIndex((s) => s.id === id) + (dir < 0 ? -1 : 1)]
  if (!target) return
  const t = target.order ?? 0
  target.order = cur.order ?? 0
  cur.order = t
  await writeSets(sets)
}

/**
 * 칩 순서 재배치(드래그) — beforeId 칩의 **앞**에 끼워 넣는다. beforeId가 null이면 맨 뒤로.
 * 인접 스왑(moveConditionSet)과 달리 원거리 이동을 한 번에 하므로 앞뒤 order 사이의
 * 중간값을 새 order로 쓴다(북마크 재정렬과 같은 방식 — 다른 칩의 order는 건드리지 않는다).
 */
export async function moveConditionSetBefore(id, beforeId) {
  if (!id || id === beforeId) return
  const sets = await readSets()
  const cur = sets.find((s) => s.id === id)
  if (!cur) return
  const scope = cur.game ?? null
  const rest = sets
    .filter((s) => (s.game ?? null) === scope && s.id !== id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const at = beforeId ? rest.findIndex((s) => s.id === beforeId) : rest.length
  if (at < 0) return // 다른 게임 스코프의 칩 위에 놓은 경우 — 섞이면 검색이 깨진다
  const prev = rest[at - 1]
  const next = rest[at]
  if (prev && next) cur.order = ((prev.order ?? 0) + (next.order ?? 0)) / 2
  else if (next) cur.order = (next.order ?? 0) - 1
  else if (prev) cur.order = (prev.order ?? 0) + 1
  else cur.order = 0
  await writeSets(sets)
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
    if (rest.query) { // 남이 만든 raw 검색 조건 — 거래소 API로 그대로 보내므로 형태·크기를 검증(불합격이면 조건만 버림)
      const s = sanitizeQuery(rest.query)
      if (s.ok) rest.query = s.query
      else delete rest.query
    }
    await addBookmark({ ...rest, game, folderId }, b.name || b.title)
    added++
  }
  return { added, skipped, foldersAdded, blocked }
}

// ── 찜한 매물(watchlist) ─────────────────────────────────────
// 검색 조건 북마크(records)와 달리 **개별 매물**을 저장한다. 생명주기가 완전히 달라 별도 키를 쓴다
// (conditionSets·folders와 같은 근거) — 매물은 팔리면 사라지고, 북마크는 안 사라진다.
//
// 설계 판단 2건:
//  1) origin을 키의 일부로 쓴다. 카카오와 글로벌은 **매물 id 공간이 다르다** — 합치면 한쪽에서 조회했을 때
//     멀쩡한 매물이 null로 와서 "판매됨"으로 조용히 오판한다.
//  2) 상태 갱신은 사용자가 트리거할 때만 한다(자동 폴링 없음). 거래소 fetch API에 rate limit이 있고,
//     장기 보관 용도라 목록을 여는 순간이 곧 확인 시점이라 자동화 이득이 작다.
export const WATCH_CAP = 100 // 상한 — 일괄 재조회가 rate limit을 때리지 않도록 묶어 둔다(10개씩 배치 → 최대 10요청)

async function readWatch() { return (await chrome.storage.local.get(WATCH_KEY))[WATCH_KEY] ?? [] }
async function writeWatch(list) { await chrome.storage.local.set({ [WATCH_KEY]: list }) }

const watchKeyOf = (listingId, origin) => `${origin}|${listingId}`

export async function listWatched(game) {
  const all = await readWatch()
  return all.filter((w) => !game || w.game === game).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
}

export async function isWatched(listingId, origin) {
  const all = await readWatch()
  return all.some((w) => watchKeyOf(w.listingId, w.origin) === watchKeyOf(listingId, origin))
}

// 실패를 조용히 삼키지 않는다 — 상한 초과·중복은 사유를 돌려줘 UI가 알릴 수 있게 한다.
export async function addWatch(rec) {
  const all = await readWatch()
  if (all.some((w) => watchKeyOf(w.listingId, w.origin) === watchKeyOf(rec.listingId, rec.origin))) {
    return { ok: false, reason: 'dup' }
  }
  if (all.length >= WATCH_CAP) return { ok: false, reason: 'cap' }
  // 방금 화면에서 본 매물이므로 alive로 시작한다. checkedAt은 일부러 비워 둔다 — '아직 확인한 적 없음'이 드러나야 한다.
  const saved = { ...rec, id: uid('w_'), savedAt: Date.now(), status: 'alive' }
  all.push(saved)
  await writeWatch(all)
  return { ok: true, rec: saved }
}

export async function removeWatch(id) {
  const all = await readWatch()
  await writeWatch(all.filter((w) => w.id !== id))
}

/**
 * 재조회 결과 반영. results = [{ id, alive, price? }] — **확인한 항목만** 넘긴다.
 * 목록에 있어도 results에 없으면 건드리지 않는다(다른 거래소 매물은 여기서 확인할 수 없으므로,
 * 확인 못 한 것을 'sold'로 떨어뜨리면 거짓말이 된다).
 * 찜한 시점 가격(price)은 보존하고 현재가는 lastPrice에 따로 담는다 — 변동을 보여주려면 둘 다 필요하다.
 */
export async function applyWatchStatus(results, now = Date.now()) {
  const byId = new Map((results || []).map((r) => [r.id, r]))
  const all = await readWatch()
  await writeWatch(all.map((w) => {
    const r = byId.get(w.id)
    if (!r) return w
    return { ...w, status: r.alive ? 'alive' : 'sold', checkedAt: now, ...(r.price ? { lastPrice: r.price } : {}) }
  }))
}
