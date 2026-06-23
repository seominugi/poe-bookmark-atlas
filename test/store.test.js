// test/store.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  addHistory, listByKind, promoteToBookmark, rename, remove, HISTORY_CAP,
  addBookmark, overwriteBookmark, moveBookmark,
  listFolders, addFolder, renameFolder, deleteFolder, markUsedByUrl, removeStaleBookmarks, findBookmark,
  exportBookmarksJSON, importBookmarksJSON, moveFolder,
} from '../src/store/store.js'

beforeEach(() => globalThis.__resetChromeMock())

const rec = (over = {}) => ({ game: 'poe2', league: 'Standard', url: 'u', title: 't', stats: [], dedupeKey: 'k1', ...over })

describe('store', () => {
  it('히스토리 추가/조회', async () => {
    await addHistory(rec())
    const h = await listByKind('history')
    expect(h).toHaveLength(1)
    expect(h[0].kind).toBe('history')
    expect(h[0].id).toBeTruthy()
  })
  it('동일 dedupeKey는 갱신(중복 제거)', async () => {
    await addHistory(rec({ title: 'A' }))
    await addHistory(rec({ title: 'B' }))
    const h = await listByKind('history')
    expect(h).toHaveLength(1)
    expect(h[0].title).toBe('B')
  })
  it(`히스토리는 ${HISTORY_CAP}개 상한`, async () => {
    for (let i = 0; i < HISTORY_CAP + 5; i++) await addHistory(rec({ dedupeKey: 'k' + i }))
    expect(await listByKind('history')).toHaveLength(HISTORY_CAP)
  })
  it('승격: history→bookmark, 이름 지정', async () => {
    const r = await addHistory(rec())
    await promoteToBookmark(r.id, '내 검색')
    expect(await listByKind('history')).toHaveLength(0)
    const b = await listByKind('bookmark')
    expect(b[0].kind).toBe('bookmark')
    expect(b[0].name).toBe('내 검색')
  })
  it('북마크는 캡 적용 안 함', async () => {
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      const r = await addHistory(rec({ dedupeKey: 'b' + i }))
      await promoteToBookmark(r.id, 'n' + i)
    }
    expect((await listByKind('bookmark')).length).toBe(HISTORY_CAP + 5)
  })
  it('이름변경/삭제', async () => {
    const r = await addHistory(rec())
    await promoteToBookmark(r.id, 'x')
    await rename(r.id, 'y')
    expect((await listByKind('bookmark'))[0].name).toBe('y')
    await remove(r.id)
    expect(await listByKind('bookmark')).toHaveLength(0)
  })
})

