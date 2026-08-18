// @vitest-environment jsdom
// 업데이트 노트 페이지 마크업 — 노트 문구는 사람이 손으로 쓰므로 이스케이프가 실질 방어선이다.
import { describe, it, expect } from 'vitest'
import { notesHtml } from '../src/update/update.js'

const parse = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d }

describe('업데이트 노트 페이지', () => {
  it('버전마다 태그·제목·날짜·항목을 렌더한다', () => {
    const el = parse(notesHtml([
      { version: '0.9.2', date: '2026-08-18', title: '폴더 수정', items: ['가', '나'] },
      { version: '0.9.1', date: '2026-08-17', items: ['다'] },
    ], '0.9.2', 'icon.png'))
    expect([...el.querySelectorAll('.up-tag')].map((e) => e.textContent)).toEqual(['v0.9.2', 'v0.9.1'])
    expect(el.querySelector('.up-ver-title').textContent).toBe('폴더 수정')
    expect([...el.querySelectorAll('.up-items li')].map((e) => e.textContent)).toEqual(['가', '나', '다'])
    expect(el.querySelector('.up-title small').textContent).toContain('0.9.2')
  })

  it('제목이 없는 버전도 깨지지 않는다', () => {
    const el = parse(notesHtml([{ version: '0.9.1', date: '2026-08-17', items: ['다'] }], '0.9.1', 'i.png'))
    expect(el.querySelector('.up-ver-title')).toBeNull()
    expect(el.querySelectorAll('.up-ver').length).toBe(1)
  })

  it('보여줄 노트가 없으면 빈 상태 안내', () => {
    const el = parse(notesHtml([], '0.9.2', 'i.png'))
    expect(el.querySelector('.up-empty')).toBeTruthy()
    expect(el.querySelectorAll('.up-ver').length).toBe(0)
  })

  it('노트 문구의 HTML은 이스케이프된다 — 마크업으로 해석되지 않는다', () => {
    const el = parse(notesHtml([{ version: '1.0.0', date: '2026-01-01', title: '<img src=x onerror=1>', items: ['<script>bad()</script>'] }], '1.0.0', 'i.png'))
    expect(el.querySelectorAll('script, img[src="x"]').length).toBe(0)
    expect(el.querySelector('.up-items li').textContent).toBe('<script>bad()</script>')
  })
})
