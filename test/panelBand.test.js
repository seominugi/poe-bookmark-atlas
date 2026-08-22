// 폭 밴드 경계 — 넓힌 폭이 무엇으로 바뀌는지의 기준선.
//
// 경계 숫자는 취향이 아니라 실측이다(2026-08-23, 800px 목업 · Noto Sans KR):
//   상단 액션 max-content 336 / 목록 머리 462 → 둘 다 500 에서 쾌적
//   푸터 580 / 카드 한 줄 승격 643 → 640
//   카드 액션바(89px): 하네스 실측(긴 리그명)으로 640 → 조건 칸 죽음, 760 → 86px, 820 → 120px → 820
// 이 표를 바꾸려면 하네스에서 다시 재고 test/panelBands.dom.test.js 도 함께 고쳐라.
import { describe, it, expect } from 'vitest'
import {
  panelBand, nextBandAt, widthPresets, activePreset,
  MIN_W, MAX_W, BAND_M, BAND_L, BAND_XL,
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
