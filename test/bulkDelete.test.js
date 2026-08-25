// test/bulkDelete.test.js
// 일괄 삭제 · 교체 가져오기 — **되돌릴 수 없게 되는 경로**라 store 층에서 조인다.
//
// 배경(제보 2026-08-24): 집·직장 두 PC를 내보내기/가져오기로 손 동기화하는데 거듭할수록 지저분해진다.
// 원인은 가져오기가 **합치기 전용**이라는 것 — 같은 dedupeKey를 통째로 건너뛰어서 추가만 되고
// 삭제·이름변경·폴더이동이 전파되지 않는다. 그래서 '교체'가 필요했고, 폴더를 지울 때마다
// 북마크가 밀려 쌓이는 미분류에는 비울 방법 자체가 없었다.
//
// 여기서 지키려는 것은 두 가지다: ① 지우기로 한 것만 지운다 ② 지운 것은 정확히 되돌아온다.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  addBookmark, addHistory, addFolder, deleteFolder, listByKind, listFolders,
  clearFolderBookmarks, restoreRecords, snapshotScope, restoreScope,
  importBookmarksJSON, backupBookmarksJSON, exportBookmarksJSON,
} from '../src/store/store.js'

beforeEach(() => globalThis.__resetChromeMock())

const rec = (over = {}) => ({
  game: 'poe2', league: 'Standard', url: 'https://poe.kakaogames.com/trade2/search/poe2/u',
  title: 't', stats: [], dedupeKey: 'k1', ...over,
})
const names = (list) => list.map((b) => b.name).sort()

describe('폴더 비우기 (clearFolderBookmarks)', () => {
  it('미분류만 비우고 폴더 안의 북마크·폴더 자체·히스토리는 그대로 둔다', async () => {
    const f = await addFolder('세팅용', 'poe2')
    await addBookmark(rec({ dedupeKey: 'a' }), '미분류A')
    await addBookmark(rec({ dedupeKey: 'b' }), '미분류B')
    await addBookmark(rec({ dedupeKey: 'c', folderId: f.id }), '폴더것')
    await addHistory(rec({ dedupeKey: 'h' }))

    const removed = await clearFolderBookmarks('poe2', null)

    expect(names(removed)).toEqual(['미분류A', '미분류B'])
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['폴더것'])
    expect(await listFolders('poe2')).toHaveLength(1) // 폴더는 남는다 — 이게 삭제와 다른 점
    expect(await listByKind('history', 'poe2')).toHaveLength(1)
  })

  it('실폴더를 비워도 폴더는 남는다 — 비우기 → 삭제 2동작이 "폴더째"가 된다', async () => {
    const f = await addFolder('세팅용', 'poe2')
    await addBookmark(rec({ dedupeKey: 'c', folderId: f.id }), '폴더것')

    expect(await clearFolderBookmarks('poe2', f.id)).toHaveLength(1)
    expect(await listFolders('poe2')).toHaveLength(1)
    expect(await listByKind('bookmark', 'poe2')).toHaveLength(0)
  })

  it('다른 게임의 북마크는 건드리지 않는다', async () => {
    await addBookmark(rec({ game: 'poe1', dedupeKey: 'p1' }), 'POE1것')
    await addBookmark(rec({ dedupeKey: 'p2' }), 'POE2것')

    await clearFolderBookmarks('poe2', null)

    expect(names(await listByKind('bookmark', 'poe1'))).toEqual(['POE1것'])
    expect(await listByKind('bookmark', 'poe2')).toHaveLength(0)
  })

  it('빈 폴더를 비우면 아무것도 쓰지 않고 빈 배열', async () => {
    const f = await addFolder('빈폴더', 'poe2')
    expect(await clearFolderBookmarks('poe2', f.id)).toEqual([])
  })
})

