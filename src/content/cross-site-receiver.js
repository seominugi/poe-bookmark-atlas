// cross-site-receiver.js (ISOLATED world) — 영문 거래소(pathofexile.com)에서만 실행.
// 카카오(한글 거래소)에서 "영문 거래소로 전환" 시 service-worker가 chrome.storage에 담아둔
// 검색 조건(query)을 이 사이트의 공식 API에 same-origin POST로 재생성하고, 그 결과 URL로 이동한다.
//
// 왜 same-origin 재생성인가: 거래소는 검색을 서버별 고유 searchId로만 로드하므로 도메인만
// 바꾸면 조건이 유실된다. 이 사이트의 세션으로 직접 검색을 만들어(=사용자 본인이 검색한 것과
// 동일) 새 searchId를 받아 연다. optional_host_permissions 허용 시에만 주입된다.
;(async () => {
  try {
    if (!/\/trade2\/search\/poe2\//.test(location.pathname)) return
    const { baCrossSite } = await chrome.storage.local.get('baCrossSite')
    if (!baCrossSite || !baCrossSite.query || baCrossSite.target !== 'pathofexile') return
    // 60초 이내의 신선한 전환만 처리 (오래된 잔여 데이터는 무시·정리)
    if (Date.now() - (baCrossSite.ts || 0) > 60000) { await chrome.storage.local.remove('baCrossSite'); return }
    await chrome.storage.local.remove('baCrossSite') // 1회 소비 — 중복 재생성 방지
    const league = baCrossSite.league
    const res = await fetch(`/api/trade2/search/poe2/${encodeURIComponent(league)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(baCrossSite.query),
    })
    if (!res.ok) { console.warn('[BA] cross-site recreate failed', res.status); return }
    const j = await res.json()
    if (j && j.id) location.replace(`/trade2/search/poe2/${encodeURIComponent(league)}/${j.id}`)
  } catch (e) { console.warn('[BA] cross-site receiver error', e) }
})()