describe('store v1.1 (폴더·순서·덮어쓰기)', () => {
  it('addBookmark는 folderId(null)·order 부여, order 오름차순 정렬', async () => {
    const a = await addBookmark(rec({ title: 'A' }), 'A')
    const b = await addBookmark(rec({ title: 'B', dedupeKey: 'k2' }), 'B')
    expect(a.folderId).toBeNull()
    expect(b.order).toBeGreaterThan(a.order)
    expect((await listByKind('bookmark')).map((x) => x.name)).toEqual(['A', 'B'])
  })

  it('moveBookmark로 순서·폴더 변경', async () => {
    const a = await addBookmark(rec({ title: 'A' }), 'A')
    const b = await addBookmark(rec({ dedupeKey: 'k2' }), 'B')
    await moveBookmark(b.id, { order: a.order - 1 })
    expect((await listByKind('bookmark')).map((x) => x.name)).toEqual(['B', 'A'])
    await moveBookmark(a.id, { folderId: 'f1' })
    expect((await listByKind('bookmark')).find((x) => x.id === a.id).folderId).toBe('f1')
  })

  it('overwriteBookmark는 검색만 교체, name·folderId 유지', async () => {
    const a = await addBookmark(rec({ title: '원본', url: 'u1' }), '내 북마크')
    await moveBookmark(a.id, { folderId: 'fX' })
    await overwriteBookmark(a.id, {
      game: 'poe2', league: 'Standard', url: 'u2', title: '새검색', itemType: 'Amulet',
      stats: ['s'], priceFilter: null, snapshot: { valueDiv: 2 }, dedupeKey: 'k2',
    })
    const r = (await listByKind('bookmark'))[0]
    expect(r.url).toBe('u2')
    expect(r.title).toBe('새검색')
    expect(r.name).toBe('내 북마크')
    expect(r.folderId).toBe('fX')
    expect(r.snapshot.valueDiv).toBe(2)
  })

  it('폴더 CRUD', async () => {
    const f = await addFolder('갑옷')
    expect(await listFolders()).toHaveLength(1)
    expect(f.name).toBe('갑옷')
    await renameFolder(f.id, '무기')
    expect((await listFolders())[0].name).toBe('무기')
    await deleteFolder(f.id)
    expect(await listFolders()).toHaveLength(0)
  })

  it('moveFolder: 같은 game 스코프에서 위/아래 순서 스왑', async () => {
    const a = await addFolder('A', 'poe2')
    const b = await addFolder('B', 'poe2')
    const c = await addFolder('C', 'poe2')
    await addFolder('X', 'poe1') // 다른 게임 — 영향 없어야
    expect((await listFolders('poe2')).map((f) => f.name)).toEqual(['A', 'B', 'C'])
    await moveFolder(b.id, -1) // B 위로
    expect((await listFolders('poe2')).map((f) => f.name)).toEqual(['B', 'A', 'C'])
    await moveFolder(b.id, 1) // B 아래로 (원위치)
    expect((await listFolders('poe2')).map((f) => f.name)).toEqual(['A', 'B', 'C'])
    await moveFolder(a.id, -1) // 맨 위에서 위로 → 변화 없음
    expect((await listFolders('poe2')).map((f) => f.name)).toEqual(['A', 'B', 'C'])
    await moveFolder(c.id, 1) // 맨 아래에서 아래로 → 변화 없음
    expect((await listFolders('poe2')).map((f) => f.name)).toEqual(['A', 'B', 'C'])
    expect((await listFolders('poe1')).map((f) => f.name)).toEqual(['X'])
  })

  it('폴더 삭제 시 소속 북마크는 미분류(null)로', async () => {
    const f = await addFolder('갑옷')
    const a = await addBookmark(rec(), 'A')
    await moveBookmark(a.id, { folderId: f.id })
    await deleteFolder(f.id)
    expect((await listByKind('bookmark'))[0].folderId).toBeNull()
  })

  it('game 스코프: 북마크·폴더가 게임별로 분리', async () => {
    await addBookmark(rec({ game: 'poe2', title: 'P2' }), 'P2')
    await addBookmark(rec({ game: 'poe1', title: 'P1', dedupeKey: 'k2' }), 'P1')
    expect((await listByKind('bookmark', 'poe2')).map((x) => x.title)).toEqual(['P2'])
    expect((await listByKind('bookmark', 'poe1')).map((x) => x.title)).toEqual(['P1'])
    expect((await listByKind('bookmark')).length).toBe(2)
    await addFolder('갑옷', 'poe2')
    await addFolder('무기', 'poe1')
    expect((await listFolders('poe2')).map((f) => f.name)).toEqual(['갑옷'])
    expect((await listFolders('poe1')).map((f) => f.name)).toEqual(['무기'])
  })

  it('markUsedByUrl: 해당 URL 북마크의 lastUsedAt 갱신', async () => {
    await addBookmark(rec({ url: 'u-x' }), 'A')
    expect((await listByKind('bookmark'))[0].lastUsedAt).toBeUndefined()
    await markUsedByUrl('u-x')
    expect((await listByKind('bookmark'))[0].lastUsedAt).toBeTruthy()
  })

  it('findBookmark: 같은 dedupeKey·game 북마크 탐지(중복 방지)', async () => {
    await addBookmark(rec({ dedupeKey: 'dk1' }), 'A')
    expect(await findBookmark('dk1', 'poe2')).toBeTruthy()
    expect(await findBookmark('dk1', 'poe1')).toBeNull() // 다른 게임
    expect(await findBookmark('dk-none', 'poe2')).toBeNull()
    expect(await findBookmark('', 'poe2')).toBeNull()
  })

  it('removeStaleBookmarks: staleMs 이상 미사용 북마크만 game 스코프로 일괄 삭제', async () => {
    const STALE = 14 * 24 * 60 * 60 * 1000
    const day = 24 * 60 * 60 * 1000
    const old = await addBookmark(rec({ title: 'old' }), 'old')
    const fresh = await addBookmark(rec({ title: 'fresh', dedupeKey: 'k2' }), 'fresh')
    const other = await addBookmark(rec({ game: 'poe1', title: 'p1', dedupeKey: 'k3' }), 'p1')
    const now = 2_000_000_000_000
    // 저장된 레코드의 lastUsedAt을 직접 제어
    const { records } = await chrome.storage.local.get('records')
    records.find((r) => r.id === old.id).lastUsedAt = now - 20 * day // 20일 전 → stale
    records.find((r) => r.id === fresh.id).lastUsedAt = now - 1 * day // 1일 전 → 유지
    records.find((r) => r.id === other.id).lastUsedAt = now - 30 * day // 30일 전이지만 poe1 → 유지
    await chrome.storage.local.set({ records })

    const n = await removeStaleBookmarks('poe2', STALE, now)
    expect(n).toBe(1)
    expect((await listByKind('bookmark', 'poe2')).map((x) => x.title)).toEqual(['fresh'])
    expect((await listByKind('bookmark', 'poe1')).map((x) => x.title)).toEqual(['p1'])
  })
})

