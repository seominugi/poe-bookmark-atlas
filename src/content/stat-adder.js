// stat-adder.js (MAIN world)
// 속성 목록에서 고른 능력치를 거래소 능력치 그룹에 넣는다 — 새로고침·검색 없이.
//
// 왜 MAIN world + Vue 인스턴스인가 (stat-shortcut.js 와 같은 이유):
//   콘텐츠 스크립트(ISOLATED)는 el.__vue__ 를 볼 수 없다. **거래소 화면이 스스로 부르는 메서드만** 부른다 —
//   그래서 거래소가 직접 고른 것과 결과가 같다(행이 생기고 주소가 바뀌고 검색은 안 돈다). 2026-09-15 번들·라이브 확인:
//     그룹 컴포넌트   selectFilter({id})            드롭다운에서 능력치 고르기
//                     updateFilter(index,{min,max}) 행 입력칸에 숫자 치기
//                     updateFloat('min','1')         그룹 헤더의 최소칸에 숫자 치기(개수 그룹의 N)
//     그룹 추가 목록  selectStatGroup({type})        「+ 능력치 그룹 추가」 에서 방식 고르기
//     유형 필터 그룹  updateFilter(index,{option})   아이템 유형·희귀도 드롭다운에서 고르기 (2026-09-16 라이브 확인:
//                     필터 컴포넌트의 updateOption 이 그대로 이 메서드를 부른다. index 는 group.filters 안 순번)
//
// ⚠ 이 파일은 import 를 쓰면 안 된다. MAIN world 에는 chrome.runtime 이 없어 번들러의 import 로더가 깨진다.
//
// 요청: { __baSource:'ba-content', kind:'add-stat-filters', reqId, token, items:[{id, value, role}], typeFilters? }
//   role — 'here'(누른 그룹) · 'and'(필수: 모두 만족 그룹) · 'or'(하나 이상: 개수 그룹, 최소 1)
//   typeFilters — { category?, rarity? } 거래소 옵션 id. category 는 다르면 바꾸고, rarity 는 「모두」일 때만 채운다
//                 (사용자가 직접 고른 희귀도를 덮지 않는다).
// 응답: { __baSource:'ba-bridge', kind:'stat-filters-added', reqId, added, valued, skipped, created, typed, error? }
//   token — 콘텐츠 스크립트가 그룹 요소에 달아 둔 data-ba-group-token. 두 world 가 공유하는 건 DOM 뿐이다.
(() => {
  const ORIGIN = location.origin
  const TOKEN_RE = /^[a-z0-9]{6,40}$/
  const ID_RE = /^[a-z]+\.[a-z0-9_]+$/ // explicit.stat_1573130764 · pseudo.pseudo_total_life
  const MAX_ITEMS = 40
  const ROLES = new Set(['here', 'and', 'or'])

  /** {min,max} 중 유한한 숫자만 남긴다. 남는 게 없으면 null. */
  const cleanValue = (v) => {
    if (!v || typeof v !== 'object') return null
    const out = {}
    for (const k of ['min', 'max']) if (typeof v[k] === 'number' && Number.isFinite(v[k])) out[k] = v[k]
    return Object.keys(out).length ? out : null
  }

  const vms = () => [...new Set([...document.querySelectorAll('.filter-group, .multiselect')].map((e) => e.__vue__).filter(Boolean))]
  const groupVmAt = (index) => vms().find((v) => typeof v.selectFilter === 'function' && v.group && v.group.id === index) || null
  const statsOf = (vm) => (vm && vm.$store && vm.$store.state && vm.$store.state.persistent && vm.$store.state.persistent.stats) || []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  /** 새 그룹을 만들고 그 그룹 컴포넌트가 화면에 생길 때까지 기다린다. 못 만들면 null. */
  async function createGroup(anyVm, type) {
    const adder = [...new Set([...document.querySelectorAll('*')].map((e) => e.__vue__).filter(Boolean))]
      .find((v) => typeof v.selectStatGroup === 'function')
    if (!adder) return null
    const index = statsOf(anyVm).length
    adder.selectStatGroup({ type })
    for (let i = 0; i < 20; i++) { // 최대 1초 — Vue 가 다음 틱에 그룹을 그린다
      const vm = groupVmAt(index)
      if (vm) return vm
      await wait(50)
    }
    return null
  }

  /**
   * 유형 필터(아이템 유형·희귀도)를 거래소 화면이 스스로 고르는 길로 바꾼다. 바꾼 것의 id 목록을 돌려준다.
   * 거래소가 모르는 옵션 id 는 넣지 않는다 — 드롭다운 목록에 있는 것만.
   */
  function applyTypeFilters(wanted) {
    const typed = []
    if (!wanted || typeof wanted !== 'object') return typed
    const group = [...new Set([...document.querySelectorAll('.filter-group')].map((e) => e.__vue__).filter(Boolean))]
      .find((v) => v.group && v.group.id === 'type_filters' && typeof v.updateFilter === 'function')
    if (!group || !Array.isArray(group.filters)) return typed
    const current = (id) => group.state && group.state.filters && group.state.filters[id] && group.state.filters[id].option
    const choose = (id, option, onlyWhenEmpty) => {
      if (typeof option !== 'string') return
      const index = group.filters.findIndex((f) => f && f.id === id)
      const filter = group.filters[index]
      const options = filter && filter.option && Array.isArray(filter.option.options) ? filter.option.options : []
      if (index < 0 || !options.some((o) => o && o.id === option)) return
      const now = current(id)
      if (now === option || (onlyWhenEmpty && now != null)) return
      group.updateFilter(index, { option })
      typed.push(id)
    }
    choose('category', wanted.category, false)
    choose('rarity', wanted.rarity, true)
    return typed
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== ORIGIN) return
    const d = e.data
    if (!d || d.__baSource !== 'ba-content' || d.kind !== 'add-stat-filters') return
    handle(d)
  })

  async function handle(d) {
    const added = []
    const valued = []
    const skipped = []
    const created = []
    let typed = []
    const reply = (error) => {
      try {
        window.postMessage({ __baSource: 'ba-bridge', kind: 'stat-filters-added', reqId: d.reqId, added, valued, skipped, created, typed, ...(error ? { error } : {}) }, ORIGIN)
      } catch (_) {}
    }
    try {
      if (typeof d.token !== 'string' || !TOKEN_RE.test(d.token) || !Array.isArray(d.items)) return reply('bad-request')
      const el = document.querySelector('.filter-group[data-ba-group-token="' + d.token + '"]')
      const home = el && el.__vue__
      if (!home || typeof home.selectFilter !== 'function') return reply('no-group')
      // 유형을 먼저 정한다 — 능력치 행이 생길 때 티어 칩이 새 유형 기준으로 뜬다
      try { typed = applyTypeFilters(d.typeFilters) } catch (_) { typed = [] }

      // 역할별 대상 그룹 — 필요할 때 한 번만 정한다(같은 요청에서 「필수」 여럿이 새 그룹 하나로 모이게).
      const targets = new Map()
      const targetFor = async (role) => {
        if (targets.has(role)) return targets.get(role)
        const homeType = statsOf(home)[home.group.id] && statsOf(home)[home.group.id].type
        let vm = null
        if (role === 'here') vm = home
        else if (role === 'and') {
          // 필수는 AND 끼리 합쳐도 뜻이 같으므로 이미 있는 AND 그룹을 쓴다. 없으면 만든다.
          if (homeType === 'and') vm = home
          else {
            const idx = statsOf(home).findIndex((g) => g && g.type === 'and')
            vm = idx >= 0 ? groupVmAt(idx) : null
            if (!vm) { vm = await createGroup(home, 'and'); if (vm) created.push('and') }
          }
        } else if (role === 'or') {
          // OR 은 다른 개수 그룹에 섞으면 그 그룹의 N 이 달라진다 — 누른 그룹이 개수 그룹이 아니면 새로 만든다.
          if (homeType === 'count') vm = home
          else {
            vm = await createGroup(home, 'count')
            if (vm) {
              created.push('or')
              if (typeof vm.updateFloat === 'function') vm.updateFloat('min', '1')
            }
          }
        }
        targets.set(role, vm)
        return vm
      }

      const options = home.availableOptionsFlat || {}
      for (const item of d.items.slice(0, MAX_ITEMS)) {
        const id = item && item.id
        if (typeof id !== 'string' || !ID_RE.test(id)) { skipped.push({ id: String(id), reason: 'bad-id' }); continue }
        // 거래소가 모르는 id 를 넣으면 selectFilter 가 조용히 무시한다 — 무시당한 걸 알리려고 먼저 본다.
        if (!options[id]) { skipped.push({ id, reason: 'unknown' }); continue }
        const role = ROLES.has(item.role) ? item.role : 'here'
        const vm = await targetFor(role)
        if (!vm) { skipped.push({ id, reason: 'no-target' }); continue }
        const filtersNow = () => {
          const g = statsOf(vm)[vm.group.id]
          return g && Array.isArray(g.filters) ? g.filters : []
        }
        if (filtersNow().some((f) => f && f.id === id)) { skipped.push({ id, reason: 'have' }); continue }
        vm.selectFilter({ id })
        added.push(id)
        const value = cleanValue(item.value)
        if (!value || typeof vm.updateFilter !== 'function') continue
        // 방금 넣은 행의 위치 — 뒤에서부터 찾는다(같은 id 는 위에서 막았다).
        const index = filtersNow().map((f) => f && f.id).lastIndexOf(id)
        if (index < 0) continue
        vm.updateFilter(index, value)
        valued.push(id)
      }
      reply()
    } catch (_) {
      reply('exception')
    }
  }
})()
