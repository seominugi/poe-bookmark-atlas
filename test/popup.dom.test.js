// @vitest-environment jsdom
// 팝업 — 지금까지 자동 검증이 전혀 없던 표면이다. 그 공백에서 회귀가 하나 나왔다:
// '영문 거래소 접근 다시 켜기' 를 hidden 으로 숨겼는데 `.pop-btn { display: flex }` 가 이겨
// **빈 pill 이 남았다**(제보 2026-08-18). 제보로만 드러났고 커밋 전에는 아무도 몰랐다.
//
// popup.js 는 import 시점에 DOM 을 조립하므로, 시나리오마다 resetModules + 동적 import 로 다시 태운다.
import { describe, it, expect, beforeEach, vi } from 'vitest'

function mockChrome({ granted = true, tradeTab = true } = {}) {
  const calls = { create: [], reload: [], sendMessage: [], request: 0, set: [], closed: 0 }
  // 팝업 버튼은 대부분 마지막에 window.close() 를 부른다. jsdom 에서 이건 **진짜로 창을 닫아**
  // 다음 테스트의 document 를 무효로 만든다 → 스텁으로 덮고, 닫았는지도 함께 확인한다.
  window.close = () => { calls.closed++ }
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: '0.9.2' }),
      sendMessage: async (m) => { calls.sendMessage.push(m); return { ok: true } },
    },
    tabs: {
      query: async () => [{ id: 7, url: tradeTab ? 'https://poe.kakaogames.com/trade/search/Standard' : 'https://example.com/' }],
      create: async (o) => { calls.create.push(o) },
      reload: async (id) => { calls.reload.push(id) },
      sendMessage: async (_id, m) => { calls.sendMessage.push(m); return tradeTab ? { ok: true } : undefined },
    },
    storage: { local: { async get() { return {} }, async set(o) { calls.set.push(o) } } },
    permissions: {
      contains: async () => granted,
      request: async () => { calls.request++; return true },
    },
  }
  return calls
}

async function mountPopup(opts) {
  document.body.innerHTML = '<div id="app"></div>'
  const calls = mockChrome(opts)
  vi.resetModules()
  await import('../src/popup/popup.js')
  await new Promise((r) => setTimeout(r, 0)) // renderGlobalBtn 등 비동기 마무리
  return calls
}

beforeEach(() => { document.body.innerHTML = '' })

describe('팝업 렌더', () => {
  it('핵심 버튼이 모두 있고 버전이 표시된다', async () => {
    await mountPopup()
    expect(document.getElementById('pop-toggle')).toBeTruthy()
    expect(document.getElementById('pop-tour')).toBeTruthy()
    expect(document.getElementById('pop-notes')).toBeTruthy()
    expect(document.querySelector('.pop-title small').textContent).toContain('0.9.2')
  })

  // 이번 회귀를 고정한다 — '보이는데 내용이 빈' 요소는 거의 항상 버그다.
  // hidden 을 썼다가 display 규칙에 지는 유형을 표면 전체에서 잡는다.
  it('내용이 빈 버튼·링크가 화면에 남지 않는다 (빈 pill 회귀)', async () => {
    await mountPopup({ granted: true })
    const empties = [...document.querySelectorAll('.pop button, .pop a')].filter((el) => {
      if (el.hidden && getComputedStyle(el).display === 'none') return false // 진짜로 숨겨진 것은 제외
      return !el.textContent.trim() && !el.querySelector('img, svg')
    })
    expect(empties.map((e) => e.id || e.className)).toEqual([])
  })

  it('권한이 있으면 영문 거래소 버튼은 DOM 에서 사라진다', async () => {
    await mountPopup({ granted: true })
    expect(document.getElementById('pop-global')).toBeNull()
  })

  it('권한이 없으면 그 버튼이 문구를 갖고 나타난다', async () => {
    await mountPopup({ granted: false })
    const btn = document.getElementById('pop-global')
    expect(btn).toBeTruthy()
    expect(btn.textContent.trim()).not.toBe('')
    expect(btn.disabled).toBe(false)
  })
})

describe('팝업 액션', () => {
  it('업데이트 노트 버튼은 전체 이력 요청을 보낸다', async () => {
    const calls = await mountPopup()
    document.getElementById('pop-notes').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.sendMessage).toContainEqual({ type: 'ba-open-update', all: true })
    expect(calls.closed).toBe(1) // 노트를 새 탭으로 보냈으면 팝업은 닫힌다
  })

  it('권한 버튼은 permissions.request 를 부르고, 허용되면 영문 거래소 탭을 새로고침한다', async () => {
    const calls = await mountPopup({ granted: false, tradeTab: true })
    globalThis.chrome.tabs.query = async () => [{ id: 7, url: 'https://www.pathofexile.com/trade/search/Standard' }]
    document.getElementById('pop-global').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.request).toBe(1)
    expect(calls.reload).toContain(7)
  })
})
