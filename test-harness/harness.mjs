// 패널 하네스 — 목 chrome + 시드 북마크로 mountPanel 하고, 저장 충돌·⋯ 팝오버를 트리거하는 헬퍼를 노출.
// window.__panel / __triggerConflict / __ready 로 브라우저 자동 검증(preview_eval)에서 조작한다.
const mem = new Map()
const changeListeners = [] // 실제 확장의 chrome.storage.onChanged 를 흉내낸다(set 이 통지까지 한다)
mem.set('tourDone', true) // 투어 자동 시작 스킵
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) { if (keys == null) return Object.fromEntries(mem); const k = Array.isArray(keys) ? keys : [keys]; const o = {}; for (const key of k) if (mem.has(key)) o[key] = mem.get(key); return o },
      async set(obj) {
        const changes = {}
        for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: mem.get(k), newValue: v }; mem.set(k, v) }
        changeListeners.forEach((fn) => fn(changes, 'local')) // 실제 확장은 set 하면 onChanged 가 온다 — 탭 간 동기화 경로가 여기서만 재현된다
      },
      async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => mem.delete(k)) },
      async clear() { mem.clear() },
    },
    onChanged: {
      addListener(fn) { changeListeners.push(fn) },
      removeListener(fn) { const i = changeListeners.indexOf(fn); if (i >= 0) changeListeners.splice(i, 1) },
    },
  },
  // 버전은 UPDATE_NOTES 의 최신 항목 이상이어야 업데이트 토스트가 뜬다(notesSince 가 미배포 노트를 거른다).
  // 하네스는 '릴리즈된 뒤'를 흉내 내는 자리라 노트 최신 버전을 그대로 쓴다.
  runtime: { sendMessage: async (m) => { globalThis.__msgs = (globalThis.__msgs || []).concat(m); return { ok: true } }, onMessage: { addListener() {} }, getURL: (p) => p, getManifest: () => ({ version: '0.9.2' }) },
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
await addHistory(rec('조건 묶음 원본', { dedupeKey: 'k_cset', query: { query: { type: '목걸이', stats: [{ type: 'and', filters: [
  { id: 'explicit.stat_life', value: { min: 80 } }, { id: 'explicit.stat_fire_res', value: { min: 30 } } ] }] }, sort: { price: 'asc' } } }))
await addBookmark(rec('지난 리그 검색', { dedupeKey: 'k_past', league: 'Abyss', query: { query: { status: { option: 'online' }, type: '서판' }, sort: { price: 'asc' } } }), '지난 리그 검색')
await addBookmark(rec('지난 리그(구 북마크)', { dedupeKey: 'k_past_noq', league: 'Abyss' }), '지난 리그(구 북마크)')

// 조건 묶음 시드 — 칩 줄 레이아웃(긴 이름 말줄임·줄바꿈) 확인용
mem.set('conditionSets', [
  { id: 'cs_1', name: '저항 목걸이', game: 'poe2', itemType: '목걸이', order: 1,
    stats: [{ id: 'explicit.stat_life', text: '최대 생명력 #', value: { min: 80 } }, { id: 'explicit.stat_fire_res', text: '화염 저항 #%', value: { min: 30 } }] },
  { id: 'cs_2', name: '이속 장화', game: 'poe2', itemType: '장화', order: 2,
    stats: [{ id: 'explicit.stat_ms', text: '이동 속도 #%', value: { min: 30 } }] },
  { id: 'cs_3', name: '아주아주 긴 이름의 조건 묶음 테스트용', game: 'poe2', itemType: '반지', order: 3,
    stats: [{ id: 'explicit.stat_x', text: '무언가 #' }] },
])

// 조건부로만 나타나는 상태들을 반드시 한 화면에 띄운다.
// 왜: 2026-08-06 레이아웃 전수 점검이 '오래됨'(.ba-attn) 배지가 찌그러지는 결함을 놓쳤다 —
// 하네스에 오래된 북마크가 없어 그 배지가 **렌더된 적이 없었기 때문**이다.
// 조건부 요소를 안 띄운 채로 잰 측정은 그 요소를 검증하지 못한다.
const OLD = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30일 전 = STALE_MS(14일) 초과 → '오래됨' 배지
await addBookmark(rec('오래된 북마크(만료 배지)', { dedupeKey: 'k_stale' }), '오래된 북마크(만료 배지)')
{
  const KEY = 'records'
  const all = mem.get(KEY) || []
  const t = all.find((x) => x.dedupeKey === 'k_stale')
  if (t) { t.lastUsedAt = OLD; t.createdAt = OLD; t.updatedAt = OLD; mem.set(KEY, all) }
}

// '차단된 링크' 배지(.ba-attn--del) — 허용 도메인 밖 URL. addBookmark 는 이런 URL 을 막으므로
// 저장소에 직접 심는다. '오래됨'(3자)보다 긴 6자라 찌그러짐 위험이 더 크다.
{
  const KEY = 'records'
  const all = mem.get(KEY) || []
  const t = all.find((x) => x.dedupeKey === 'k_bm0')
  if (t) { t.url = 'https://evil.example.com/trade2/search/poe2/x'; mem.set(KEY, all) }
}

