// 패널 폭 클램프와 '폭 밴드'.
//
// 밴드는 넓게/좁게에 각각 이유를 주는 장치다(2026-08-13 제보: "그저 넓히기만 하니까 장단점이 없다").
// 경계값이 흔들리면 그 이유가 통째로 사라지므로 여기서 고정한다.
import { describe, it, expect } from 'vitest'
import { clampPanelWidth, maxPanelWidth, widthBand, MIN_W, MAX_W, NARROW_MAX, WIDE_MIN } from '../src/lib/panelWidth.js'

describe('clampPanelWidth', () => {
  it('최소·최대 밖은 가둔다', () => {
    expect(clampPanelWidth(10, 1920)).toBe(MIN_W)
    expect(clampPanelWidth(99999, 1920)).toBe(MAX_W)
  })

  it('창이 좁으면 상한이 함께 내려간다 — 패널이 화면을 다 덮지 않게', () => {
    expect(maxPanelWidth(800)).toBe(640) // 800 - 160
    expect(clampPanelWidth(880, 800)).toBe(640)
  })

  it('창이 아주 좁아도 최소폭 아래로는 안 내려간다 (거래소가 안 보여도 패널은 쓸 수 있어야 한다)', () => {
    expect(maxPanelWidth(200)).toBe(MIN_W)
    expect(clampPanelWidth(500, 200)).toBe(MIN_W)
  })

  it('숫자가 아니면 기본폭(폭 조절 도입 전 고정폭)으로 떨어진다', () => {
    expect(clampPanelWidth(undefined, 1920)).toBe(NARROW_MAX)
    expect(clampPanelWidth('abc', 1920)).toBe(NARROW_MAX)
    expect(clampPanelWidth(null, 1920)).toBe(NARROW_MAX) // Number(null)=0 → 최소로 가지 않게
  })

  // 2026-08-13 라이브 드래그로 발견. 하한을 지나쳐 끌면 startW + delta 가 음수로 들어오는데,
  // '값 없음'과 뭉뚱그려 처리하면 기본폭(384)으로 튀어 오른다 — 좁히려는데 되레 넓어진다.
  it('음수는 값 없음이 아니라 진짜 요청 — 최소폭으로 눌러 담는다', () => {
    expect(clampPanelWidth(-516, 1920)).toBe(MIN_W)
    expect(clampPanelWidth(0, 1920)).toBe(MIN_W)
  })

  it('정수로 떨어진다 — 소수 px 은 핸들 위치를 미세하게 어긋나게 한다', () => {
    expect(Number.isInteger(clampPanelWidth(432.7, 1920))).toBe(true)
  })
})

describe('widthBand', () => {
  it('세 밴드로 나뉜다', () => {
    expect(widthBand(300)).toBe('narrow')
    expect(widthBand(NARROW_MAX - 1)).toBe('narrow')
    expect(widthBand(NARROW_MAX)).toBe('default') // 384 = 예전 고정폭 = 라벨이 살아남는 하한
    expect(widthBand(WIDE_MIN - 1)).toBe('default')
    expect(widthBand(WIDE_MIN)).toBe('wide')
    expect(widthBand(880)).toBe('wide')
  })

  // 384 는 액션 행 실측(최악 폰트 336/342px)에서 나온 값이다. 이 경계가 내려가면
  // 라벨이 살아 있는 채로 폭이 부족해져 액션 행이 줄바꿈된다(세 번 재발한 그 증상).
  it('narrow 경계는 액션 행 폭 예산이 성립하는 하한(384)과 같다', () => {
    expect(NARROW_MAX).toBe(384)
  })

  it('최소폭은 narrow 밴드 안에 있다 — 아니면 좁게가 선택지가 되지 않는다', () => {
    expect(widthBand(MIN_W)).toBe('narrow')
  })

  // ⚠ 이 경계의 근거는 한 번 틀렸다가 라이브 실측으로 바로잡혔다.
  //   처음엔 wide 에서 '이름 줄 + 조건 요약'을 합쳤고, 600 을 "기본폭 384 보다 두 축 모두 나아지는
  //   지점"으로 정당화했다. 하지만 사용자가 실제로 지나가는 경로는 599→600 이고, 거기서 조건 요약
  //   잘림이 **0건 → 7건**으로 튀었다(라이브 북마크 26개: 599 default 26/26 → 600 wide 19/26).
  //   → 합치는 짝을 '이름 줄 + 메모'로 바꿔(조건 요약은 단독 줄로 전체 폭 유지) 급락을 없앴다.
  //   수정 후 라이브: 560·599·600·640·720·880 전 구간 26/26 온전, 카드 109 → 82px.
  //   이제 600 은 '넘어가면 카드만 낮아지고 잃는 게 없는' 지점이다 — 그래서 경계로 유효하다.
  it('wide 경계는 넘어갈 때 잃는 것이 없는 지점(600)이다', () => {
    expect(WIDE_MIN).toBe(600)
    expect(widthBand(WIDE_MIN - 1)).toBe('default')
    expect(widthBand(WIDE_MIN)).toBe('wide')
  })
})
