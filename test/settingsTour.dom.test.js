// @vitest-environment jsdom
// 설정 둘러보기 — 투어 스텝과 설정 마크업 사이의 계약.
//
// 이 투어가 조용히 죽는 경로는 하나다: 설정 모달의 마크업이 바뀌었는데 SETTINGS_TOUR 의 선택자를
// 같이 안 고치는 것. 그러면 스포트라이트가 아무것도 못 잡고 **에러 없이** 빈 카드만 뜬다.
// 그래서 선택자를 테스트에 다시 적지 않고 SETTINGS_TOUR 에서 그대로 가져와 맞춰 본다.
//
// 위치·크기는 jsdom 이 레이아웃을 안 하므로 못 잰다 — 실제 스포트라이트 배치는 브라우저 하네스로 확인한다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mountPanel, SETTINGS_TOUR } from '../src/content/panel/panel.js'

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
  await new Promise((r) => setTimeout(r, 30)) // 초기 렌더(refresh)가 한 바퀴 돌 시간
  return root
}
const openSettings = async () => {
  root.getElementById('ba-gear').click()
  await new Promise((r) => setTimeout(r, 10))
}
// 투어는 패널이 접혀 있으면 슬라이드인(.28s)이 끝나기를 기다렸다 뜬다 — 고정 대기로 재면 환경에 따라 흔들린다.
const waitForTour = async (ms = 800) => {
  for (let t = 0; t < ms; t += 20) {
    if (root.querySelector('.ba-tour-card')) return root.querySelector('.ba-tour-card')
    await new Promise((r) => setTimeout(r, 20))
  }
  return null
}

beforeEach(async () => {
  globalThis.__resetChromeMock()
  // ⚠ 배치·폭 캐시는 localStorage 에 있어 __resetChromeMock 이 못 지운다 — 안 지우면 앞 테스트에서
  //   바꾼 '왼쪽'이 다음 테스트의 시작 상태로 새어 든다(실제로 한 번 걸렸다).
  localStorage.clear()
  document.body.innerHTML = ''
  // 첫 실행 가이드가 1.2초 뒤 자동으로 뜨는 것을 막는다 — 여기서 보려는 건 설정 투어다.
  await chrome.storage.local.set({ tourDone: true, whatsNewSeen: '0.9.0' })
})
afterEach(() => { document.body.innerHTML = '' })

describe('설정 둘러보기가 기대는 마크업', () => {
  it('스텝마다 가리킬 항목이 정확히 하나 있다', async () => {
    await mount()
    await openSettings()
    expect(SETTINGS_TOUR.length).toBe(7)
    for (const step of SETTINGS_TOUR) {
      // 0개면 스포트라이트가 아무것도 못 잡고, 2개 이상이면 엉뚱한 쪽을 잡을 수 있다.
      expect(root.querySelectorAll(step.sel), `스텝 대상 없음/중복: ${step.sel}`).toHaveLength(1)
    }
  })

  it('항목 한 덩어리에 라벨과 세그먼트가 함께 들어 있다', async () => {
    await mount()
    await openSettings()
    for (const step of SETTINGS_TOUR) {
      const row = root.querySelector(step.sel)
      // 라벨만 또는 세그먼트만 비추면 '무엇에 대한 설명인지'가 화면에서 사라진다.
      expect(row.querySelector('.lbl'), `라벨 없음: ${step.sel}`).not.toBeNull()
      // 조작 요소는 세그먼트가 기본이지만 '섹션 순서'는 ▲▼ 목록이다(세그먼트로는 6가지 순열을 못 담는다).
      // 중요한 건 위젯 종류가 아니라 **라벨과 조작이 한 덩어리 안에 함께 있다**는 것이다.
      expect(row.querySelector('.ba-set-seg, .ba-secorder'), `조작 요소 없음: ${step.sel}`).not.toBeNull()
      expect(row.querySelector('.ba-lbl-help[data-tip]'), `? 도움말 없음: ${step.sel}`).not.toBeNull()
    }
  })

  it('감싸기가 설정 클릭 동작을 끊지 않는다 — 세그먼트가 여전히 잡힌다', async () => {
    await mount()
    await openSettings()
    const pick = root.getElementById('ba-folder-pick')
    // 핸들러는 pick 기준 후손 선택자로 걸린다. 래퍼가 생겨도 이것들이 다 잡혀야 한다.
    for (const attr of ['data-side', 'data-pw', 'data-nt', 'data-bv', 'data-hc', 'data-fz']) {
      expect(pick.querySelectorAll(`.ba-set-opt[${attr}]`).length, `핸들러 대상 없음: ${attr}`).toBeGreaterThan(0)
    }
    expect(pick.querySelectorAll('.ba-secorder-mv').length, '섹션 순서 ▲▼ 없음').toBe(6) // 3섹션 × 2방향
    // 실제로 눌러 값이 반영되는지 — 스포트라이트는 클릭을 막지 않으므로 투어 중에도 이 경로가 쓰인다.
    root.querySelector('.ba-set-opt[data-side="left"]').click()
    await new Promise((r) => setTimeout(r, 10))
    expect(root.getElementById('ba-root').getAttribute('data-side')).toBe('left')
  })

  it('다시 보기 진입점이 설정 안에 있다', async () => {
    await mount()
    await openSettings()
    expect(root.getElementById('ba-setting-guide')).not.toBeNull()
  })
})