describe('실행취소 (restoreRecords)', () => {
  it('id·폴더·순서를 보존해 원래 자리로 되살린다', async () => {
    const f = await addFolder('세팅용', 'poe2')
    const b = await addBookmark(rec({ dedupeKey: 'c', folderId: f.id }), '폴더것')

    const removed = await clearFolderBookmarks('poe2', f.id)
    expect(await restoreRecords(removed)).toBe(1)

    const back = await listByKind('bookmark', 'poe2')
    expect(back).toHaveLength(1)
    expect(back[0].id).toBe(b.id)
    expect(back[0].folderId).toBe(f.id)
    expect(back[0].order).toBe(b.order)
  })

  it('두 번 되돌려도 복제되지 않는다 (토스트 버튼 연타)', async () => {
    await addBookmark(rec({ dedupeKey: 'a' }), 'A')
    const removed = await clearFolderBookmarks('poe2', null)

    expect(await restoreRecords(removed)).toBe(1)
    expect(await restoreRecords(removed)).toBe(0)
    expect(await listByKind('bookmark', 'poe2')).toHaveLength(1)
  })

  // 이 케이스를 놓치면 북마크가 **화면에서 통째로 사라진다** — renderList는 미분류 + 현존 폴더만
  // 순회하므로, 없는 폴더를 가리키는 레코드는 어느 그룹에도 안 그려진다(저장소에는 남아 있는데).
  it('되살릴 폴더가 그새 사라졌으면 미분류로 내린다', async () => {
    const f = await addFolder('세팅용', 'poe2')
    await addBookmark(rec({ dedupeKey: 'c', folderId: f.id }), '폴더것')

    const removed = await clearFolderBookmarks('poe2', f.id)
    await deleteFolder(f.id) // 비운 뒤 폴더까지 삭제
    await restoreRecords(removed)

    const back = await listByKind('bookmark', 'poe2')
    expect(back).toHaveLength(1)
    expect(back[0].folderId).toBeNull()
  })
})

describe('교체 가져오기 (importBookmarksJSON replace)', () => {
  const file = (bookmarks, folders = [], over = {}) => ({
    app: 'poe-bookmark-atlas', version: 1, game: 'poe2', folders, bookmarks, ...over,
  })

  it('합치기는 기존을 남기고, 교체는 기존을 지우고 파일 내용으로 채운다', async () => {
    await addBookmark(rec({ dedupeKey: 'old' }), '기존것')

    const merged = await importBookmarksJSON('poe2', file([rec({ dedupeKey: 'new', name: '새것' })]))
    expect(merged.added).toBe(1)
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['기존것', '새것'])

    const replaced = await importBookmarksJSON('poe2', file([rec({ dedupeKey: 'only', name: '유일' })]), { replace: true })
    expect(replaced.added).toBe(1)
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['유일'])
  })

  it('교체는 히스토리·다른 게임 북마크를 건드리지 않는다', async () => {
    await addHistory(rec({ dedupeKey: 'h' }))
    await addBookmark(rec({ game: 'poe1', dedupeKey: 'p1' }), 'POE1것')
    await addBookmark(rec({ dedupeKey: 'p2' }), 'POE2것')

    await importBookmarksJSON('poe2', file([rec({ dedupeKey: 'only', name: '유일' })]), { replace: true })

    expect(await listByKind('history', 'poe2')).toHaveLength(1)
    expect(names(await listByKind('bookmark', 'poe1'))).toEqual(['POE1것'])
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['유일'])
  })

  it('교체는 이 게임 폴더만 지운다 — 게임 표시가 없는 레거시 폴더는 살려 둔다', async () => {
    const legacy = await addFolder('옛폴더', null) // 두 게임 모두에 보이는 폴더
    await addFolder('POE2폴더', 'poe2')

    await importBookmarksJSON('poe2', file([], []), { replace: true })

    const left = await listFolders('poe2')
    expect(left.map((f) => f.id)).toEqual([legacy.id])
  })

  it('교체 실행취소는 지운 것을 되살리고 가져온 것을 걷어낸다', async () => {
    const f = await addFolder('세팅용', 'poe2')
    const b = await addBookmark(rec({ dedupeKey: 'old', folderId: f.id }), '기존것')

    const { snapshot } = await importBookmarksJSON('poe2', file([rec({ dedupeKey: 'new', name: '새것' })]), { replace: true })
    expect(names(await listByKind('bookmark', 'poe2'))).toEqual(['새것'])

    expect(await restoreScope(snapshot)).toBe(true)
    const back = await listByKind('bookmark', 'poe2')
    expect(names(back)).toEqual(['기존것'])
    expect(back[0].id).toBe(b.id)          // 같은 레코드가 그대로 돌아온다
    expect(back[0].folderId).toBe(f.id)
    expect((await listFolders('poe2')).map((x) => x.name)).toEqual(['세팅용'])
  })

  it('합치기에는 스냅샷이 없다 — 되돌릴 파괴가 없으니 만들지 않는다', async () => {
    const { snapshot } = await importBookmarksJSON('poe2', file([rec({ dedupeKey: 'new', name: '새것' })]))
    expect(snapshot).toBeNull()
  })

  it('교체로 채운 내용은 다시 내보내 되가져올 수 있다 (왕복)', async () => {
    const src = await snapshotScope('poe2')
    expect(src.records).toHaveLength(0)

    await importBookmarksJSON('poe2', file(
      [rec({ dedupeKey: 'x', name: '가', folderId: 'imported-f1' })],
      [{ id: 'imported-f1', name: '가져온폴더' }],
    ), { replace: true })

    const got = await listByKind('bookmark', 'poe2')
    const folders = await listFolders('poe2')
    expect(got).toHaveLength(1)
    expect(folders.map((f) => f.name)).toEqual(['가져온폴더'])
    expect(got[0].folderId).toBe(folders[0].id) // 파일 안의 폴더 id가 현재 id로 매핑됐다
  })
})

