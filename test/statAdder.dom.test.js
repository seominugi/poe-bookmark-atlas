// @vitest-environment jsdom
// stat-adder.js (MAIN world) — 그룹 컴포넌트의 selectFilter 로 능력치를 넣고, 값은 updateFilter 로 채운다.
// 실제 거래소 컴포넌트 대신 같은 모양의 가짜(__vue__)를 단다. 모양은 2026-09-15 라이브·번들에서 확인한 것:
//   selectFilter({id}) · updateFilter(index, {min,max}) · group.id · $store.state.persistent.stats[group.id].filters · availableOptionsFlat

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

function fakeGroup(token, { existing = [], options = ['explicit.stat_1', 'explicit.stat_2', 'explicit.stat_3'] } = {}) {
  const el = document.createElement('div')
  el.className = 'filter-group'
  el.dataset.baGroupToken = token
  const filters = existing.map((id) => ({ id }))
  const calls = []
  const updates = []
  el.__vue__ = {
    group: { id: 0 },
    $store: { state: { persistent: { stats: [{ type: 'and', filters }] } } },
    availableOptionsFlat: Object.fromEntries(options.map((id) => [id, { id }])),
    selectFilter: ({ id }) => { calls.push(id); filters.push({ id }) },
    updateFilter: (index, value) => { updates.push([index, value]); filters[index] = { ...filters[index], value } },
  }
  document.body.appendChild(el)
  return { calls, updates, filters }
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

const req = (reqId, token, items) => ({ __baSource: 'ba-content', kind: 'add-stat-filters', reqId, token, items })

beforeAll(async () => { await import('../src/content/stat-adder.js') })
beforeEach(() => { document.body.innerHTML = '' })

describe('stat-adder', () => {
  it('고른 id 를 순서대로 selectFilter 에 넣고 added 로 돌려준다', async () => {
    const g = fakeGroup('gtoken01')
    const reply = nextReply('r1')
    send(req('r1', 'gtoken01', [{ id: 'explicit.stat_2', value: null }, { id: 'explicit.stat_1' }]))
    const r = await reply
    expect(g.calls).toEqual(['explicit.stat_2', 'explicit.stat_1'])
    expect(g.updates).toEqual([])
    expect(r).toMatchObject({ kind: 'stat-filters-added', added: ['explicit.stat_2', 'explicit.stat_1'], valued: [], skipped: [] })
    expect(r.error).toBeUndefined()
  })

  it('값이 있으면 방금 넣은 행의 위치로 updateFilter 를 부른다', async () => {
    const g = fakeGroup('gtoken06', { existing: ['explicit.stat_9x'], options: ['explicit.stat_1', 'explicit.stat_2', 'explicit.stat_9x'] })
    const reply = nextReply('r6')
    send(req('r6', 'gtoken06', [{ id: 'explicit.stat_1', value: { min: 31 } }, { id: 'explicit.stat_2', value: { min: 5, max: 10 } }]))
    const r = await reply
    expect(g.updates).toEqual([[1, { min: 31 }], [2, { min: 5, max: 10 }]])
    expect(r.valued).toEqual(['explicit.stat_1', 'explicit.stat_2'])
    expect(g.filters.map((f) => f.value ?? null)).toEqual([null, { min: 31 }, { min: 5, max: 10 }])
  })

  it('숫자가 아닌 값은 버리고 행만 넣는다', async () => {
    const g = fakeGroup('gtoken07')
    const reply = nextReply('r7')
    send(req('r7', 'gtoken07', [{ id: 'explicit.stat_1', value: { min: '31', max: NaN, foo: 1 } }, { id: 'explicit.stat_2', value: { max: Infinity } }]))
    const r = await reply
    expect(g.calls).toEqual(['explicit.stat_1', 'explicit.stat_2'])
    expect(g.updates).toEqual([])
    expect(r.valued).toEqual([])
  })

  it('이미 있는 것 · 거래소가 모르는 것 · 모양이 이상한 id 는 넣지 않고 이유를 단다', async () => {
    const g = fakeGroup('gtoken02', { existing: ['explicit.stat_1'] })
    const reply = nextReply('r2')
    const ids = ['explicit.stat_1', 'explicit.stat_9', 'x"]; alert(1)', 'explicit.stat_3', 'explicit.stat_3']
    send(req('r2', 'gtoken02', ids.map((id) => ({ id }))))
    const r = await reply
    expect(g.calls).toEqual(['explicit.stat_3'])
    expect(r.skipped.map((s) => s.reason)).toEqual(['have', 'unknown', 'bad-id', 'have'])
  })

  it('그룹을 못 찾으면 no-group', async () => {
    const reply = nextReply('r3')
    send(req('r3', 'nosuchgroup', [{ id: 'explicit.stat_1' }]))
    expect((await reply).error).toBe('no-group')
  })

  it('token 모양이 이상하거나 items 가 없으면 DOM 을 조회하지 않고 bad-request', async () => {
    fakeGroup('gtoken04')
    const reply = nextReply('r4')
    send(req('r4', 'g"],[x', [{ id: 'explicit.stat_1' }]))
    expect((await reply).error).toBe('bad-request')
    const reply2 = nextReply('r4b')
    send({ __baSource: 'ba-content', kind: 'add-stat-filters', reqId: 'r4b', token: 'gtoken04', ids: ['explicit.stat_1'] })
    expect((await reply2).error).toBe('bad-request')
  })

  it('다른 출처의 메시지는 무시한다', async () => {
    const g = fakeGroup('gtoken05')
    window.dispatchEvent(new MessageEvent('message', { data: req('r5', 'gtoken05', [{ id: 'explicit.stat_1' }]), origin: 'https://evil.example', source: window }))
    window.dispatchEvent(new MessageEvent('message', { data: { ...req('r5', 'gtoken05', [{ id: 'explicit.stat_1' }]), __baSource: 'other' }, origin: location.origin, source: window }))
    await new Promise((r) => setTimeout(r, 20))
    expect(g.calls).toEqual([])
  })
})
