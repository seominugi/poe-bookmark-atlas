// stat-adder.js (MAIN world)
// 속성 목록에서 고른 능력치를 거래소 능력치 그룹에 넣는다 — 새로고침·검색 없이.
//
// 왜 MAIN world + Vue 인스턴스인가 (stat-shortcut.js 와 같은 이유):
//   콘텐츠 스크립트(ISOLATED)는 el.__vue__ 를 볼 수 없다. 거래소 드롭다운에서 능력치를 고르면
//   그룹 컴포넌트가 `selectFilter({id})` 를 부르고, 그 안에서 스토어에 행을 넣고 주소를 저장한다
//   (2026-09-15 거래소 번들에서 확인: commit("setStatFilter",{group,value:{id}}) → root.save).
//   **같은 메서드를 부르므로 거래소가 직접 고른 것과 결과가 같다** — 행이 생기고 주소가 바뀌고 검색은 안 돈다.
//
// ⚠ 이 파일은 import 를 쓰면 안 된다. MAIN world 에는 chrome.runtime 이 없어 번들러의 import 로더가 깨진다.
//
// 요청: { __baSource:'ba-content', kind:'add-stat-filters', reqId, token, ids }
// 응답: { __baSource:'ba-bridge', kind:'stat-filters-added', reqId, added, skipped, error? }
//   token — 콘텐츠 스크립트가 그룹 요소에 달아 둔 data-ba-group-token. 두 world 가 공유하는 건 DOM 뿐이다.
(() => {
  const ORIGIN = location.origin
  const TOKEN_RE = /^[a-z0-9]{6,40}$/
  const ID_RE = /^[a-z]+\.[a-z0-9_]+$/ // explicit.stat_1573130764 · pseudo.pseudo_total_life
  const MAX_IDS = 40

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== ORIGIN) return
    const d = e.data
    if (!d || d.__baSource !== 'ba-content' || d.kind !== 'add-stat-filters') return
    const added = []
    const skipped = []
    const reply = (error) => {
      try {
        window.postMessage({ __baSource: 'ba-bridge', kind: 'stat-filters-added', reqId: d.reqId, added, skipped, ...(error ? { error } : {}) }, ORIGIN)
      } catch (_) {}
    }
    try {
      if (typeof d.token !== 'string' || !TOKEN_RE.test(d.token) || !Array.isArray(d.ids)) return reply('bad-request')
      const el = document.querySelector('.filter-group[data-ba-group-token="' + d.token + '"]')
      const vm = el && el.__vue__
      if (!vm || typeof vm.selectFilter !== 'function') return reply('no-group')

      const groupIndex = vm.group && vm.group.id
      const filters = vm.$store && vm.$store.state && vm.$store.state.persistent &&
        vm.$store.state.persistent.stats && vm.$store.state.persistent.stats[groupIndex] &&
        vm.$store.state.persistent.stats[groupIndex].filters
      const present = new Set((Array.isArray(filters) ? filters : []).map((f) => f && f.id))
      const options = vm.availableOptionsFlat || {}

      for (const id of d.ids.slice(0, MAX_IDS)) {
        if (typeof id !== 'string' || !ID_RE.test(id)) { skipped.push({ id: String(id), reason: 'bad-id' }); continue }
        if (present.has(id)) { skipped.push({ id, reason: 'have' }); continue }
        // 거래소가 모르는 id 를 넣으면 selectFilter 가 조용히 무시한다 — 무시당한 걸 알리려고 먼저 본다.
        if (!options[id]) { skipped.push({ id, reason: 'unknown' }); continue }
        vm.selectFilter({ id })
        present.add(id)
        added.push(id)
      }
      reply()
    } catch (_) {
      reply('exception')
    }
  })
})()
