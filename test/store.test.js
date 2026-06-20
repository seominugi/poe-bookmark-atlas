// test/store.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { addHistory, listByKind, promoteToBookmark, rename, remove, HISTORY_CAP } from '../src/store/store.js'

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
