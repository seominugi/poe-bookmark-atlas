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

const panel = mountPanel({ game: 'poe2', league: 'Runes of Aldur', getLeagueMap: () => ({ 'Runes of Aldur': 'Runes of Aldur' }), getCurrentSearch: () => null })
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
