// src/store/store.js
const KEY = 'records'
export const HISTORY_CAP = 50

function uid() { return 'r_' + Math.random().toString(36).slice(2) + Date.now().toString(36) }
async function readAll() { return (await chrome.storage.local.get(KEY))[KEY] ?? [] }
async function writeAll(records) { await chrome.storage.local.set({ [KEY]: records }) }

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

export async function listByKind(kind) {
  return (await readAll()).filter((r) => r.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function promoteToBookmark(id, name) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (!r) return
  r.kind = 'bookmark'; r.name = name ?? r.name ?? r.title; r.updatedAt = Date.now()
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
  const record = { ...rec, id: uid(), kind: 'bookmark', name: name ?? rec.title, createdAt: now, updatedAt: now }
  await writeAll([...all, record])
  return record
}

/** 스냅샷 갱신(수동 "가격 갱신") */
export async function updateSnapshot(id, snapshot) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (r) { r.snapshot = snapshot; r.updatedAt = Date.now(); await writeAll(all) }
}
