// @vitest-environment jsdom
// 상단 간결 모드 — 자리는 줄이되 **기능은 하나도 잃지 않는가**.
//
// 배경(제보 2026-09-04): "젤 위 타이틀이랑 저장, 시세 등등도 하단으로 내리거나 숨김 기능있었으면."
// 목적은 목록에 자리를 내주는 것이라 숨기는 쪽을 골랐다. 다만 그냥 다 숨기면 두 가지를 잃는다:
//   · 현재 검색 저장 — 핵심 동작이다. Alt+S 를 모르는 사용자에겐 기능이 통째로 사라진 것이 된다.
//   · ⌨ 단축키 칩 — 단축키 목록이 그 팝오버에만 있다. 숨기면 Alt+S·Alt+K 를 볼 곳이 아예 없어진다.
// 그래서 ⌨ 는 숨기는 대신 **옮긴다**. 이 파일은 그 이동이 양방향으로 되는지를 지킨다.
//
// 실제로 시세·동향이 화면에서 사라지는지는 CSS 라 jsdom 이 못 잰다 — 브라우저 하네스로 확인한다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mountPanel } from '../src/content/panel/panel.js'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) globalThis.CSS = { escape: (s) => String(s) }

let root
const mount = async () => {
  mountPanel({
    game: 'poe2', league: 'New',
    getLeagueMap: () => ({ New: '현재 리그' }),
    getCurrentSearch: () => null,
    migrateSearch: async () => null,
    applyConditionSet: async () => ({ ok: true }),
    getStatMap: () => ({}),
    tourDemo: { show() {}, hide() {} },
  })
  root = document.getElementById('ba-panel-host').shadowRoot
  await new Promise((r) => setTimeout(r, 30))
  return root
}
const openSettings = async () => {
  root.getElementById('ba-gear').click()
  await new Promise((r) => setTimeout(r, 10))
}
const pickHc = (v) => root.querySelector(`.ba-set-opt[data-hc="${v}"]`)
const compact = () => root.getElementById('ba-root').getAttribute('data-headcompact')

beforeEach(async () => {
  globalThis.__resetChromeMock()
  localStorage.clear()
  document.body.innerHTML = ''
  // 첫 실행 가이드·새 기능 안내가 끼어들지 않게
  await chrome.storage.local.set({ tourDone: true, settingsTourSeen: true, whatsNewSeen: '99.0.0' })
})
afterEach(() => { document.body.innerHTML = '' })

describe('상단 간결 모드', () => {
  it('기본은 표시 — 아무것도 달라지지 않는다', async () => {
    await mount()
    expect(compact()).toBeNull()
    expect(root.querySelector('.ba-kbd-wrap').closest('.ba-brand'), '⌨ 는 브랜드 줄에 있다').toBeTruthy()
  })

  it('간결을 고르면 속성이 붙고 storage 에 남는다', async () => {
    await mount(); await openSettings()
    pickHc('1').click()
    await new Promise((r) => setTimeout(r, 10))
    expect(compact()).toBe('1')
    expect((await chrome.storage.local.get('uiHeadCompact')).uiHeadCompact).toBe(true)
  })

  it('저장 버튼은 남는다 — 숨기면 Alt+S 를 모르는 사용자가 기능을 잃는다', async () => {
    await mount(); await openSettings()
    pickHc('1').click()
    await new Promise((r) => setTimeout(r, 10))
    const save = root.getElementById('ba-save')
    expect(save, '저장 버튼이 사라졌다').toBeTruthy()
    expect(save.closest('.ba-head'), '저장이 숨겨지는 .ba-head 안으로 들어갔다').toBeNull()
  })

  it('⌨ 단축키 칩은 econ 행으로 옮겨간다 — 마크업은 한 벌이다', async () => {
    await mount(); await openSettings()
    pickHc('1').click()
    await new Promise((r) => setTimeout(r, 10))
    expect(root.querySelectorAll('.ba-kbd-wrap').length, '칩이 복제됐다').toBe(1)
    const kbd = root.querySelector('.ba-kbd-wrap')
    expect(kbd.closest('.ba-econ-row'), '⌨ 가 econ 행으로 안 옮겨졌다').toBeTruthy()
    // 팝오버가 칩과 함께 따라갔는지 — 떨어지면 단축키 목록이 통째로 안 뜬다
    expect(kbd.querySelector('.ba-kbd-pop')).toBeTruthy()
  })

  it('표시로 되돌리면 ⌨ 가 원래 자리(제작 칩 앞)로 돌아온다', async () => {
    await mount(); await openSettings()
    pickHc('1').click(); await new Promise((r) => setTimeout(r, 10))
    pickHc('0').click(); await new Promise((r) => setTimeout(r, 10))
    expect(compact()).toBeNull()
    const brand = root.querySelector('.ba-brand')
    const kids = [...brand.children].map((c) => c.className.split(' ')[0])
    expect(kids).toEqual(['ba-brand-logo', 'ba-brand-tx', 'ba-kbd-wrap', 'ba-foot-chip-wrap', 'ba-donate'])
    expect((await chrome.storage.local.get('uiHeadCompact')).uiHeadCompact).toBe(false)
  })

  it('첫 프레임부터 간결로 그리도록 localStorage 거울에도 쓴다', async () => {
    await mount(); await openSettings()
    pickHc('1').click()
    await new Promise((r) => setTimeout(r, 10))
    expect(JSON.parse(localStorage.getItem('baPanelLayout')).headCompact).toBe(true)
  })

  it('저장된 값이 있으면 마운트하자마자 간결로 뜬다 — 보였다 사라지지 않는다', async () => {
    localStorage.setItem('baPanelLayout', JSON.stringify({ side: 'right', width: 384, headCompact: true }))
    await mount()
    expect(compact()).toBe('1')
    expect(root.querySelector('.ba-kbd-wrap').closest('.ba-econ-row')).toBeTruthy()
  })
})
