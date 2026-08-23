// 폭 밴드 경계 — 넓힌 폭이 무엇으로 바뀌는지의 기준선.
//
// 경계 숫자는 취향이 아니라 실측이다(2026-08-23, 800px 목업 · Noto Sans KR):
//   상단 액션 max-content 336 / 목록 머리 462 → 둘 다 500 에서 쾌적
//   푸터 580 / 카드 한 줄 승격 643 → 640
//   카드 액션바(89px): 하네스 실측(긴 리그명)으로 640 → 조건 칸 죽음, 760 → 86px, 820 → 120px → 820
// 이 표를 바꾸려면 하네스에서 다시 재고 test/panelBands.dom.test.js 도 함께 고쳐라.
import { describe, it, expect } from 'vitest'
import {
  panelBand, nextBandAt, bandProgress, widthPresets, activePreset,
  BAND_STOPS, MIN_W, MAX_W, BAND_M, BAND_L, BAND_XL,
} from '../src/lib/panelWidth.js'

describe('panelBand', () => {
  it('경계 바로 아래는 이전 밴드, 경계값부터 다음 밴드', () => {
    expect(panelBand(MIN_W)).toBe('s')
    expect(panelBand(BAND_M - 1)).toBe('s')
    expect(panelBand(BAND_M)).toBe('m')
    expect(panelBand(BAND_L - 1)).toBe('m')
    expect(panelBand(BAND_L)).toBe('l')
    expect(panelBand(BAND_XL - 1)).toBe('l')
    expect(panelBand(BAND_XL)).toBe('xl')
    expect(panelBand(MAX_W)).toBe('xl')
  })

  // 기본폭 사용자는 이 작업 전후를 구분할 수 없어야 한다 — 모든 밴드 규칙은 m/l/xl 아래에만 둔다.
  it('기본폭은 s — 폭을 안 만진 사용자의 화면은 그대로다', () => {
    expect(panelBand(384)).toBe('s')
    expect(panelBand(499)).toBe('s')
  })

  it('쓰레기 값은 s 로 떨어진다 (applyWidth 가 클램프하지만 여기서도 안 터진다)', () => {
    expect(panelBand(undefined)).toBe('s')
    expect(panelBand(null)).toBe('s')
    expect(panelBand('abc')).toBe('s')
    expect(panelBand(-100)).toBe('s')
  })
})

describe('nextBandAt — 드래그 배지의 "얼마나 더"', () => {
  it('다음 경계와 남은 거리를 알려준다', () => {
    expect(nextBandAt(452, 1920)).toEqual({ at: BAND_M, band: 'm', remain: 48 })
    expect(nextBandAt(512, 1920)).toEqual({ at: BAND_L, band: 'l', remain: 128 })
    expect(nextBandAt(700, 1920)).toEqual({ at: BAND_XL, band: 'xl', remain: BAND_XL - 700 })
  })

  it('마지막 밴드에서는 null — 더 끌 이유가 없다', () => {
    expect(nextBandAt(BAND_XL, 1920)).toBe(null)
    expect(nextBandAt(MAX_W, 1920)).toBe(null)
  })

  // 닿을 수 없는 보상을 약속하면 끝까지 끌어도 아무 일이 없어 배지가 거짓말이 된다.
  it('창이 좁아 다음 경계에 닿을 수 없으면 null', () => {
    expect(nextBandAt(520, 760)).toBe(null) // 상한 600 → 640 에 못 닿는다
    // 반대로 닿을 수 있으면 건너뛰지 않는다: 창 1000 → 상한 840 이라 640 은 약속해도 된다
    expect(nextBandAt(520, 1000)).toEqual({ at: BAND_L, band: 'l', remain: 120 })
    // 상한이 xl 에 못 미치면 l 까지만 약속한다
    expect(nextBandAt(700, 880)).toBe(null) // 상한 720 → xl 경계에 못 닿는다
  })
})

