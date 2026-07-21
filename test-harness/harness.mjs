// 패널 하네스 — 목 chrome + 시드 북마크로 mountPanel 하고, 저장 충돌·⋯ 팝오버를 트리거하는 헬퍼를 노출.
// window.__panel / __triggerConflict / __ready 로 브라우저 자동 검증(preview_eval)에서 조작한다.
const mem = new Map()
mem.set('tourDone', true) // 투어 자동 시작 스킵
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) { if (keys == null) return Object.fromEntries(mem); const k = Array.isArray(keys) ? keys : [keys]; const o = {}; for (const key of k) if (mem.has(key)) o[key] = mem.get(key); return o },
      async set(obj) { for (const [k, v] of Object.entries(obj)) mem.set(k, v) },
      async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => mem.delete(k)) },
      async clear() { mem.clear() },
    },
    onChanged: { addListener() {} },
  },
  runtime: { sendMessage: async () => ({ ok: false }), onMessage: { addListener() {} }, getURL: (p) => p, getManifest: () => ({ version: '0.0.0-harness' }) },
}

const { addBookmark, addHistory, addFolder } = await import('../src/store/store.js')
const { mountPanel } = await import('../src/content/panel/panel.js')

const rec = (title, over = {}) => ({
  game: 'poe2', league: 'Runes of Aldur',
  url: 'https://poe.kakaogames.com/trade2/search/poe2/Runes%20of%20Aldur/' + (over.dedupeKey || title),
  title, itemType: '서판', name: null,
  stats: ['잔여 사용 횟수 #회', '지도 내 바알 등대 확률 #%', '고유 몬스터 추가 #%', '희귀 등급일 확률 #%'],
  statGroups: [{ type: 'and', label: '및', filters: [
    { text: '잔여 사용 횟수 #회', value: '≥10' }, { text: '지도 내 바알 등대에서 #% 확률로 수정 추가', value: '' },
    { text: '지도에 바알 등대 고유 몬스터 추가 #%', value: '' }, { text: '바알 등대 상자 희귀 확률 #% 증가', value: '≥35' },
  ] }],
  otherFilters: [{ key: 'ilvl', label: '아이템 레벨', value: '≥80' }],
  snapshot: { valueDiv: 23, value: 23, unit: 'divine', sampleN: 10 },
  dedupeKey: 'k_' + title, ...over,
})

for (let i = 0; i < 6; i++) await addBookmark(rec('북마크 ' + i, { dedupeKey: 'k_bm' + i }), '북마크 ' + i)
await addBookmark(rec('사원 서판', { dedupeKey: 'k_sawon' }), '사원 서판')
// 폴더 안 북마크 — 실사용 케이스(유니크 폴더의 카드 액션·스포트라이트) 재현용
const fold = await addFolder('유니크', 'poe2')
await addBookmark(rec('지식의 매듭', { dedupeKey: 'k_fold1', folderId: fold.id }), '지식의 매듭')

// 지난 리그 북마크(리그 이관 흐름 확인용) — 조건 있는 것 / 없는 구 북마크 각 1개
await addBookmark(rec('지난 리그 검색', { dedupeKey: 'k_past', league: 'Abyss', query: { query: { status: { option: 'online' }, type: '서판' }, sort: { price: 'asc' } } }), '지난 리그 검색')
await addBookmark(rec('지난 리그(구 북마크)', { dedupeKey: 'k_past_noq', league: 'Abyss' }), '지난 리그(구 북마크)')

// 거래소 API를 부를 수 없으므로 결과를 흉내낸다. __migrateResult로 성공/실패를 바꿔 토스트·갱신을 확인한다.
globalThis.__migrateResult = { ok: false, reason: 'rate' } // 기본은 실패 — 성공은 실제 이동(location.href)이라 하네스가 떠남
globalThis.__migrateCalls = []
const migrateSearch = async (rec, league) => { globalThis.__migrateCalls.push({ id: rec && rec.id, hasQuery: !!(rec && rec.query), league }); return globalThis.__migrateResult }

// 투어 예시 요소 스텁 — 실제 카드는 content-main.js(하네스 미실행)가 만든다.
// 여기선 panel.js의 훅(대상 없을 때 예시를 놓고 스포트라이트를 붙이는지)만 검증한다.
const tourDemo = {
  show(side) {
    if (document.getElementById('ba-tour-demo')) return
    const el = document.createElement('div')
    el.id = 'ba-tour-demo'
    el.style.cssText = `position:fixed;top:50%;${side === 'left' ? 'right' : 'left'}:120px;padding:14px;background:#1a1430;color:#ddd6fe;border:1px dashed #a78bfa;border-radius:12px;text-align:center`
    el.innerHTML = '<div class="ba-pob-btn" style="display:inline-block;padding:6px 11px;border:1px solid #a78bfa">PoB</div><div style="margin-top:8px">제시 가격 12 <span class="ba-exr-chip" style="display:inline-block;padding:2px 8px;border:1px solid #a78bfa">≈ 24 엑잘</span></div>'
    document.body.appendChild(el)
  },
  hide() { const el = document.getElementById('ba-tour-demo'); if (el) el.remove() },
}

const panel = mountPanel({ game: 'poe2', league: 'Runes of Aldur', // 리그 목록 = 지금 열려 있는 리그만(거래소 API와 동일). 위 시드의 'Abyss'는 일부러 빼서 '끝난 리그'로 만든다.
getLeagueMap: () => ({ 'Runes of Aldur': 'Runes of Aldur', Standard: '스탠다드' }), getCurrentSearch: () => null, migrateSearch, tourDemo })
panel.show()
globalThis.__panel = panel
globalThis.__root = document.getElementById('ba-panel-host').shadowRoot

// 저장 충돌(near-dup): '사원 서판'과 구조 같고 dedupeKey만 다른 최신 히스토리 추가 후 저장 → 다이얼로그 오픈
globalThis.__triggerConflict = async () => {
  await addHistory(rec('사원 서판', { dedupeKey: 'k_new', url: 'https://poe.kakaogames.com/trade2/search/poe2/Runes%20of%20Aldur/NEW' }))
  document.dispatchEvent(new CustomEvent('ba:records-changed'))
  await new Promise((r) => setTimeout(r, 120))
  panel.save() // await 안 함 — 다이얼로그 열린 상태로 둠
  await new Promise((r) => setTimeout(r, 120))
}
// 충돌 없는 저장 — 어떤 북마크와도 구조가 다른 유니크 히스토리 추가 후 저장 → showSaveInput 직행
globalThis.__saveUnique = async () => {
  await addHistory({ ...rec('유니크템', { dedupeKey: 'k_uniq' }), title: '유니크템', stats: ['고유 스탯 zzz'], statGroups: [{ type: 'and', label: '및', filters: [{ text: '고유 스탯 zzz', value: '≥1' }] }], otherFilters: [{ key: 'uniq_only', label: '유일', value: '≥1' }] })
  document.dispatchEvent(new CustomEvent('ba:records-changed'))
  await new Promise((r) => setTimeout(r, 120)); panel.save(); await new Promise((r) => setTimeout(r, 120))
}
// 북마크 상태 덤프 — 덮어쓰기가 실제로 대상 레코드를 갱신했는지(취소가 아니라) 검증용
globalThis.__dumpBookmarks = async () => {
  const { listByKind } = await import('../src/store/store.js')
  return (await listByKind('bookmark', 'poe2')).map((b) => ({ id: b.id, name: b.name, dedupeKey: b.dedupeKey, url: b.url }))
}
globalThis.__ready = true
console.log('[harness] ready')
