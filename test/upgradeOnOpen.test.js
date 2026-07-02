// 하위호환 업그레이드: 저장된 북마크를 열어 재검색되면(markUsedByUrl) 검색 조건을
// 최신 파서 형식(능력치 수치 포함)으로 재기록하되, 표시명·폴더·순서·id는 보존하는지 검증.
import { describe, it, expect, beforeEach } from 'vitest'
import { addBookmark, markUsedByUrl, listByKind, moveBookmark } from '../src/store/store.js'

beforeEach(() => globalThis.__resetChromeMock())

const URL_X = 'https://poe.kakaogames.com/trade2/search/poe2/S/xxxx'

describe('markUsedByUrl — 열람 시 구 북마크 조건 업그레이드', () => {
  it('구 형식(문자열 filters)을 최신 형식({text,value})으로 갱신 + 표시명·폴더 보존', async () => {
    // 구 형식 북마크: statGroups.filters가 문자열(값 없음), 구 dedupeKey
    const bm = await addBookmark({
      game: 'poe2', league: 'S', url: URL_X, title: '반지', itemType: '반지', name: null,
      stats: ['화염 저항 #%'], statGroups: [{ type: 'and', label: '및', filters: ['화염 저항 #%'] }],
      otherFilters: [{ key: 'ilvl', label: '아이템 레벨', value: '≥80' }], dedupeKey: 'oldkey',
    }, '내 반지')
    await moveBookmark(bm.id, { folderId: 'f1', order: 7 })

    // 열람(재검색) — 최신 파서 형식(값 포함) 전달
    await markUsedByUrl(URL_X, undefined, undefined, {
      title: '반지', itemType: '반지', stats: ['화염 저항 #%'],
      statGroups: [{ type: 'and', label: '및', filters: [{ text: '화염 저항 #%', value: '40+' }] }],
      otherFilters: [{ key: 'ilvl', label: '아이템 레벨', value: '≥80' }], priceFilter: null, dedupeKey: 'newkey',
    })

    const r = (await listByKind('bookmark', 'poe2'))[0]
    expect(r.statGroups[0].filters[0]).toEqual({ text: '화염 저항 #%', value: '40+' }) // 값 포함으로 업그레이드
    expect(r.dedupeKey).toBe('newkey') // 식별키도 최신화
    expect(r.name).toBe('내 반지') // 표시명 보존
    expect(r.folderId).toBe('f1') // 폴더 보존
    expect(r.order).toBe(7) // 순서 보존
    expect(r.id).toBe(bm.id) // id 보존
    expect(r.lastUsedAt).toBeGreaterThan(0) // 기존 동작(사용 시각 갱신)도 유지
  })

  it('fields 없이(3-arg) 호출하면 조건은 그대로 — 기존 동작 회귀 없음', async () => {
    await addBookmark({
      game: 'poe2', league: 'S', url: URL_X, title: 'T', stats: ['a'],
      statGroups: [{ type: 'and', label: '및', filters: ['a'] }], dedupeKey: 'k',
    }, 'N')
    await markUsedByUrl(URL_X, { valueDiv: 1, value: 1, unit: 'divine' }, undefined)
    const r = (await listByKind('bookmark', 'poe2'))[0]
    expect(r.statGroups[0].filters).toEqual(['a']) // 조건 미변경
    expect(r.dedupeKey).toBe('k') // dedupeKey 미변경
    expect(r.snapshot).toEqual({ valueDiv: 1, value: 1, unit: 'divine' }) // 스냅샷은 갱신
  })
})