describe('widthPresets — 설정 세그먼트 4단', () => {
  it("'최대'는 창 폭에서 파생된다 — 고정 880 으로 박으면 좁은 창에서 눌러도 안 되는 버튼이 된다", () => {
    expect(widthPresets(1920).find((p) => p.key === 'max').w).toBe(MAX_W)
    expect(widthPresets(1000).find((p) => p.key === 'max').w).toBe(840)
    expect(widthPresets(1920).find((p) => p.key === 'max').enabled).toBe(true)
    expect(widthPresets(600).find((p) => p.key === 'max').enabled).toBe(true) // 값이 곧 상한이라 늘 유효
  })

  it('창이 좁으면 고정값 프리셋은 비활성 — 조용히 무시하지 않고 알린다', () => {
    const narrow = widthPresets(760) // 상한 600
    expect(narrow.find((p) => p.key === 'wide').enabled).toBe(true)   // 500 ≤ 600
    expect(narrow.find((p) => p.key === 'wider').enabled).toBe(false) // 640 > 600
    expect(widthPresets(500).find((p) => p.key === 'wide').enabled).toBe(false) // 상한 384
  })

  it('기본은 언제나 쓸 수 있다', () => {
    expect(widthPresets(400).find((p) => p.key === 'base').enabled).toBe(true)
  })
})

describe('activePreset — 드래그와 세그먼트가 어긋나지 않게', () => {
  // 스냅을 안 하는 대신 '자기 이하 중 가장 큰 프리셋'을 켠다. 그래야 사이값에서도 빈 선택이 없다.
  it('사이값에서도 항상 하나를 가리킨다', () => {
    expect(activePreset(384, 1920)).toBe('base')
    expect(activePreset(499, 1920)).toBe('base')
    expect(activePreset(500, 1920)).toBe('wide')
    expect(activePreset(601, 1920)).toBe('wide')
    expect(activePreset(640, 1920)).toBe('wider')
    expect(activePreset(BAND_XL - 1, 1920)).toBe('wider')
  })

  it('상한에 닿으면 최대', () => {
    expect(activePreset(MAX_W, 1920)).toBe('max')
    expect(activePreset(840, 1000)).toBe('max') // 1000-160
  })

  it('비활성 프리셋은 고르지 않는다', () => {
    // 상한 600 → wider(640) 는 비활성이므로 590px 은 wide 로 남는다
    expect(activePreset(590, 760)).toBe('wide')
  })
})

// 저장 버튼이 .ba-head 가 아니라 .ba-econ-row 안에 있어야 m 밴드에서 시세·동향과 한 줄로 합쳐진다.
// 형제가 아니면 CSS 만으로는 합칠 수 없다 — 구조가 조용히 되돌아가면 넓혀도 아무 일이 없어진다.
// (소스 문자열 검사라 jsdom 이 아닌 이 파일에 둔다 — jsdom 에서는 import.meta.url 이 file: 이 아니다.)
describe('상단 3버튼 합류가 기대는 마크업', () => {
  it('저장 버튼이 .ba-econ-row 안에, 시세·동향보다 앞에 있다', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../src/content/panel/panel.js', import.meta.url), 'utf8')
    const rowStart = src.indexOf('<div class="ba-econ-row">')
    const row = src.slice(rowStart, src.indexOf('ba-namebar'))
    expect(row).toContain('id="ba-save"')
    expect(row.indexOf('id="ba-save"')).toBeLessThan(row.indexOf('ba-econ-btn items'))
    // .ba-head 안에 남아 있으면 안 된다
    expect(src.slice(src.indexOf('<div class="ba-head">'), rowStart)).not.toContain('ba-save')
  })
})

