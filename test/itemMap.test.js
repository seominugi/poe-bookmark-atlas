import { describe, it, expect } from 'vitest'
import { buildItemMap, itemTypeText } from '../src/lib/itemMap.js'

// 실제 /api/trade/data/items 응답에서 그대로 가져온 모양 (2026-08-16 라이브 확인)
const PAYLOAD = {
  result: [
    {
      label: '지도',
      entries: [
        { type: '앗조아틀의 연대기' }, // 대부분은 type 이 곧 이름
        { type: 'NonEleBowRangerPhys', text: '용병 소환장 (저격수)', disc: 'mercenary_warrant' },
        { type: 'NonEleBowRangerChaos', text: '용병 소환장 (독성학자)', disc: 'mercenary_warrant' },
      ],
    },
    {
      label: '장신구',
      entries: [
        // 유니크 — name 이 따로 있고 text 는 "유니크명 + 베이스명". 유형 자리에 쓰면 안 된다.
        { name: '아켈리의 초원', type: '루비 반지', text: '아켈리의 초원 루비 반지', flags: { unique: true } },
      ],
    },
  ],
}

describe('buildItemMap', () => {
  const map = buildItemMap(PAYLOAD)

  it('내부 id 를 표시 이름으로 옮긴다 (제보 재현)', () => {
    expect(map.NonEleBowRangerPhys).toBe('용병 소환장 (저격수)')
    expect(map['NonEleBowRangerPhys|mercenary_warrant']).toBe('용병 소환장 (저격수)')
  })

  it('type 이 곧 이름인 항목은 담지 않는다 — 6002개를 통째로 들고 있을 이유가 없다', () => {
    expect('앗조아틀의 연대기' in map).toBe(false)
  })

  it('유니크는 담지 않는다 — name 이 우선이고, text 를 유형에 넣으면 이름이 겹쳐 길어진다', () => {
    expect('루비 반지' in map).toBe(false)
  })

  it('빈 값도 안전하게 다룬다', () => {
    expect(buildItemMap(null)).toEqual({})
    expect(buildItemMap({ result: [{}] })).toEqual({})
  })
})

describe('itemTypeText', () => {
  const map = buildItemMap(PAYLOAD)

  it('문자열 type 을 표시 이름으로 바꾼다', () => {
    expect(itemTypeText('NonEleBowRangerPhys', map)).toBe('용병 소환장 (저격수)')
  })

  it('{option, discriminator} 형태도 처리한다', () => {
    expect(itemTypeText({ option: 'NonEleBowRangerChaos', discriminator: 'mercenary_warrant' }, map))
      .toBe('용병 소환장 (독성학자)')
  })

  it('맵에 없으면 원래 값을 그대로 둔다 — 맵이 늦게 오거나 새 아이템이어도 화면이 비면 안 된다', () => {
    expect(itemTypeText('반지', map)).toBe('반지')
    expect(itemTypeText('알수없는신규', {})).toBe('알수없는신규')
    expect(itemTypeText('반지', null)).toBe('반지')
  })

  it('값이 없으면 그대로 통과시킨다', () => {
    expect(itemTypeText(null, map)).toBe(null)
    expect(itemTypeText('', map)).toBe('')
    expect(itemTypeText({}, map)).toBe('')
  })
})

// parseSearchQuery → suggestName 까지 이어지는 실제 경로. 제보의 이름이 그대로 재현·수정되는지.
import { parseSearchQuery } from '../src/lib/searchParser.js'
import { suggestName } from '../src/lib/suggestName.js'

describe('제보 재현: 북마크 이름', () => {
  const map = buildItemMap(PAYLOAD)
  // ⚠ 실제 거래소는 이 계열을 **객체 형태로만** 받는다 — 문자열로 보내면 400 "Unknown item base type".
  //   (2026-08-16 라이브 확인) 그래서 재현도 객체 형태로 한다. 문자열 관용은 아래에서 따로 본다.
  const payload = {
    query: {
      type: { option: 'NonEleBowRangerPhys', discriminator: 'mercenary_warrant' },
      stats: [{ type: 'and', filters: [{ id: 'explicit.stat_x', value: { min: 10 } }] }],
    },
  }

  it('맵이 없으면 내부 id 가 그대로 새어 나온다 (버그 재현)', () => {
    const parsed = parseSearchQuery(payload, {}, undefined, {})
    expect(suggestName(parsed)).toBe('NonEleBowRangerPhys - 능력치 필터')
  })

  it('맵이 있으면 사용자가 화면에서 본 이름이 된다', () => {
    const parsed = parseSearchQuery(payload, {}, undefined, map)
    expect(parsed.itemType).toBe('용병 소환장 (저격수)')
    expect(suggestName(parsed)).toBe('용병 소환장 (저격수) - 능력치 필터')
  })

  it('맵이 아직 안 왔어도 이름이 비지는 않는다 — 늦게 오는 비동기 로드를 견딘다', () => {
    const parsed = parseSearchQuery(payload, {}, undefined, undefined)
    expect(parsed.itemType).toBe('NonEleBowRangerPhys')
  })

  it('보통 아이템은 달라지지 않는다', () => {
    const parsed = parseSearchQuery({ query: { type: '반지', stats: [] } }, {}, undefined, map)
    expect(parsed.itemType).toBe('반지')
  })
})
