// cross-site-receiver.js (ISOLATED world) — 영문 거래소(pathofexile.com)에서 실행.
// 카카오에서 "영문 거래소로 전환" 시 service-worker가 chrome.storage에 담아둔 검색 조건을
// 이 사이트의 공식 API에 same-origin POST로 재생성하고 결과 URL로 이동한다.
//
// pathofexile.com은 HTML 페이지 경로에 Cloudflare 봇 챌린지를 건다(2026-08-05 실측:
// /trade·/trade2 모두 403 `Cf-Mitigated: challenge`, Location 헤더 없음 / API 경로는 200).
// 챌린지 중에는 이 POST도 거부될 수 있으므로 실패를 전제로 설계한다 — 재시도 가능해야 하고,
// 실패가 사용자에게 보여야 한다.
// pathofexile.com 은 2026-08-18부터 기본 host_permissions 라 별도 허용 없이 주입된다
// (사용자가 크롬에서 사이트 접근을 직접 내린 경우에만 빠진다).

const MAX_TRIES = 3

// 실패를 눈에 보이게 알린다.
// 예전엔 console.warn뿐이라 사용자는 영문도 모른 채 낯선 화면을 봤고, 드물게 터지는 이 실패가
// 아무 흔적도 남기지 않아 원인 판정이 영영 불가능했다. 문구에 상태·현재 호스트를 담아
// 다음에 터졌을 때 그 자체가 제보 자료가 되게 한다. 값은 전부 textContent로만 넣는다.
// (export 하지 않는다 — 모듈이 되면 crxjs가 동적 import 로더로 바꾸는데, Cloudflare 챌린지
//  페이지의 엄격한 CSP(`script-src 'nonce-...'`)에 그 import가 막힐 수 있다. 정작 안내가 필요한
//  바로 그 화면에서 스크립트가 안 뜨면 의미가 없다. 검증은 하네스에서 이 함수를 복제해 수행했다.)
function notify(title, detail) {
  try {
    const prev = document.getElementById('ba-cross-notice')
    if (prev) prev.remove()
    const box = document.createElement('div')
    box.id = 'ba-cross-notice'
    box.style.cssText = 'position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);'
      + 'max-width:min(560px,calc(100vw - 32px));padding:12px 34px 12px 14px;border-radius:12px;'
      + 'background:#1a1430;color:#e6e3f5;border:1px solid #6d5bd0;box-shadow:0 10px 30px rgba(0,0,0,.45);'
      + 'font:13px/1.5 system-ui,-apple-system,sans-serif;word-break:keep-all'
    const t = document.createElement('b')
    t.textContent = title
    t.style.cssText = 'display:block;margin-bottom:4px;color:#c4b5fd'
    const d = document.createElement('span')
    d.textContent = detail
    const x = document.createElement('button')
    x.textContent = '✕'
    x.setAttribute('aria-label', '닫기')
    x.style.cssText = 'position:absolute;top:7px;right:9px;background:none;border:none;color:#9b94bd;cursor:pointer;font-size:13px;line-height:1'
    x.addEventListener('click', () => box.remove())
    box.append(t, d, x)
    ;(document.body || document.documentElement).appendChild(box)
  } catch (_) {}
}

;(async () => {
  try {
    const poe2 = /\/trade2\/search\/poe2\//.test(location.pathname)
    const poe1 = /\/trade\/search\//.test(location.pathname)
    if (!poe1 && !poe2) return
    const { baCrossSite } = await chrome.storage.local.get('baCrossSite')
    if (!baCrossSite || !baCrossSite.query || baCrossSite.target !== 'pathofexile') return
    // 60초 이내의 신선한 전환만 처리
    if (Date.now() - (baCrossSite.ts || 0) > 60000) { await chrome.storage.local.remove('baCrossSite'); return }

    // 시도 횟수만 올리고 **페이로드는 남긴다.** 예전엔 fetch 직전에 지워서, 챌린지에 걸리면
    // 검색 조건이 이미 사라진 뒤라 확인 절차를 마치고 새로고침해도 영영 복구가 안 됐다.
    // 대신 챌린지 루프로 새로고침이 반복될 때 POST가 무한히 나가지 않도록 횟수로 막는다.
    const tries = (baCrossSite.tries || 0) + 1
    if (tries > MAX_TRIES) {
      await chrome.storage.local.remove('baCrossSite')
      notify('영문 거래소로 검색을 옮기지 못했어요', `${MAX_TRIES}번 시도했지만 실패했습니다. 현재 주소: ${location.host}`)
      return
    }
    await chrome.storage.local.set({ baCrossSite: { ...baCrossSite, tries } })

    const lg = encodeURIComponent(baCrossSite.league)
    const isP2 = baCrossSite.game === 'poe2'
    const apiUrl = isP2 ? `/api/trade2/search/poe2/${lg}` : `/api/trade/search/${lg}`
    const left = `${tries}/${MAX_TRIES}회 시도`

    let res
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(baCrossSite.query),
      })
    } catch (e) {
      notify('영문 거래소에 연결하지 못했어요', `네트워크 오류입니다. 새로고침하면 다시 시도합니다 (${left}).`)
      return
    }
    if (!res.ok) {
      const cf = res.status === 403 ? ' Cloudflare 확인 절차일 수 있어요 — 확인을 마친 뒤 새로고침해 주세요.' : ''
      notify('영문 거래소가 요청을 거부했어요', `HTTP ${res.status}.${cf} (${left})`)
      console.warn('[BA] cross-site recreate failed', res.status)
      return
    }
    const j = await res.json().catch(() => null)
    if (!j || !j.id) {
      notify('영문 거래소 응답을 이해하지 못했어요', `검색 결과 주소를 받지 못했습니다. 새로고침하면 다시 시도합니다 (${left}).`)
      return
    }
    await chrome.storage.local.remove('baCrossSite') // **성공했을 때만** 소비한다
    location.replace(isP2 ? `/trade2/search/poe2/${lg}/${j.id}` : `/trade/search/${lg}/${j.id}`)
  } catch (e) {
    console.warn('[BA] cross-site receiver error', e)
    notify('영문 거래소 전환 중 오류가 발생했어요', String((e && e.message) || e))
  }
})()