// 폭 배지(.ba-rzbadge)와 찜 배지(.ba-wbadge)는 **이름이 겹치면 안 된다.**
// 2026-08-23: 폭 배지를 .ba-wbadge 로 만드는 바람에 그 CSS 블록(position:fixed·opacity:0)이
// 찜한 매물의 '있음/판매됨' 배지를 통째로 덮어써 안 보이게 만들었다. 제보로야 발견했다.
// 겹치는 순간 조용히 남의 UI 가 죽으므로, 이름이 다시 붙는 것을 여기서 막는다.
describe('폭 배지 — 찜 배지와 이름이 겹치지 않는다', () => {
  it('패널 셸은 .ba-rzbadge 를 쓰고 .ba-wbadge 를 쓰지 않는다', async () => {
    const { readFileSync } = await import('node:fs')
    const panel = readFileSync(new URL('../src/content/panel/panel.js', import.meta.url), 'utf8')
    expect(panel).toContain('ba-rzbadge')
    expect(panel).not.toContain('ba-wbadge') // 찜 배지 전용 이름
  })

  it('찜 배지는 renderList 에만 있고, 폭 배지 CSS 가 그 이름을 잡지 않는다', async () => {
    const { readFileSync } = await import('node:fs')
    const list = readFileSync(new URL('../src/content/panel/renderList.js', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../src/content/panel/panel.css', import.meta.url), 'utf8')
    expect(list).toContain('ba-wbadge') // 찜 배지는 여기 그대로
    // 폭 배지 전용 선언(fixed 오버레이)이 .ba-wbadge 에 걸리면 안 된다.
    // ⚠ 주석을 먼저 걷어낸다 — 이 파일의 경고 주석이 두 이름을 함께 언급해 그대로 재면 자기 자신에 걸린다.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(/\.ba-wbadge[^{]*\{[^}]*position:\s*fixed/.test(bare)).toBe(false)
  })

  // 패널(.ba-root)보다 위에 떠야 한다 — 아래면 배지 오른쪽이 패널에 잘려 보인다(같은 제보).
  it('폭 배지의 z-index 가 패널보다 높다', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('../src/content/panel/panel.css', import.meta.url), 'utf8')
    const z = (re) => Number((css.match(re) || [])[1])
    const panelZ = z(/\.ba-root\s*\{[\s\S]*?z-index:\s*(\d+)/)
    const badgeZ = z(/\.ba-rzbadge\s*\{[\s\S]*?z-index:\s*(\d+)/)
    expect(Number.isFinite(panelZ) && Number.isFinite(badgeZ)).toBe(true)
    expect(badgeZ).toBeGreaterThan(panelZ)
  })
})

// 드래그 배지 스테퍼 — '어디쯤인가'를 그림으로 답하는 부분의 상태 계산.
// 계산을 lib 에 둔 이유: panel.js 가 경계를 다시 알면 두 곳이 갈라진다
// (폭 결합 4곳이 각각 하드코딩돼 틈이 생겼던 그 사고와 같은 종류).
describe('bandProgress — 배지 스테퍼 상태', () => {
  const states = (w, vw = 1920) => bandProgress(w, vw).stops.map((s) => s.state)

  it('정거장은 밴드 경계와 같다 — 여기서 숫자를 다시 적지 않는다', () => {
    expect(BAND_STOPS).toEqual([MIN_W, BAND_M, BAND_L, BAND_XL])
  })

  it('지나온 곳 done · 서 있는 곳 at · 바로 다음 up', () => {
    expect(states(MIN_W)).toEqual(['at', 'up', 'todo', 'todo'])
    expect(states(BAND_M)).toEqual(['done', 'at', 'up', 'todo'])
    expect(states(BAND_L)).toEqual(['done', 'done', 'at', 'up'])
    expect(states(BAND_XL)).toEqual(['done', 'done', 'done', 'at'])
    expect(states(MAX_W)).toEqual(['done', 'done', 'done', 'at'])
  })

  // 닿을 수 없는 정거장을 켜 두면 배지가 못 지킬 약속을 한다 — 끝까지 끌어도 아무 일이 없다.
  it('창이 좁아 닿을 수 없는 정거장은 off', () => {
    expect(states(MIN_W, 900)).toEqual(['at', 'up', 'todo', 'off']) // 상한 740 → xl 불가
    expect(states(MIN_W, 760)).toEqual(['at', 'up', 'off', 'off'])  // 상한 600 → l·xl 불가
  })

  it('현재 구간의 진행도를 0~1 로 준다', () => {
    expect(bandProgress(MIN_W, 1920).fill).toBe(0)
    const mid = (MIN_W + BAND_M) / 2
    expect(bandProgress(mid, 1920).fill).toBeCloseTo(0.5, 2)
    expect(bandProgress(BAND_M - 1, 1920).fill).toBeGreaterThan(0.9)
  })

  it('마지막 구간·닿을 수 없는 구간에서는 진행도가 0 — 채울 다음이 없다', () => {
    expect(bandProgress(MAX_W, 1920).fill).toBe(0)
    expect(bandProgress(590, 760).fill).toBe(0) // 상한 600, 다음 정거장 640 에 못 닿는다
  })

  it('쓰레기 값도 클램프해서 받는다', () => {
    expect(() => bandProgress(undefined, 1920)).not.toThrow()
    expect(bandProgress(-999, 1920).index).toBe(0)
  })
})
