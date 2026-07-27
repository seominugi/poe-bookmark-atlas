// test/store.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  addHistory, listByKind, promoteToBookmark, rename, remove, HISTORY_CAP,
  addBookmark, overwriteBookmark, moveBookmark,
  listFolders, addFolder, renameFolder, deleteFolder, markUsedByUrl, removeStaleBookmarks, findBookmark,
  exportBookmarksJSON, importBookmarksJSON, moveFolder, setFolderColor, FOLDER_PALETTE,
  backfillQuery, migrateBookmarkLeague, needsTourDemo, seedDemoData, clearDemoData,
  needsConditionSetDemo, seedDemoSets, clearDemoSets,
  listConditionSets, addConditionSet, removeConditionSet, renameConditionSet, moveConditionSet, moveBookmarks,
} from '../src/store/store.js'

beforeEach(() => globalThis.__resetChromeMock())

const rec = (over = {}) => ({ game: 'poe2', league: 'Standard', url: 'https://poe.kakaogames.com/trade2/search/poe2/u', title: 't', stats: [], dedupeKey: 'k1', ...over })

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
    expect(b.order).toBeLessThan(a.order)
    expect((await listByKind('bookmark')).map((x) => x.name)).toEqual(['B', 'A'])
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

  it('폴더 색상: 자동 팔레트 배정 + setFolderColor 변경', async () => {
    const a = await addFolder('A', 'poe2')
    const b = await addFolder('B', 'poe2')
    expect(a.color).toBe(FOLDER_PALETTE[0])
    expect(b.color).toBe(FOLDER_PALETTE[1])
    await setFolderColor(a.id, '#ffffff')
    expect((await listFolders('poe2')).find((f) => f.id === a.id).color).toBe('#ffffff')
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
        { dedupeKey: 'dup', name: '중복', title: 't', folderId: 'oldF', url: 'https://poe.kakaogames.com/trade2/search/poe2/dup' }, // 건너뜀
        { dedupeKey: 'new1', name: '새북마크', title: 't', folderId: 'oldF', url: 'https://poe.kakaogames.com/trade2/search/poe2/new1' }, // 추가 + 폴더 매핑
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

// ── 가이드 투어 데모 필요 판정 ──
describe('needsTourDemo', () => {
  const bm = (over) => ({ ...rec(), snapshot: { valueDiv: 1, unit: 'divine' }, ...over })

  it('북마크·폴더·가격이 모두 갖춰졌을 때만 데모가 필요 없다', async () => {
    await addFolder('내 폴더', 'poe2')
    await addBookmark(bm(), 'A')
    expect(await needsTourDemo('poe2')).toBe(false)
  })
  it('히스토리만 있고 북마크가 없으면 데모가 필요하다(제보된 5·6·8스텝 공백)', async () => {
    for (let i = 0; i < 8; i++) await addHistory(rec({ dedupeKey: 'h' + i }))
    expect(await needsTourDemo('poe2')).toBe(true)
  })
  it('북마크는 있지만 실폴더가 없으면 데모가 필요하다(폴더 색상 스텝)', async () => {
    await addBookmark(bm(), 'A') // 미분류는 가상 그룹이라 .ba-folder-ic[data-id]가 없다
    expect(await needsTourDemo('poe2')).toBe(true)
  })
  it('가격 스냅샷이 있는 북마크가 하나도 없으면 데모가 필요하다(시세 스텝)', async () => {
    await addFolder('내 폴더', 'poe2')
    await addBookmark(bm({ snapshot: undefined }), 'A')
    expect(await needsTourDemo('poe2')).toBe(true)
  })
  it('다른 게임의 북마크는 세지 않는다', async () => {
    await addFolder('내 폴더', 'poe1')
    await addBookmark(bm({ game: 'poe1' }), 'A')
    expect(await needsTourDemo('poe2')).toBe(true)
  })
  it('데모 데이터 자체는 판정에서 제외한다(중복 주입 방지)', async () => {
    await seedDemoData('poe2', 'Standard')
    expect(await needsTourDemo('poe2')).toBe(true)
    await clearDemoData()
    expect((await listByKind('bookmark', 'poe2')).length).toBe(0) // 실제 저장소는 오염되지 않는다
  })
  it('데모 북마크는 raw query를 갖는다 — 없으면 조건 칩 스텝(.ba-cond--add)이 가리킬 대상이 없다', async () => {
    await seedDemoData('poe2', 'Standard')
    const bms = (await listByKind('bookmark', 'poe2')).filter((b) => b.__demo)
    expect(bms.length).toBeGreaterThan(0)
    expect(bms.some((b) => b.query && b.query.query && (b.query.query.stats || []).length)).toBe(true)
    await clearDemoData()
  })
})

// ── 가이드 투어 데모 조건 묶음 ──
// 묶음 줄(#ba-sets)은 묶음이 0개면 hidden이라, 신규 사용자가 투어를 돌리면 가리킬 대상이 없다.
// 북마크 데모와 판정 조건이 달라(북마크가 많아도 묶음은 0개일 수 있다) 별도로 둔다.
describe('조건 묶음 투어 데모', () => {
  it('묶음이 하나도 없으면 데모가 필요하다', async () => {
    expect(await needsConditionSetDemo('poe2')).toBe(true)
  })
  it('실제 묶음이 있으면 데모가 필요 없다', async () => {
    await addConditionSet('내 묶음', 'poe2', { stats: [{ id: 'explicit.stat_life' }], itemType: null })
    expect(await needsConditionSetDemo('poe2')).toBe(false)
  })
  it('다른 게임의 묶음은 세지 않는다', async () => {
    await addConditionSet('내 묶음', 'poe1', { stats: [{ id: 'explicit.stat_life' }], itemType: null })
    expect(await needsConditionSetDemo('poe2')).toBe(true)
  })
  it('데모 묶음은 조건이 담긴 채로 목록에 뜬다', async () => {
    await seedDemoSets('poe2')
    const sets = await listConditionSets('poe2')
    expect(sets.length).toBeGreaterThan(0)
    expect(sets.every((s) => s.__demo)).toBe(true)
    expect(sets[0].stats.length).toBeGreaterThan(0)
  })
  it('데모 묶음 자체는 판정에서 제외한다(중복 주입 방지)', async () => {
    await seedDemoSets('poe2')
    expect(await needsConditionSetDemo('poe2')).toBe(true)
  })
  it('투어가 끝나면 데모 묶음만 지우고 실제 묶음은 남긴다', async () => {
    const mine = await addConditionSet('내 묶음', 'poe2', { stats: [{ id: 'explicit.stat_life' }], itemType: null })
    await seedDemoSets('poe2')
    await clearDemoSets()
    const sets = await listConditionSets('poe2')
    expect(sets.map((s) => s.id)).toEqual([mine.id])
  })
})

// ── 북마크 일괄 폴더 이동 ──
describe('moveBookmarks (일괄 폴더 이동)', () => {
  it('여러 북마크를 한 번에 옮기고 옮긴 개수를 돌려준다', async () => {
    const f = await addFolder('무기', 'poe2')
    const a = await addBookmark(rec({ dedupeKey: 'k1' }), 'A')
    const b = await addBookmark(rec({ dedupeKey: 'k2' }), 'B')
    await addBookmark(rec({ dedupeKey: 'k3' }), 'C')
    expect(await moveBookmarks([a.id, b.id], f.id)).toBe(2)
    const all = await listByKind('bookmark', 'poe2')
    expect(all.filter((x) => x.folderId === f.id).map((x) => x.name).sort()).toEqual(['A', 'B'])
    expect(all.find((x) => x.name === 'C').folderId).toBeNull()
  })

  it('대상 폴더 맨 뒤에 붙이되 서로의 상대 순서는 유지한다', async () => {
    const f = await addFolder('무기', 'poe2')
    const first = await addBookmark(rec({ dedupeKey: 'k0' }), '먼저있던것')
    await moveBookmarks([first.id], f.id)
    const a = await addBookmark(rec({ dedupeKey: 'k1' }), 'A')
    const b = await addBookmark(rec({ dedupeKey: 'k2' }), 'B')
    // 목록상 B가 A보다 앞(새 북마크가 앞으로 저장됨) — 그 순서가 이동 후에도 유지돼야
    const before = (await listByKind('bookmark', 'poe2')).filter((x) => x.folderId === null).map((x) => x.name)
    await moveBookmarks([a.id, b.id], f.id)
    const after = (await listByKind('bookmark', 'poe2')).filter((x) => x.folderId === f.id).map((x) => x.name)
    expect(after[0]).toBe('먼저있던것')
    expect(after.slice(1)).toEqual(before)
  })

  it('미분류(null)로도 옮길 수 있다', async () => {
    const f = await addFolder('무기', 'poe2')
    const a = await addBookmark(rec(), 'A')
    await moveBookmarks([a.id], f.id)
    expect(await moveBookmarks([a.id], null)).toBe(1)
    expect((await listByKind('bookmark', 'poe2'))[0].folderId).toBeNull()
  })

  it('없는 id·히스토리는 무시하고 실제 옮긴 것만 센다', async () => {
    const f = await addFolder('무기', 'poe2')
    const a = await addBookmark(rec({ dedupeKey: 'k1' }), 'A')
    const h = await addHistory(rec({ dedupeKey: 'k9' }))
    expect(await moveBookmarks([a.id, h.id, '없는id'], f.id)).toBe(1)
    expect((await listByKind('history', 'poe2'))[0].folderId).toBeUndefined()
  })

  it('빈 목록이면 아무것도 하지 않는다', async () => {
    expect(await moveBookmarks([], 'f1')).toBe(0)
    expect(await moveBookmarks(null, 'f1')).toBe(0)
  })
})

// ── 조건 묶음 ──
describe('조건 묶음', () => {
  const set = (over = {}) => ({ stats: [{ id: 'explicit.stat_life', text: '최대 생명력 #', value: { min: 80 } }], itemType: '목걸이', ...over })

  it('등록·조회 — 등록 순으로 나온다', async () => {
    await addConditionSet('저항 목걸이', 'poe2', set())
    await addConditionSet('이속 장화', 'poe2', set({ itemType: '장화' }))
    expect((await listConditionSets('poe2')).map((s) => s.name)).toEqual(['저항 목걸이', '이속 장화'])
  })

  it('게임별로 분리된다 — 스탯 id 체계가 달라 섞이면 검색이 깨진다', async () => {
    await addConditionSet('P2', 'poe2', set())
    await addConditionSet('P1', 'poe1', set())
    expect((await listConditionSets('poe2')).map((s) => s.name)).toEqual(['P2'])
    expect((await listConditionSets('poe1')).map((s) => s.name)).toEqual(['P1'])
  })

  it('이름을 안 주면 유형을 이름으로 쓴다', async () => {
    const r = await addConditionSet('', 'poe2', set())
    expect(r.name).toBe('목걸이')
  })

  it('담을 조건이 하나도 없으면 등록하지 않는다', async () => {
    expect(await addConditionSet('빈것', 'poe2', { stats: [], itemType: null })).toBeNull()
    expect(await addConditionSet('빈것', 'poe2', null)).toBeNull()
    expect(await listConditionSets('poe2')).toHaveLength(0)
  })

  it('능력치 그룹 구조(groups)를 함께 보관한다 — 없으면 검색 의미가 바뀐다', async () => {
    const r = await addConditionSet('그룹묶음', 'poe2', {
      stats: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      groups: [{ type: 'count', value: { min: 1 }, filters: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }],
      itemType: null,
    })
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]).toMatchObject({ type: 'count', value: { min: 1 } })
    expect((await listConditionSets('poe2'))[0].groups[0].filters).toHaveLength(2)
  })

  it('groups 없는 입력도 저장된다(빈 배열 — 구 버전 호환)', async () => {
    const r = await addConditionSet('구묶음', 'poe2', { stats: [{ id: 'a', text: 'A' }], itemType: null })
    expect(r.groups).toEqual([])
  })

  it('id 없는 잘못된 조건은 걸러낸다', async () => {
    const r = await addConditionSet('일부불량', 'poe2', { stats: [{ text: 'x' }, { id: 'ok', text: 'ok' }], itemType: null })
    expect(r.stats).toEqual([{ id: 'ok', text: 'ok' }])
  })

  it('이름 변경·삭제', async () => {
    const r = await addConditionSet('원래', 'poe2', set())
    await renameConditionSet(r.id, '바뀜')
    expect((await listConditionSets('poe2'))[0].name).toBe('바뀜')
    await renameConditionSet(r.id, '') // 빈 이름은 무시
    expect((await listConditionSets('poe2'))[0].name).toBe('바뀜')
    await removeConditionSet(r.id)
    expect(await listConditionSets('poe2')).toHaveLength(0)
  })

  it('순서 이동 — 같은 게임 안에서만 스왑', async () => {
    const a = await addConditionSet('A', 'poe2', set())
    const b = await addConditionSet('B', 'poe2', set())
    await addConditionSet('X', 'poe1', set()) // 다른 게임 — 영향 없어야
    await moveConditionSet(b.id, -1)
    expect((await listConditionSets('poe2')).map((s) => s.name)).toEqual(['B', 'A'])
    await moveConditionSet(b.id, 1)
    expect((await listConditionSets('poe2')).map((s) => s.name)).toEqual(['A', 'B'])
    await moveConditionSet(a.id, -1) // 맨 앞에서 앞으로 → 변화 없음
    expect((await listConditionSets('poe2')).map((s) => s.name)).toEqual(['A', 'B'])
    expect((await listConditionSets('poe1')).map((s) => s.name)).toEqual(['X'])
  })

  it('북마크·히스토리(records)와 저장소가 분리돼 서로 영향 없다', async () => {
    await addConditionSet('묶음', 'poe2', set())
    await addBookmark(rec(), '북마크')
    expect(await listConditionSets('poe2')).toHaveLength(1)
    expect(await listByKind('bookmark', 'poe2')).toHaveLength(1)
  })
})