describe('store v1.2 (JSON 내보내기/가져오기)', () => {
  it('exportBookmarksJSON: 전체 내보내기 + stale(14일↑) 제외', async () => {
    const now = 2_000_000_000_000
    const day = 24 * 60 * 60 * 1000
    const fresh = await addBookmark(rec({ title: 'fresh' }), 'fresh')
    const old = await addBookmark(rec({ title: 'old', dedupeKey: 'k2' }), 'old')
    const { records } = await chrome.storage.local.get('records')
    records.find((r) => r.id === fresh.id).lastUsedAt = now - day
    records.find((r) => r.id === old.id).lastUsedAt = now - 20 * day
    await chrome.storage.local.set({ records })
    const { json, count, staleExcluded } = await exportBookmarksJSON('poe2', undefined, now)
    expect(count).toBe(1)
    expect(staleExcluded).toBe(1)
    expect(json.bookmarks.map((b) => b.title)).toEqual(['fresh'])
    expect(json.app).toBe('poe-bookmark-atlas')
  })

  it('exportBookmarksJSON: 폴더 스코프', async () => {
    const f = await addFolder('갑옷', 'poe2')
    const a = await addBookmark(rec({ title: 'A' }), 'A')
    await moveBookmark(a.id, { folderId: f.id })
    await addBookmark(rec({ title: 'B', dedupeKey: 'k2' }), 'B') // 미분류
    const { count, json } = await exportBookmarksJSON('poe2', f.id)
    expect(count).toBe(1)
    expect(json.bookmarks[0].title).toBe('A')
    expect(json.folders.map((x) => x.name)).toEqual(['갑옷'])
  })

  it('importBookmarksJSON: 중복(dedupeKey) 제외 + 없는 폴더 생성·id 매핑', async () => {
    await addBookmark(rec({ dedupeKey: 'dup' }), '이미있음')
    const data = {
      folders: [{ id: 'oldF', name: '신규폴더', game: 'poe2' }],
      bookmarks: [
        { dedupeKey: 'dup', name: '중복', title: 't', folderId: 'oldF' }, // 건너뜀
        { dedupeKey: 'new1', name: '새북마크', title: 't', folderId: 'oldF' }, // 추가 + 폴더 매핑
      ],
    }
    const { added, skipped, foldersAdded } = await importBookmarksJSON('poe2', data)
    expect(added).toBe(1)
    expect(skipped).toBe(1)
    expect(foldersAdded).toBe(1)
    const nf = (await listFolders('poe2')).find((f) => f.name === '신규폴더')
    expect(nf).toBeTruthy()
    const imported = (await listByKind('bookmark', 'poe2')).find((b) => b.dedupeKey === 'new1')
    expect(imported.folderId).toBe(nf.id) // 새 폴더 id로 remap
  })
})
