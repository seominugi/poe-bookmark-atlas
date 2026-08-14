// @vitest-environment jsdom
// 액션 행 폭 예산 회귀 방지.
//
// 왜 이 테스트가 있나: 이 행은 **같은 원인으로 세 번 깨졌다.**
//   2026-07-27 — 버튼('선택')을 하나 추가해 384px 폭을 넘김 → 글자가 세로로 쪼개짐
//   2026-08-06 — 라벨이 '모든 폴더 접기'(336px) → '모든 폴더 펼치기'(346px)로 길어져 4px 초과 → 줄바꿈
// 매번 원인은 같다: **추가할 때 아무도 폭을 재지 않았다.** jsdom은 레이아웃을 계산하지 않아
// 픽셀을 직접 잴 수 없으므로, 실측으로 얻은 예산을 **버튼 개수 + 라벨 글자수**로 근사해 고정한다.
//
// 실측 기준(2026-08-06, 하네스 · 패널 384px · 가용 342px):
//   버튼 4개(상세히 · 가져오기/내보내기 묶음 · 전체 접기 · 폴더 추가) + 조건부 '오래된 N'.
//   자식이 전부 고정폭이라 좁아져도 자동 축소가 없다 — 넘치면 그대로 줄바꿈이다.
//   '오래된 N'까지 붙으면 어떤 라벨로도 한 줄에 안 들어간다(이미 2행) — 그건 의도된 상태다.
//
// ⚠ **폭은 폰트에 따라 달라진다.** 패널이 선언한 Pretendard 는 번들돼 있지 않아 실제 사용자는
//   폴백으로 떨어진다. 같은 구성에서 행 필요폭 실측:
//     Arial·Noto Sans KR 329px(여유 13) / serif 333(9) / **system-ui·Malgun Gothic 336(여유 6)**
//   즉 최악 폰트 기준 **가용의 98%를 이미 쓰고 있다.** 여기에 뭔가 더하면 거의 확실히 넘친다.
//
// 이 테스트가 깨지면: 숫자를 올리기 전에 **하네스에서 system-ui 기준으로 실제 폭을 다시 재라.**
//   여유가 없다면 상한을 올리지 말고 버튼을 ⋯ 메뉴나 설정 모달로 옮겨야 한다
//   (가장 유력한 후보: 사용 빈도가 낮은 가져오기/내보내기 묶음 — 72px 확보).
import { describe, it, expect, beforeEach } from 'vitest'
import { addBookmark, addFolder } from '../src/store/store.js'
import { renderList } from '../src/content/panel/renderList.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

beforeEach(() => { globalThis.__resetChromeMock(); document.body.innerHTML = '' })

// 현재 구성에 맞춘 상한. 실측 여유 20px ≈ 한글 1~2자 분량이라 여유를 넉넉히 잡지 않는다.
// 실측(jsdom 렌더): 항목 4개 / 라벨 합 13자(접힘 상태 14자 — '전체 펼치기'가 1자 길다).
// 하네스 실측으로 한글 1자 ≈ 10px, 남은 여유가 20px 이므로 슬랙은 약 2자뿐이다.
const MAX_ITEMS = 4        // 조건부 '오래된 N' 제외한 상시 항목 수
const MAX_LABEL_CHARS = 16 // 상시 항목 라벨 글자수 합 (아이콘 전용 버튼은 0자) = 실측 14 + 슬랙 2

const ui = { game: 'poe2', league: 'A', getLeagueMap: () => ({ A: 'Alpha 리그' }) }

async function renderRow() {
  const list = document.createElement('div')
  const root = document.createElement('div'); root.className = 'ba-root'; root.appendChild(list)
  document.body.appendChild(root)
  await renderList(list, root, ui)
  return list.querySelector('.ba-action-row')
}

describe('액션 행 — 폭 예산 (3회 회귀 방지)', () => {
  beforeEach(async () => {
    await addFolder('유니크', 'poe2') // 폴더가 있어야 '전체 접기' 버튼이 나온다
    await addBookmark({ game: 'poe2', league: 'A', title: 'T', stats: [], dedupeKey: 'k1', url: 'https://poe.kakaogames.com/trade2/x' }, '북마크')
  })

  it('상시 항목 수가 예산을 넘지 않는다', async () => {
    const row = await renderRow()
    expect(row).toBeTruthy()
    const items = [...row.children]
    expect(items.length).toBeLessThanOrEqual(MAX_ITEMS)
  })

  it('상시 라벨 글자수 합이 예산을 넘지 않는다', async () => {
    const row = await renderRow()
    const chars = [...row.children].reduce((s, el) => s + el.textContent.trim().length, 0)
    expect(chars).toBeLessThanOrEqual(MAX_LABEL_CHARS)
  })

  it("'전체 접기'/'전체 펼치기' 라벨이 유지된다 — 길어지면 다시 넘친다", async () => {
    const row = await renderRow()
    const btn = row.querySelector('.ba-collapse-all')
    expect(btn).toBeTruthy()
    // 종전 '모든 폴더 펼치기'(8자)가 4px 초과를 만들었다. 6자 이내로 묶는다.
    expect(btn.textContent.trim().length).toBeLessThanOrEqual(6)
    expect(['전체 접기', '전체 펼치기']).toContain(btn.textContent.trim())
  })

  // 2026-08-13 — 최소폭을 384 → 300 으로 내렸다. 그게 가능한 유일한 이유는 narrow 밴드에서
  // 라벨을 숨기기 때문이다(.ba-root[data-w="narrow"] .ba-btn-lbl { display: none }).
  // 라벨이 래퍼 밖으로 새어 나오면 숨길 수 없고, 300px 에서 이 행이 즉시 줄바꿈된다 —
  // 그런데 CSS 만 보면 아무도 눈치채지 못한다. 그래서 마크업 쪽에서 고정한다.
  it('라벨은 전부 .ba-btn-lbl 안에 있다 — narrow 폭에서 숨길 수 있어야 최소폭 300px 이 성립한다', async () => {
    const row = await renderRow()
    for (const el of row.children) {
      const outside = [...el.childNodes]
        .filter((n) => n.nodeType === 3 /* text */)
        .map((n) => n.textContent.trim())
        .join('')
      expect(outside, `${el.className} 의 라벨이 .ba-btn-lbl 밖에 있다`).toBe('')
    }
  })

  it('라벨을 숨기면 액션 행에 글자가 남지 않는다 (아이콘만)', async () => {
    const row = await renderRow()
    row.querySelectorAll('.ba-btn-lbl').forEach((el) => el.remove()) // narrow 밴드의 display:none 을 흉내
    expect(row.textContent.trim()).toBe('')
  })
})
