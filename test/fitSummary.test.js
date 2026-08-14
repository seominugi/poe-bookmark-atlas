// 조건 요약을 '조건 경계'에서 끊기.
//
// 왜 이렇게까지 하나: 조건 요약은 조건 수 × 스탯명 길이라 어떤 폭에서도 다 안 들어간다
// (실측 북마크 26개 — 880px 에서도 46% 가 잘렸다). 그래서 '다 보여준다'를 포기하고
// **보이는 것만은 온전하게** 한다. 남은 개수는 '조건 N개' 배지가, 전체는 툴팁이 갖는다.
import { describe, it, expect } from 'vitest'
import { fitByParts, SEP } from '../src/lib/fitSummary.js'

// 글자당 10px 인 가짜 폰트 — 계산을 눈으로 검산할 수 있게.
const px10 = (s) => s.length * 10

describe('fitByParts', () => {
  it('통째로 들어가면 그대로 둔다', () => {
    expect(fitByParts('A · B', 1000, px10)).toBe('A · B')
  })

  it('조건 경계에서 끊는다 — 글자 중간에서 자르지 않는다', () => {
    const full = ['아이템 레벨 ≥80', '잔여 사용 횟수 ≥20', '능력치 4개'].join(SEP)
    const out = fitByParts(full, px10('아이템 레벨 ≥80 · 잔여 사용 횟수 ≥20'), px10)
    expect(out).toBe('아이템 레벨 ≥80 · 잔여 사용 횟수 ≥20')
    expect(out.endsWith('…')).toBe(false)
    // 남긴 조각은 전부 원본의 온전한 조건이다
    for (const p of out.split(SEP)) expect(full.split(SEP)).toContain(p)
  })

  it('한 조건이 더 들어갈 폭이 안 되면 그 앞에서 멈춘다 (한 글자도 안 넘긴다)', () => {
    const full = ['AAAA', 'BBBB', 'CCCC'].join(SEP)
    // 'AAAA · BBBB' = 11자 = 110px. 여기서 1px 모자라면 'AAAA' 만.
    expect(fitByParts(full, 109, px10)).toBe('AAAA')
    expect(fitByParts(full, 110, px10)).toBe('AAAA · BBBB')
  })

  // 하나도 못 남기면 빈 칸이 되는데, 그건 잘린 것보다 나쁘다 → CSS 말줄임에 맡긴다.
  it('첫 조건조차 안 들어가면 그대로 돌려준다 (빈 문자열을 만들지 않는다)', () => {
    const full = ['아주아주 긴 단일 조건', 'B'].join(SEP)
    expect(fitByParts(full, 5, px10)).toBe('아주아주 긴 단일 조건')
  })

  it('조건이 하나뿐이면 끊을 경계가 없다 — 원문 그대로 (CSS 말줄임 담당)', () => {
    expect(fitByParts('장갑에 장착된 스킬에 #레벨 육탄 방어 보조 효과 적용', 30, px10))
      .toBe('장갑에 장착된 스킬에 #레벨 육탄 방어 보조 효과 적용')
  })

  it('빈 값·잘못된 인자는 조용히 원문을 돌려준다', () => {
    expect(fitByParts('', 100, px10)).toBe('')
    expect(fitByParts(null, 100, px10)).toBe('')
    expect(fitByParts('A · B', 0, px10)).toBe('A · B')      // 아직 레이아웃 전
    expect(fitByParts('A · B', 100, null)).toBe('A · B')    // 캔버스 없음
  })

  // 넓힐수록 더 보여야 폭 밴드(넓게 = 더 많이)와 정합한다.
  it('폭이 넓어질수록 더 많은 조건이 남는다 (단조 증가)', () => {
    const full = ['AAAA', 'BBBB', 'CCCC', 'DDDD'].join(SEP)
    const counts = [40, 110, 180, 250].map((w) => fitByParts(full, w, px10).split(SEP).length)
    expect(counts).toEqual([1, 2, 3, 4])
  })
})