// ── 리그 이관(저장된 조건을 현재 리그로 다시 검색) ──
describe('리그 이관', () => {
  const Q = { query: { status: { option: 'online' } }, sort: { price: 'asc' } }

  it('backfillQuery: 같은 조건(dedupeKey)의 query 없는 북마크에만 채운다', async () => {
    const old = await addBookmark(rec({ dedupeKey: 'kA' }), '구 북마크') // query 없음
    const has = await addBookmark(rec({ dedupeKey: 'kA', query: { query: { keep: 1 } } }), '이미 있음')
    await addBookmark(rec({ dedupeKey: 'kB' }), '다른 조건')
    const n = await backfillQuery('kA', 'poe2', Q)
    expect(n).toBe(1)
    const all = await listByKind('bookmark', 'poe2')
    expect(all.find((b) => b.id === old.id).query).toEqual(Q)
    expect(all.find((b) => b.id === has.id).query).toEqual({ query: { keep: 1 } }) // 기존 값 보존
    expect(all.find((b) => b.name === '다른 조건').query).toBeUndefined()
  })

  it('backfillQuery: 다른 게임·빈 인자는 건드리지 않는다', async () => {
    await addBookmark(rec({ dedupeKey: 'kA', game: 'poe1' }), 'poe1')
    expect(await backfillQuery('kA', 'poe2', Q)).toBe(0)
    expect(await backfillQuery('', 'poe2', Q)).toBe(0)
    expect(await backfillQuery('kA', 'poe1', null)).toBe(0)
  })

  it('migrateBookmarkLeague: url·league만 교체하고 이름·폴더·메모·id는 보존', async () => {
    const f = await addFolder('반지', 'poe2')
    const b = await addBookmark(rec({ league: '지난리그', note: '내 메모', query: Q }), '내 북마크')
    await moveBookmark(b.id, { folderId: f.id, order: 7 })
    const url = 'https://poe.kakaogames.com/trade2/search/poe2/새리그/newhash'
    expect(await migrateBookmarkLeague(b.id, url, '새리그')).toBe(true)
    const after = (await listByKind('bookmark', 'poe2'))[0]
    expect(after.id).toBe(b.id)
    expect(after.url).toBe(url)
    expect(after.league).toBe('새리그')
    expect(after.name).toBe('내 북마크')
    expect(after.note).toBe('내 메모')
    expect(after.folderId).toBe(f.id)
    expect(after.order).toBe(7)
    expect(after.query).toEqual(Q) // 조건은 그대로 → 다음 리그에도 다시 이관 가능
    expect(after.lastUsedAt).toBeGreaterThan(0) // 방금 사용 → '오래됨' 경고 해제
  })

  it('migrateBookmarkLeague: 없는 id·히스토리는 false', async () => {
    const h = await addHistory(rec())
    expect(await migrateBookmarkLeague('없음', 'https://x', 'L')).toBe(false)
    expect(await migrateBookmarkLeague(h.id, 'https://x', 'L')).toBe(false)
  })

  it('overwriteBookmark·markUsedByUrl이 query를 승계한다', async () => {
    const b = await addBookmark(rec({ dedupeKey: 'k1' }), 'A')
    await overwriteBookmark(b.id, { ...rec({ dedupeKey: 'k2' }), query: Q })
    expect((await listByKind('bookmark'))[0].query).toEqual(Q)
    const Q2 = { query: { status: { option: 'any' } } }
    await markUsedByUrl(rec().url, undefined, undefined, { title: 't', stats: [], query: Q2 })
    expect((await listByKind('bookmark'))[0].query).toEqual(Q2)
  })

  it('importBookmarksJSON: 손상·과대 query는 버리고 북마크는 살린다', async () => {
    const data = {
      bookmarks: [
        { dedupeKey: 'i1', name: '정상', title: 't', url: 'https://poe.kakaogames.com/trade2/search/poe2/i1', query: Q },
        { dedupeKey: 'i2', name: '손상', title: 't', url: 'https://poe.kakaogames.com/trade2/search/poe2/i2', query: { evil: 1 } },
        { dedupeKey: 'i3', name: '과대', title: 't', url: 'https://poe.kakaogames.com/trade2/search/poe2/i3', query: { query: { n: 'x'.repeat(21000) } } },
      ],
    }
    const { added } = await importBookmarksJSON('poe2', data)
    expect(added).toBe(3)
    const list = await listByKind('bookmark', 'poe2')
    expect(list.find((b) => b.dedupeKey === 'i1').query).toEqual(Q)
    expect(list.find((b) => b.dedupeKey === 'i2').query).toBeUndefined()
    expect(list.find((b) => b.dedupeKey === 'i3').query).toBeUndefined()
  })
})
