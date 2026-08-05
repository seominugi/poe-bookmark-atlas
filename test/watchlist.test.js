// test/watchlist.test.js
// 찜한 매물(watchlist) — 검색 조건 북마크와 달리 **개별 매물**을 저장한다.
// 매물은 팔리면 사라지므로 저장 자체보다 '아직 있나'를 답하는 게 기능의 값어치다.
import { describe, it, expect, beforeEach } from 'vitest'
import { listWatched, addWatch, removeWatch, isWatched, applyWatchStatus, WATCH_CAP } from '../src/store/store.js'

beforeEach(() => globalThis.__resetChromeMock())

const KAKAO = 'poe.kakaogames.com'
const GLOBAL = 'www.pathofexile.com'
const w = (over = {}) => ({
  listingId: 'L1', origin: KAKAO, game: 'poe2', league: 'Standard',
  name: '고상한 오만', baseType: '무궁한 주얼', seller: 'seller#1234',
  price: { amount: 10, currency: 'divine' },
  sourceUrl: 'https://poe.kakaogames.com/trade2/search/poe2/Standard/abc',
  ...over,
})

describe('watchlist — 저장·중복·스코프', () => {
  it('찜하면 목록에 나온다', async () => {
    const r = await addWatch(w())
    expect(r.ok).toBe(true)
    const list = await listWatched('poe2')
    expect(list).toHaveLength(1)
    expect(list[0].listingId).toBe('L1')
    expect(list[0].status).toBe('alive') // 방금 화면에서 본 매물이므로 살아있음으로 시작
  })

  it('같은 매물(listingId+origin)은 중복 저장하지 않는다', async () => {
    await addWatch(w())
    const dup = await addWatch(w())
    expect(dup.ok).toBe(false)
    expect(dup.reason).toBe('dup')
    expect(await listWatched('poe2')).toHaveLength(1)
  })

  it('listingId가 같아도 origin이 다르면 별개로 저장한다', async () => {
    // 카카오와 글로벌은 매물 id 공간이 다르다. 합치면 멀쩡한 매물을 "판매됨"으로 오판한다.
    await addWatch(w({ origin: KAKAO }))
    const other = await addWatch(w({ origin: GLOBAL }))
    expect(other.ok).toBe(true)
    expect(await listWatched('poe2')).toHaveLength(2)
  })

  it('game 스코프가 분리된다', async () => {
    await addWatch(w({ game: 'poe2' }))
    await addWatch(w({ listingId: 'L2', game: 'poe1' }))
    expect(await listWatched('poe2')).toHaveLength(1)
    expect(await listWatched('poe1')).toHaveLength(1)
  })

  it('isWatched는 listingId+origin 쌍으로 판정한다', async () => {
    await addWatch(w())
    expect(await isWatched('L1', KAKAO)).toBe(true)
    expect(await isWatched('L1', GLOBAL)).toBe(false)
    expect(await isWatched('L9', KAKAO)).toBe(false)
  })

  it('해제하면 목록에서 빠진다', async () => {
    const r = await addWatch(w())
    await removeWatch(r.rec.id)
    expect(await listWatched('poe2')).toHaveLength(0)
  })

  it('상한을 넘으면 조용히 버리지 않고 거부하고 사유를 준다', async () => {
    for (let i = 0; i < WATCH_CAP; i++) await addWatch(w({ listingId: 'L' + i }))
    const over = await addWatch(w({ listingId: 'over' }))
    expect(over.ok).toBe(false)
    expect(over.reason).toBe('cap')
    expect(await listWatched('poe2')).toHaveLength(WATCH_CAP)
  })
})

describe('watchlist — 상태 갱신', () => {
  it('살아있으면 현재가를 갱신하고 alive로 둔다', async () => {
    const r = await addWatch(w())
    await applyWatchStatus([{ id: r.rec.id, alive: true, price: { amount: 12, currency: 'divine' } }], 1000)
    const [rec] = await listWatched('poe2')
    expect(rec.status).toBe('alive')
    expect(rec.lastPrice).toEqual({ amount: 12, currency: 'divine' })
    expect(rec.checkedAt).toBe(1000)
    expect(rec.price).toEqual({ amount: 10, currency: 'divine' }) // 찜한 시점 가격은 보존 — 변동 비교용
  })

  it('사라졌으면 sold로 표시하되 레코드는 지우지 않는다', async () => {
    const r = await addWatch(w())
    await applyWatchStatus([{ id: r.rec.id, alive: false }], 2000)
    const [rec] = await listWatched('poe2')
    expect(rec.status).toBe('sold')
    expect(rec.name).toBe('고상한 오만') // 뭘 찜했는지는 남아야 재검색으로 이어진다
    expect(rec.sourceUrl).toBeTruthy()
  })

  it('확인 대상이 아니었던 항목은 건드리지 않는다', async () => {
    const a = await addWatch(w({ listingId: 'L1' }))
    await addWatch(w({ listingId: 'L2', origin: GLOBAL }))
    await applyWatchStatus([{ id: a.rec.id, alive: false }], 3000)
    const list = await listWatched('poe2')
    const untouched = list.find((x) => x.listingId === 'L2')
    expect(untouched.status).toBe('alive')
    expect(untouched.checkedAt).toBeUndefined() // 확인한 적 없음이 드러나야 한다
  })
})