// 찜한 매물 시드 — 상태 3종(미확인·있음·판매됨) + 다른 거래소 항목까지 한 화면에서 본다
mem.set('watchlist', [
  // icon 은 web.poecdn.com 만 허용된다(isAllowedIconUrl) — 하네스에선 로드 실패해도 자리·레이아웃은 검증된다.
  // 마지막 항목은 icon 없이 두어 '썸네일 없는 카드'도 함께 본다.
  { id: 'w_1', listingId: 'L1', origin: location.host, game: 'poe2', league: 'Runes of Aldur',
    icon: 'https://web.poecdn.com/image/Art/2DItems/Jewels/timeless1.png',
    name: '고상한 오만', baseType: '무궁한 주얼', seller: 'exile#1234',
    price: { amount: 10, currency: 'divine' }, savedAt: Date.now() - 2 * 3600e3, status: 'alive',
    sourceUrl: 'https://poe.kakaogames.com/trade2/search/poe2/Runes%20of%20Aldur/aaa' },
  { id: 'w_2', listingId: 'L2', origin: location.host, game: 'poe2', league: 'Runes of Aldur',
    icon: 'https://web.poecdn.com/image/Art/2DItems/Weapons/spear1.png',
    name: '하늘의 편린', baseType: '날개 달린 창', seller: 'trader#5678',
    price: { amount: 3, currency: 'divine' }, lastPrice: { amount: 5, currency: 'divine' },
    savedAt: Date.now() - 3 * 86400e3, status: 'alive', checkedAt: Date.now() - 3600e3,
    sourceUrl: 'https://poe.kakaogames.com/trade2/search/poe2/Runes%20of%20Aldur/bbb' },
  { id: 'w_3', listingId: 'L3', origin: 'www.pathofexile.com', game: 'poe2', league: 'Runes of Aldur',
    name: '아주아주 긴 이름의 유니크 아이템 표시 확인용', baseType: '반지', seller: 'someone#9999',
    price: { amount: 120, currency: 'chaos' }, savedAt: Date.now() - 12 * 86400e3, status: 'sold', checkedAt: Date.now() - 7200e3,
    sourceUrl: 'https://poe.kakaogames.com/trade2/search/poe2/Runes%20of%20Aldur/ccc' },
])

// 거래소 API를 부를 수 없으므로 결과를 흉내낸다. __migrateResult로 성공/실패를 바꿔 토스트·갱신을 확인한다.
globalThis.__migrateResult = { ok: false, reason: 'rate' } // 기본은 실패 — 성공은 실제 이동(location.href)이라 하네스가 떠남
globalThis.__migrateCalls = []
// 조건 묶음 — 실제 POST 대신 결과를 흉내낸다(성공은 location 이동이라 하네스가 떠남)
globalThis.__setApplied = []
globalThis.__setResult = { ok: false, reason: 'rate' }
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
// __leagueMap으로 덮어써 '끝난 리그 페이지' 상황(현재 리그를 못 정하는 경우)도 재현할 수 있게 한다
getLeagueMap: () => globalThis.__leagueMap || { 'Runes of Aldur': 'Runes of Aldur', Standard: '스탠다드' }, getCurrentSearch: () => null, migrateSearch,
  applyConditionSet: async (set) => { globalThis.__setApplied.push(set.name); return globalThis.__setResult },
  getStatMap: () => ({ 'explicit.stat_life': '최대 생명력 #', 'explicit.stat_fire_res': '화염 저항 #%' }),
  tourDemo })
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
// 거래소 입력칸 흉내 — fuzzyPrefix.js("~" 퍼지 접두사 강제)를 실제 브라우저에서 검증한다.
// isTarget()이 placeholder만 보므로 vue-multiselect까지 흉내낼 필요는 없다.
// 이게 필요한 이유: jsdom 테스트는 document.execCommand를 목으로 대체한다 —
// 진짜 insertText 경로와 userActivation 게이팅은 실제 브라우저인 여기서만 확인된다.
const { initFuzzyPrefix } = await import('../src/content/fuzzyPrefix.js')
const tradeBox = document.createElement('div')
tradeBox.id = 'trade-inputs'
tradeBox.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-width:420px;margin-top:16px'
const mkInput = (id, ph) => {
  const i = document.createElement('input')
  i.id = id; i.placeholder = ph
  i.style.cssText = 'padding:8px;border-radius:6px;border:1px solid #4b4368;background:#141020;color:#ddd6fe;font-family:system-ui;font-size:13px'
  return i
}
tradeBox.append(
  mkInput('tf-item', '아이템 검색…'),
  mkInput('tf-stat', '+ 능력치 필터 추가'),
  mkInput('tf-other', '가격'), // 대상 아님 — 무관한 칸을 안 건드리는지 대조용
)
document.getElementById('page').appendChild(tradeBox)
initFuzzyPrefix()

globalThis.__ready = true
console.log('[harness] ready')
