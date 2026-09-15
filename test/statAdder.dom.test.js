// @vitest-environment jsdom
// stat-adder.js (MAIN world) — 그룹 컴포넌트의 selectFilter 로 능력치를 넣고 결과를 돌려준다.
// 실제 거래소 컴포넌트 대신 같은 모양의 가짜(__vue__)를 단다. 모양은 2026-09-15 라이브에서 확인한 것:
//   selectFilter({id}) · group.id · $store.state.persistent.stats[group.id].filters · availableOptionsFlat

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

function fakeGroup(token, { existing = [], options = ['explicit.stat_1', 'explicit.stat_2', 'explicit.stat_3'] } = {}) {
  const el = document.createElement('div')
  el.className = 'filter-group'
  el.dataset.baGroupToken = token
  const filters = existing.map((id) => ({ id }))
  const calls = []
  el.__vue__ = {
    group: { id: 0 },
    $store: { state: { persistent: { stats: [{ type: 'and', filters }] } } },
    availableOptionsFlat: Object.fromEntries(options.map((id) => [id, { id }])),
    selectFilter: ({ id }) => { calls.push(id); filters.push({ id }) },
  }
  document.body.appendChild(el)
  return calls
}

// jsdom 의 postMessage 는 origin 이 비고 source 가 null 일 수 있다 — 스크립트가 보는 조건을 그대로 맞춰 쏜다.
function send(data) {
  window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: window }))
}

function nextReply(reqId) {
  return new Promise((resolve) => {
    const on = (e) => {
      if (e.data?.__baSource === 'ba-bridge' && e.data.reqId === reqId) { window.removeEventListener('message', on); resolve(e.data) }
    }
    window.addEventListener('message', on)
  })
}

beforeAll(async () => { await import('../src/content/stat-adder.js') })
beforeEach(() => { document.body.innerHTML = '' })

describe('stat-adder', () => {
  it('고른 id 를 순서대로 selectFilter 에 넣고 added 로 돌려준다', async () => {
    const calls = fakeGroup('gtoken01')
    const reply = nextReply('r1')
    send({ __baSource: 'ba-content', kind: 'add-stat-filters', reqId: 'r1', token: 'gtoken01', ids: ['explicit.stat_2', 'explicit.stat_1'] })
    const r = await reply
    expect(calls).toEqual(['explicit.stat_2', 'explicit.stat_1'])
    expect(r).toMatchObject({ kind: 'stat-filters-added', added: ['explicit.stat_2', 'explicit.stat_1'], skipped: [] })
    expect(r.error).toBeUndefined()
  })

  it('이미 있는 것 · 거래소가 모르는 것 · 모양이 이상한 id 는 넣지 않고 이유를 단다', async () => {
    const calls = fakeGroup('gtoken02', { existing: ['explicit.stat_1'] })
    const reply = nextReply('r2')
    send({ __baSource: 'ba-content', kind: 'add-stat-filters', reqId: 'r2', token: 'gtoken02', ids: ['explicit.stat_1', 'explicit.stat_9', 'x"]; alert(1)', 'explicit.stat_3', 'explicit.stat_3'] })
    const r = await reply
    expect(calls).toEqual(['explicit.stat_3'])
    expect(r.skipped.map((s) => s.reason)).toEqual(['have', 'unknown', 'bad-id', 'have'])
  })

  it('그룹을 못 찾으면 no-group', async () => {
    const reply = nextReply('r3')
    send({ __baSource: 'ba-content', kind: 'add-stat-filters', reqId: 'r3', token: 'nosuchgroup', ids: ['explicit.stat_1'] })
    expect((await reply).error).toBe('no-group')
  })

  it('token 모양이 이상하면 DOM 을 조회하지 않고 bad-request', async () => {
    fakeGroup('gtoken04')
    const reply = nextReply('r4')
    send({ __baSource: 'ba-content', kind: 'add-stat-filters', reqId: 'r4', token: 'g"],[x', ids: ['explicit.stat_1'] })
    expect((await reply).error).toBe('bad-request')
  })

  it('다른 출처의 메시지는 무시한다', async () => {
    const calls = fakeGroup('gtoken05')
    window.dispatchEvent(new MessageEvent('message', { data: { __baSource: 'ba-content', kind: 'add-stat-filters', reqId: 'r5', token: 'gtoken05', ids: ['explicit.stat_1'] }, origin: 'https://evil.example', source: window }))
    window.dispatchEvent(new MessageEvent('message', { data: { __baSource: 'other', kind: 'add-stat-filters', reqId: 'r5', token: 'gtoken05', ids: ['explicit.stat_1'] }, origin: location.origin, source: window }))
    await new Promise((r) => setTimeout(r, 20))
    expect(calls).toEqual([])
  })
})
