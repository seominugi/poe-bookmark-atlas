// cross-site-receiver.js (ISOLATED world) — 영문 거래소(pathofexile.com)에서 실행.
// 카카오에서 "영문 거래소로 전환" 시 service-worker가 chrome.storage에 담아둔 검색 조건을
// 이 사이트의 공식 API에 same-origin POST로 재생성하고 결과 URL로 이동한다.
//
// PoE1(/trade/)은 한국에서 접근 가능, PoE2(/trade2/)는 GGG가 카카오로 geo-redirect하므로
// 실제로는 PoE1 검색만 이 리시버까지 도달한다(플러밍은 향후 대비해 game-aware로 둠).
// optional_host_permissions 허용 시에만 주입된다.
;(async () => {
  try {
    const poe2 = /\/trade2\/search\/poe2\//.test(location.pathname)
    const poe1 = /\/trade\/search\//.test(location.pathname)
    if (!poe1 && !poe2) return
    const { baCrossSite } = await chrome.storage.local.get('baCrossSite')
    if (!baCrossSite || !baCrossSite.query || baCrossSite.target !== 'pathofexile') return
    // 60초 이내의 신선한 전환만 처리
    if (Date.now() - (baCrossSite.ts || 0) > 60000) { await chrome.storage.local.remove('baCrossSite'); return }
    await chrome.storage.local.remove('baCrossSite') // 1회 소비 — 중복 재생성 방지
    const lg = encodeURIComponent(baCrossSite.league)
    const isP2 = baCrossSite.game === 'poe2'
    const apiUrl = isP2 ? `/api/trade2/search/poe2/${lg}` : `/api/trade/search/${lg}`
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(baCrossSite.query),
    })
    if (!res.ok) { console.warn('[BA] cross-site recreate failed', res.status); return }
    const j = await res.json()
    if (j && j.id) location.replace(isP2 ? `/trade2/search/poe2/${lg}/${j.id}` : `/trade/search/${lg}/${j.id}`)
  } catch (e) { console.warn('[BA] cross-site receiver error', e) }
})()
