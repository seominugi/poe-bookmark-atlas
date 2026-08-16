// 리그가 다르면 다른 검색이다 — 조건이 같아도 매물도 시세도 완전히 별개다.
// 제보(2026-08-16): .../Hardcore%20Allflame/G6GzlQW8Ub 과 .../Allflame/G6GzlQW8Ub 이
// 한 북마크로 뭉개졌다. 원인은 dedupeKey 가 `game|조건` 이라 리그를 담지 않은 것.
import { describe, it, expect, beforeEach } from 'vitest'
import { withLeagueKey, addBookmark, findBookmark, migrateBookmarkLeague, listByKind } from '../src/store/store.js'
import { findNearDuplicate, searchIdentity } from '../src/lib/searchParser.js'

beforeEach(() => globalThis.__resetChromeMock())

const QUERY = { query: { type: '반지', stats: [{ type: 'and', filters: [{ id: 'explicit.fire', value: { min: 30 } }] }] } }
const key = (game, league) => game + '|' + league + '|' + searchIdentity(QUERY)

describe('withLeagueKey', () => {
  it('옛 키(game|조건)에 리그 칸을 끼워 넣는다', () => {
    const legacy = 'poe1|' + searchIdentity(QUERY)
    expect(withLeagueKey(legacy, 'poe1', 'Allflame')).toBe(key('poe1', 'Allflame'))
  })

  it('이미 리그가 든 키는 리그만 바꾼다 — 조건 부분의 | 를 잘라먹지 않는다', () => {
    const cur = key('poe1', 'Allflame')
    expect(withLeagueKey(cur, 'poe1', 'Hardcore Allflame')).toBe(key('poe1', 'Hardcore Allflame'))
    // 조건이 온전히 살아 있어야 한다(searchIdentity 는 '|' 로 여러 칸을 잇는다)
    expect(withLeagueKey(cur, 'poe1', 'X').endsWith(searchIdentity(QUERY))).toBe(true)
  })

  it('리그를 모르면 빈 칸으로 둔다 — 형식은 유지해야 다음에 채울 수 있다', () => {
    expect(withLeagueKey('poe1|t:반지', 'poe1', null)).toBe('poe1||t:반지')
  })

  it('우리가 만든 키가 아니면 손대지 않는다 (데모·시드)', () => {
    expect(withLeagueKey('__demo_h1', 'poe1', 'Allflame')).toBe('__demo_h1')
    expect(withLeagueKey('', 'poe1', 'Allflame')).toBe('')
  })
})

describe('리그가 다른 같은 조건', () => {
  const rec = (league) => ({
    game: 'poe1', league, title: '반지', stats: ['화염 저항 #%'], statGroups: [], otherFilters: [], priceFilter: null,
    url: `https://poe.kakaogames.com/trade/search/${encodeURIComponent(league)}/G6GzlQW8Ub`,
    dedupeKey: key('poe1', league), query: QUERY,
  })

  it('서로 다른 북마크로 저장된다 (제보 재현)', async () => {
    await addBookmark(rec('Allflame'), '올플레임')
    await addBookmark(rec('Hardcore Allflame'), '하드코어')
    const all = await listByKind('bookmark', 'poe1')
    expect(all).toHaveLength(2)
    expect(new Set(all.map((b) => b.dedupeKey)).size).toBe(2)
  })

  it("한쪽을 찾을 때 다른 쪽이 '이미 저장된 검색'으로 잡히지 않는다", async () => {
    await addBookmark(rec('Allflame'), '올플레임')
    expect(await findBookmark(key('poe1', 'Hardcore Allflame'), 'poe1')).toBeNull()
    expect((await findBookmark(key('poe1', 'Allflame'), 'poe1')).name).toBe('올플레임')
  })

  it("'수치만 다른 북마크' 판정에서도 리그가 다르면 제외된다", () => {
    const saved = { kind: 'bookmark', league: 'Allflame', dedupeKey: 'a', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], otherFilters: [], priceFilter: null }
    const latest = { league: 'Hardcore Allflame', dedupeKey: 'b', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], otherFilters: [], priceFilter: null }
    expect(findNearDuplicate(latest, [saved])).toBeNull()
    // 같은 리그면 지금까지처럼 잡힌다
    expect(findNearDuplicate({ ...latest, league: 'Allflame' }, [saved])).not.toBeNull()
  })

  it('리그를 모르는 옛 레코드는 계속 비교한다 — 기존 중복 감지를 잃지 않는다', () => {
    const saved = { kind: 'bookmark', dedupeKey: 'a', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], otherFilters: [], priceFilter: null }
    const latest = { league: 'Allflame', dedupeKey: 'b', title: '반지', itemType: '반지', stats: ['화염 저항 #%'], otherFilters: [], priceFilter: null }
    expect(findNearDuplicate(latest, [saved])).not.toBeNull()
  })

  it('리그를 이관하면 키의 리그 칸도 따라간다', async () => {
    const b = await addBookmark(rec('Allflame'), '올플레임')
    await migrateBookmarkLeague(b.id, 'https://poe.kakaogames.com/trade/search/Hardcore%20Allflame/NEW', 'Hardcore Allflame')
    const after = (await listByKind('bookmark', 'poe1'))[0]
    expect(after.league).toBe('Hardcore Allflame')
    expect(after.dedupeKey).toBe(key('poe1', 'Hardcore Allflame'))
  })
})
