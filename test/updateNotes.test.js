// 업데이트 노트 — 무엇을 보여줄지 고르는 순수 로직.
// 자동 업데이트는 사용자가 모르는 사이 여러 번 일어난다 → 마지막으로 본 버전 **이후 전부**를 누적해 보여준다.
import { describe, it, expect } from 'vitest'
import { cmpVersion, notesSince, hasUnseen, UPDATE_NOTES } from '../src/lib/updateNotes.js'

const NOTES = [
  { version: '0.9.2', date: '2026-08-18', body: 'c' },
  { version: '0.9.1', date: '2026-08-17', body: 'b' },
  { version: '0.9.0', date: '2026-08-15', body: 'a' },
]

describe('cmpVersion', () => {
  it('자리수별로 숫자 비교 — 문자열 비교로는 0.9.10 < 0.9.2 가 되어버린다', () => {
    expect(cmpVersion('0.9.10', '0.9.2')).toBeGreaterThan(0)
    expect(cmpVersion('0.9.2', '0.9.10')).toBeLessThan(0)
    expect(cmpVersion('1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(cmpVersion('0.9.1', '0.9.1')).toBe(0)
  })
  it('자리수가 다르거나 값이 없어도 넘어간다', () => {
    expect(cmpVersion('1.0', '1.0.0')).toBe(0)
    expect(cmpVersion('1.0.1', '1.0')).toBeGreaterThan(0)
    expect(cmpVersion(null, '1.0.0')).toBeLessThan(0) // 본 적 없음 = 가장 오래된 것보다도 앞
    expect(cmpVersion('1.0.0', null)).toBeGreaterThan(0)
  })
})

describe('notesSince', () => {
  it('마지막으로 본 버전 이후만, 최신순으로 누적한다', () => {
    expect(notesSince('0.9.0', '0.9.2', NOTES).map((n) => n.version)).toEqual(['0.9.2', '0.9.1'])
  })
  it('아직 배포되지 않은(현재 버전보다 높은) 노트는 새지 않는다', () => {
    expect(notesSince('0.9.0', '0.9.1', NOTES).map((n) => n.version)).toEqual(['0.9.1'])
  })
  it('본 적 없으면(신규·초기화 전) 현재 버전까지 전부', () => {
    expect(notesSince(null, '0.9.2', NOTES).map((n) => n.version)).toEqual(['0.9.2', '0.9.1', '0.9.0'])
  })
  it('최신까지 다 봤으면 빈 배열', () => {
    expect(notesSince('0.9.2', '0.9.2', NOTES)).toEqual([])
  })
  it('본 버전이 노트보다 앞서 있어도(수동 설치 등) 터지지 않는다', () => {
    expect(notesSince('1.5.0', '0.9.2', NOTES)).toEqual([])
  })
})

describe('hasUnseen', () => {
  it('보여줄 노트가 있을 때만 참', () => {
    expect(hasUnseen('0.9.1', '0.9.2', NOTES)).toBe(true)
    expect(hasUnseen('0.9.2', '0.9.2', NOTES)).toBe(false)
  })
})

describe('UPDATE_NOTES 데이터', () => {
  it('최신순으로 정렬돼 있고 필수 필드를 갖는다', () => {
    expect(UPDATE_NOTES.length).toBeGreaterThan(0)
    for (const n of UPDATE_NOTES) {
      expect(typeof n.version).toBe('string')
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof n.body).toBe('string')
      expect(n.body.trim().length).toBeGreaterThan(0)
    }
    for (let i = 1; i < UPDATE_NOTES.length; i++) {
      expect(cmpVersion(UPDATE_NOTES[i - 1].version, UPDATE_NOTES[i].version)).toBeGreaterThan(0)
    }
  })
})

// ── 릴리즈마다 반드시 뜨게 하는 장치 ────────────────────────────
// 알림은 `seen < 설치된 버전` 일 때만 뜬다. 그래서 **버전만 올리고 노트를 안 적으면
// 조용히 아무것도 안 뜬다** — 실패가 눈에 안 보이는 종류라 사람 기억에 맡길 수 없다.
describe('릴리즈 알림 보장', () => {
  it('설치된 버전(manifest)의 노트가 반드시 있다 — 없으면 업데이트해도 안 뜬다', async () => {
    const manifest = (await import('../manifest.json')).default
    const hit = UPDATE_NOTES.find((n) => n.version === manifest.version)
    expect(
      hit,
      `manifest 는 v${manifest.version} 인데 그 버전 노트가 없습니다. ` +
      'src/lib/updateNotes.js 맨 앞에 항목을 추가하세요(안 그러면 업데이트 알림이 조용히 안 뜹니다).',
    ).toBeTruthy()
  })

  it('노트를 감춰도 다음 릴리즈에는 다시 뜬다 — 감추기는 그 버전 한정이다', () => {
    const N = [
      { version: '0.9.3', date: '2026-09-01', body: '다음' },
      { version: '0.9.2', date: '2026-08-18', body: '지금' },
    ]
    expect(hasUnseen('0.9.2', '0.9.2', N)).toBe(false) // '이번엔 넘기기' 를 누른 직후
    expect(hasUnseen('0.9.2', '0.9.3', N)).toBe(true) // 다음 버전이 깔리면 다시
  })

  it('스토어 미출시 버전은 알림을 유발하지 않는다 — 사용자에게 설치되지 않는다', () => {
    const N = [
      { version: '0.8.0', date: '2026-08-16', store: false, body: 'GitHub 전용' },
      { version: '0.7.0', date: '2026-08-14', body: '출시' },
    ]
    // 설치된 버전은 0.7.0 이므로 0.8.0 은 애초에 후보에 들지 않는다(notesSince 의 current 상한).
    expect(hasUnseen('0.7.0', '0.7.0', N)).toBe(false)
  })
})
