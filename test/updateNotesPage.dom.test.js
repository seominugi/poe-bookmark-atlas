// @vitest-environment jsdom
// 업데이트 노트 페이지 — 본문은 GitHub 릴리즈 노트 마크다운을 그대로 싣는다.
// 렌더러가 이스케이프를 먼저 하지 않으면 노트 한 줄이 마크업이 되므로, 그 순서를 테스트가 고정한다.
import { describe, it, expect } from 'vitest'
import { notesHtml, mdToHtml } from '../src/update/update.js'

const parse = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d }

describe('업데이트 노트 페이지', () => {
  it('버전마다 태그·제목·날짜·본문을 렌더한다', () => {
    const el = parse(notesHtml([
      { version: '0.9.2', date: '2026-08-18', title: '폴더 수정', body: '- 가\n- 나' },
      { version: '0.9.1', date: '2026-08-17', body: '- 다' },
    ], '0.9.2', 'icon.png'))
    expect([...el.querySelectorAll('.up-tag')].map((e) => e.textContent)).toEqual(['v0.9.2', 'v0.9.1'])
    expect(el.querySelector('.up-ver-title').textContent).toBe('폴더 수정')
    expect([...el.querySelectorAll('.up-body li')].map((e) => e.textContent)).toEqual(['가', '나', '다'])
    expect(el.querySelector('.up-title small').textContent).toContain('0.9.2')
  })

  it('제목이 없는 버전도 깨지지 않는다', () => {
    const el = parse(notesHtml([{ version: '0.9.1', date: '2026-08-17', body: '- 다' }], '0.9.1', 'i.png'))
    expect(el.querySelector('.up-ver-title')).toBeNull()
    expect(el.querySelectorAll('.up-ver').length).toBe(1)
  })

  it('아직 안 본 버전에만 NEW 배지', () => {
    const el = parse(notesHtml([
      { version: '0.9.2', date: '2026-08-18', body: 'a' },
      { version: '0.9.1', date: '2026-08-17', body: 'b' },
    ], '0.9.2', 'i.png', '0.9.1'))
    const secs = [...el.querySelectorAll('.up-ver')]
    expect(secs[0].querySelector('.up-new')).toBeTruthy()
    expect(secs[1].querySelector('.up-new')).toBeNull()
  })

  it('보여줄 노트가 없으면 빈 상태 안내', () => {
    const el = parse(notesHtml([], '0.9.2', 'i.png'))
    expect(el.querySelector('.up-empty')).toBeTruthy()
    expect(el.querySelectorAll('.up-ver').length).toBe(0)
  })

  it('노트 문구의 HTML은 이스케이프된다 — 마크업으로 해석되지 않는다', () => {
    const el = parse(notesHtml([{ version: '1.0.0', date: '2026-01-01', title: '<img src=x onerror=1>', body: '- <script>bad()</script>' }], '1.0.0', 'i.png'))
    expect(el.querySelectorAll('script, img[src="x"]').length).toBe(0)
    expect(el.querySelector('.up-body li').textContent).toBe('<script>bad()</script>')
  })
})

describe('mdToHtml — 릴리즈 노트 문법', () => {
  const p = (md) => { const d = document.createElement('div'); d.innerHTML = mdToHtml(md); return d }

  it('소제목·불릿·굵게·코드·인용·구분선·문단', () => {
    const el = p('## 고친 것\n\n- **굵은** 항목\n- `코드` 항목\n\n> 인용 한 줄\n\n---\n\n평범한 문단')
    expect(el.querySelector('h3').textContent).toBe('고친 것')
    expect(el.querySelectorAll('li').length).toBe(2)
    expect(el.querySelector('li strong').textContent).toBe('굵은')
    expect(el.querySelector('li code').textContent).toBe('코드')
    expect(el.querySelector('blockquote').textContent).toContain('인용 한 줄')
    expect(el.querySelector('hr')).toBeTruthy()
    // 최상위 문단만 본다 — blockquote 안에도 <p> 가 있다
    const paras = [...el.children].filter((c) => c.tagName === 'P')
    expect(paras.map((x) => x.textContent)).toEqual(['평범한 문단'])
  })

  it('### 는 h4 로', () => {
    expect(p('### 작은 제목').querySelector('h4').textContent).toBe('작은 제목')
  })

  it('https 링크만 a 태그가 된다 — javascript: 는 텍스트로 남는다', () => {
    const ok = p('[네이버 카페](https://cafe.naver.com/seominugi)')
    expect(ok.querySelector('a').getAttribute('href')).toBe('https://cafe.naver.com/seominugi')
    expect(ok.querySelector('a').rel).toBe('noopener')
    const bad = p('[클릭](javascript:alert(1))')
    expect(bad.querySelector('a')).toBeNull()
    expect(bad.textContent).toContain('[클릭]')
  })

  it('본문 속 HTML 은 태그가 되지 않는다', () => {
    const el = p('- <b>진하게</b> 시도\n- <img src=x onerror=alert(1)>')
    expect(el.querySelectorAll('b, img').length).toBe(0)
    expect(el.textContent).toContain('<b>진하게</b>')
  })

  it('빈 입력도 안전', () => {
    expect(mdToHtml('')).toBe('')
    expect(mdToHtml(null)).toBe('')
  })
})

describe('목업 지시자', () => {
  const p = (md) => { const d = document.createElement('div'); d.innerHTML = mdToHtml(md); return d }

  it('[[mock:키]] 는 목업으로 치환된다', () => {
    const el = p('앞 문단\n\n[[mock:live-open]]\n\n뒤 문단')
    const fig = el.querySelector('figure.up-mock')
    expect(fig).toBeTruthy()
    expect(fig.querySelector('figcaption')).toBeTruthy()
    expect(el.textContent).toContain('라이브로 열기')
    expect(el.textContent).not.toContain('[[mock:') // 지시자가 글자로 새지 않는다
  })

  it('모르는 키는 조용히 무시한다 — 노트가 깨지는 것보다 낫다', () => {
    const el = p('앞\n\n[[mock:없는키]]\n\n뒤')
    expect(el.querySelector('figure.up-mock')).toBeNull()
    expect(el.textContent).not.toContain('[[mock:')
    expect(el.textContent).toContain('앞')
    expect(el.textContent).toContain('뒤')
  })

  it('실제 노트에 심어둔 목업이 모두 정의돼 있다', async () => {
    const { UPDATE_NOTES } = await import('../src/lib/updateNotes.js')
    const { MOCKUPS } = await import('../src/update/mockups.js')
    const used = new Set()
    for (const n of UPDATE_NOTES) for (const m of n.body.matchAll(/\[\[mock:([a-z0-9-]+)\]\]/g)) used.add(m[1])
    expect(used.size).toBeGreaterThan(0)
    expect([...used].filter((k) => !MOCKUPS[k])).toEqual([]) // 오타로 빈 자리가 생기지 않게
  })
})