describe('교체 직전 자동 백업 (backupBookmarksJSON)', () => {
  // 내보내기는 허용 도메인 외 URL을 뺀다(피싱 전파 차단). 백업은 지워지기 전 마지막 사본이라
  // 그것까지 담아야 한다 — 교체가 끝나면 원본이 어디에도 남지 않는다.
  it('안전하지 않은 링크까지 담는다 — 내보내기와 다른 지점', async () => {
    await addBookmark(rec({ dedupeKey: 'ok' }), '정상')
    await addBookmark(rec({ dedupeKey: 'bad', url: 'https://evil.example.com/trade2/search/poe2/x' }), '수상한것')

    const exported = await exportBookmarksJSON('poe2')
    const backup = await backupBookmarksJSON('poe2')

    expect(exported.unsafeExcluded).toBe(1)
    expect(names(exported.json.bookmarks)).toEqual(['정상'])
    expect(names(backup.json.bookmarks)).toEqual(['수상한것', '정상'])
    expect(backup.count).toBe(2)
  })

  // 오래 안 쓴 북마크는 이제 내보내기·백업 **둘 다** 담는다 — 지우는 건 '오래된 정리'뿐이다.
  it('오래된 북마크는 내보내기·백업 모두 담는다', async () => {
    const old = Date.now() - 30 * 24 * 60 * 60 * 1000
    await addBookmark(rec({ dedupeKey: 'fresh' }), '최근것')
    await addBookmark(rec({ dedupeKey: 'stale', lastUsedAt: old, createdAt: old, updatedAt: old }), '오래된것')

    const exported = await exportBookmarksJSON('poe2')
    const backup = await backupBookmarksJSON('poe2')

    expect(names(exported.json.bookmarks)).toEqual(['오래된것', '최근것'])
    expect(names(backup.json.bookmarks)).toEqual(['오래된것', '최근것'])
  })

  it('백업 파일은 그대로 가져오기로 되살릴 수 있다', async () => {
    const f = await addFolder('세팅용', 'poe2')
    await addBookmark(rec({ dedupeKey: 'a', folderId: f.id }), '가')
    const backup = await backupBookmarksJSON('poe2')

    await importBookmarksJSON('poe2', { bookmarks: [], folders: [] }, { replace: true }) // 전부 날린 상황
    expect(await listByKind('bookmark', 'poe2')).toHaveLength(0)

    await importBookmarksJSON('poe2', backup.json, { replace: true })
    const back = await listByKind('bookmark', 'poe2')
    expect(names(back)).toEqual(['가'])
    expect(back[0].folderId).toBe((await listFolders('poe2'))[0].id)
  })
})