describe('둘러보기로 데려오는 신호', () => {
  it('처음이면 ⚙ 에 점이 보이고, 둘러보기를 본 뒤에는 사라진다', async () => {
    await mount()
    expect(root.getElementById('ba-gear-dot').hidden).toBe(false)

    await chrome.storage.local.set({ settingsTourSeen: true })
    globalThis.__fireStorageChange({ settingsTourSeen: { newValue: true } })
    await new Promise((r) => setTimeout(r, 10))
    expect(root.getElementById('ba-gear-dot').hidden).toBe(true)
  })

  it('이미 본 사람에게는 처음부터 점이 없다', async () => {
    await chrome.storage.local.set({ settingsTourSeen: true })
    await mount()
    expect(root.getElementById('ba-gear-dot').hidden).toBe(true)
  })

  it('설정을 처음 열면 둘러보기가 자동으로 뜨고, 그때 본 것으로 기록된다', async () => {
    await mount()
    await openSettings()
    const card = await waitForTour()
    expect(card, '자동 둘러보기가 안 떴다').not.toBeNull()
    expect(card.querySelector('.ba-tour-step').textContent).toContain('설정')
    expect((await chrome.storage.local.get('settingsTourSeen')).settingsTourSeen).toBe(true)
  })

  it('두 번째로 열 때는 자동으로 뜨지 않는다', async () => {
    await chrome.storage.local.set({ settingsTourSeen: true })
    await mount()
    await openSettings()
    await new Promise((r) => setTimeout(r, 400)) // 뜰 시간을 충분히 주고도 안 떠야 한다
    expect(root.querySelector('.ba-tour-card')).toBeNull()
  })

  it('투어 중에 패널을 반대편으로 옮기면 카드도 따라간다', async () => {
    // 실측(하네스)에서 걸린 결함 — 설정을 눌러 패널이 왼쪽으로 갔는데 카드는 오른쪽에 남아 있었다.
    // jsdom 은 레이아웃을 안 해 좌표는 못 재지만, 카드가 **어느 쪽에 붙는지**(left/right)는 확인된다.
    await mount()
    await openSettings()
    const card = await waitForTour()
    expect(card.style.right).not.toBe('auto')
    expect(card.style.left).toBe('auto')

    root.querySelector('.ba-set-opt[data-side="left"]').click()
    await new Promise((r) => setTimeout(r, 20))
    expect(card.style.left, '카드가 반대편으로 안 옮겨졌다').not.toBe('auto')
    expect(card.style.right).toBe('auto')
  })

  it('메인 투어의 갈래로 다 본 사람에게는 점도 자동 시작도 다시 오지 않는다', async () => {
    // 갈래를 눌렀다 = 다섯 스텝을 실제로 봤다. 여기서 표시를 안 남기면 방금 다 본 사람에게
    // ⚙ 점이 그대로 남고, 다음에 설정을 열 때 같은 투어가 또 뜬다.
    await chrome.storage.local.remove(['tourDone', 'whatsNewSeen'])
    await mount()
    const card = await waitForTour(2500) // 첫 실행 가이드는 1.2초 뒤에 뜬다
    for (let n = 0; n < 30 && !card.querySelector('.ba-tour-branch'); n++) {
      card.querySelector('.ba-tour-next').click()
      await new Promise((r) => setTimeout(r, 15))
    }
    const branch = card.querySelector('.ba-tour-branch')
    expect(branch, '⚙ 스텝에 갈래 버튼이 없다').not.toBeNull()
    branch.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(card.querySelector('.ba-tour-title').textContent).toContain('패널 위치')
    expect((await chrome.storage.local.get('settingsTourSeen')).settingsTourSeen).toBe(true)
    expect(root.getElementById('ba-gear-dot').hidden).toBe(true)
  })

  it('이미 투어를 본 기존 사용자에게 새로워진 기능으로 한 번 알린다', async () => {
    // ⚠ 이게 이 기능의 조용한 실패 경로다: WHATS_NEW_VERSION 만 올리고 스텝의 since 를 안 올리면
    //    filter 가 빈 배열이라 **아무것도 안 뜨고 표시만 찍힌다.** 에러도 안 난다.
    await chrome.storage.local.set({ tourDone: true, whatsNewSeen: '0.9.0' })
    await mount()
    const card = await waitForTour(2500) // 1.2초 뒤에 뜬다
    expect(card, '새로워진 기능 안내가 안 떴다 — 스텝의 since 가 WHATS_NEW_VERSION 과 어긋났을 수 있다').not.toBeNull()
    expect(card.querySelector('.ba-tour-step').textContent).toContain('새로워진 기능')
    // 0.13.0 소식은 셋이다: 티어 칩(PoE2 전용) · 섹션 접기·순서 · 설정 둘러보기.
    // 셋 다 **화면만 봐선 알 수 없는 것**이라 말해 주지 않으면 영영 모른다 — 그게 이 배치의 기준이다.
    // 순서·개수를 숫자로 박지 않는다: 스텝을 하나 넣을 때마다 깨지고, 정작 봐야 할 건
    // "무엇이 들어 있고 어디서 끝나는가"다.
    const titles = []
    for (let n = 0; n < 10; n += 1) {
      const t = root.querySelector('.ba-tour-title')
      if (!t) break
      titles.push(t.textContent)
      const next = root.querySelector('.ba-tour-next')
      if (next.textContent === '완료') break
      next.click()
      await new Promise((r) => setTimeout(r, 40))
    }
    expect(titles.some((t) => t.includes('T1')), '티어 칩 소식이 없다').toBe(true)
    expect(titles.some((t) => t.includes('섹션')), '섹션 접기 소식이 없다').toBe(true)
    // 마지막 스텝은 설정 — 실제로 열리고 갈래가 있어야 한다.
    const last = root.querySelector('.ba-tour-card')
    expect(last.querySelector('.ba-tour-title').textContent).toContain('설정')
    expect(last.querySelector('.ba-tour-branch'), '갈래 버튼이 없다').not.toBeNull()
    expect(root.getElementById('ba-namebar').hidden, '설정 모달이 안 열렸다').toBe(false)
  })

  it('한 번 본 사람에게는 다시 뜨지 않고, 투어가 끝나면 모달도 닫힌다', async () => {
    await chrome.storage.local.set({ tourDone: true, whatsNewSeen: '0.9.0' })
    await mount()
    const card = await waitForTour(2500)
    const seenVer = () => chrome.storage.local.get('whatsNewSeen').then((r) => r.whatsNewSeen)
    expect(await seenVer()).toBe('0.9.0')
    // 스텝 수를 박지 않고 '완료'가 나올 때까지 넘긴다 — 소식이 늘어도 이 테스트가 보는 건
    // "끝까지 가면 카드가 닫히고 모달도 되닫히는가"다.
    for (let n = 0; n < 10; n += 1) {
      const c = root.querySelector('.ba-tour-card')
      if (!c) break
      c.querySelector('.ba-tour-next').click()
      await new Promise((r) => setTimeout(r, 40))
    }
    expect(root.querySelector('.ba-tour-card')).toBeNull()
    // 투어가 연 모달은 투어가 되닫는다 — 사용자가 연 게 아니므로 남기면 안 된다.
    expect(root.getElementById('ba-namebar').hidden, '투어가 연 모달이 안 닫혔다').toBe(true)
    const ver = await seenVer()
    expect(ver).not.toBe('0.9.0')

    // 같은 값이 저장됐으니 다시 마운트해도 안 뜬다
    document.body.innerHTML = ''
    await mount()
    await new Promise((r) => setTimeout(r, 1600))
    expect(root.querySelector('.ba-tour-card')).toBeNull()
  })

  it('둘러보기는 첫 실행 가이드를 본 것으로 기록하지 않는다', async () => {
    // ⚠ 이게 깨지면 둘러보기만 본 신규 사용자가 본 투어를 영영 못 본다.
    await chrome.storage.local.remove(['tourDone', 'whatsNewSeen'])
    await mount()
    root.getElementById('ba-gear').click()          // 자동 둘러보기 시작
    const card = await waitForTour()
    card.querySelector('.ba-tour-skip').click()      // 끝까지 안 보고 닫아도 마찬가지
    await new Promise((r) => setTimeout(r, 10))
    expect((await chrome.storage.local.get('tourDone')).tourDone).toBeUndefined()
  })
})
