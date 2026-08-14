// @vitest-environment jsdom
// 북마크 메모 기능 제거 (2026-08-13, 사용자 결정: "거의 사용하지 않는 기능")
//
// 지키려는 것 두 가지.
//  ① 메모 UI 가 카드에서 완전히 사라진다 — 카드가 낮아져 한 화면에 더 많은 북마크가 보인다.
//  ② **검색 범위는 줄지 않는다.** 예전 검색 인덱스에는 note 가 들어갔는데, 그 note 는 저장 시
//     buildAutoNote 로 자동 생성된 값(유형 + 비능력치 필터)이었다. 그 재료를 원본에서 직접
//     넣도록 바꿨으므로 '반지'·'아이템 레벨' 같은 검색어가 그대로 동작해야 한다.
//     (사라지는 건 손으로 쓴 메모로 찾던 경우뿐이고, 그 데이터는 사용자 결정으로 함께 지웠다.)
import { describe, it, expect, beforeEach } from 'vitest'
import { addBookmark, ensureSchema } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

const ui = { game: 'poe2', league: 'A', getLeagueMap: () => ({ A: 'Alpha 리그' }) }

async function render() {
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list
}

const REC = {
  game: 'poe2', league: 'A', title: '반지', itemType: '반지',
  stats: ['화염 저항 #%'], otherFilters: [{ key: 'ilvl', label: '아이템 레벨', value: '≥80' }],
  dedupeKey: 'k1', url: 'https://poe.kakaogames.com/trade2/x',
}

describe('메모 UI 제거', () => {
  it('카드에 메모 줄·편집 진입점이 없다', async () => {
    await addBookmark({ ...REC }, '내 북마크')
    const list = await render()
    expect(list.querySelector('.ba-note-slot')).toBe(null)
    expect(list.querySelector('.ba-note')).toBe(null)
    expect(list.querySelector('.ba-note-edit')).toBe(null)
    expect(list.textContent).not.toContain('메모')
  })

  it('저장할 때 메모를 자동으로 만들지 않는다', async () => {
    const rec = await addBookmark({ ...REC }, '내 북마크')
    expect(rec.note).toBeUndefined()
  })
})

describe('검색 범위 (메모 제거로 줄어들면 안 된다)', () => {
  it('유형·비능력치 필터·능력치·이름이 모두 검색 인덱스에 있다', async () => {
    await addBookmark({ ...REC }, '내 북마크')
    const list = await render()
    const idx = list.querySelector('.ba-row[data-kind="bookmark"]').dataset.search
    for (const term of ['내 북마크', '반지', '아이템 레벨', '≥80', '화염 저항']) {
      expect(idx, `'${term}' 로 못 찾는다`).toContain(term.toLowerCase())
    }
  })

  it('otherFilters 가 없어도 인덱스 생성이 깨지지 않는다', async () => {
    await addBookmark({ ...REC, otherFilters: undefined }, '필터 없는 북마크')
    const list = await render()
    const idx = list.querySelector('.ba-row[data-kind="bookmark"]').dataset.search
    expect(idx).toContain('필터 없는 북마크')
    expect(idx).not.toContain('undefined')
  })
})

describe('저장된 메모 삭제 (스키마 v2)', () => {
  it('예전 레코드의 note 를 지운다', async () => {
    // v1 시절 저장된 모습: note 가 들어 있고 스키마 버전 키가 없다
    await chrome.storage.local.set({
      records: [{ id: 'old1', kind: 'bookmark', game: 'poe2', title: '반지', note: '손으로 쓴 메모' }],
    })
    await ensureSchema()
    const [rec] = (await chrome.storage.local.get('records')).records
    expect('note' in rec).toBe(false)
    expect(rec.title).toBe('반지') // 나머지 필드는 그대로
  })
})
