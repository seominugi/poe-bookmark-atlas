// test/store.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  addHistory, listByKind, promoteToBookmark, rename, remove, HISTORY_CAP,
  addBookmark, overwriteBookmark, moveBookmark,
  listFolders, addFolder, renameFolder, deleteFolder,
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

  it('폴더 삭제 시 소속 북마크는 미분류(null)로', async () => {
    const f = await addFolder('갑옷')
    const a = await addBookmark(rec(), 'A')
    await moveBookmark(a.id, { folderId: f.id })
    await deleteFolder(f.id)
    expect((await listByKind('bookmark'))[0].folderId).toBeNull()
  })
})
