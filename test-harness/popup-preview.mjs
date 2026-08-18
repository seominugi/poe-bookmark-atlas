// 확장 팝업(src/popup/popup.html)을 실제 브라우저에서 확인하는 미리보기.
// 확장 API 만 목으로 채우고 **실제 popup.js 를 그대로 실행**한다 — 마크업을 여기서 다시 조립하면
// 정작 사용자가 보는 경로는 한 번도 안 돌려본 채 "확인했다"고 말하게 된다.
//
// 팝업은 오랫동안 자동·수동 검증이 **전무한 표면**이었다. 그 공백에서 회귀가 나왔다:
// '영문 거래소 접근 다시 켜기' 를 hidden 으로 숨겼는데 `.pop-btn { display: flex }` 가 이겨
// 빈 pill 이 남았고, 제보로만 드러났다(2026-08-18).
//
// 열기: npx vite --config vite.harness.config.js → http://localhost:5199/popup.html
//   ?granted=0  영문 거래소 권한이 꺼진 상태(= '다시 켜기' 버튼이 보이는 화면)
//   ?trade=0    거래소가 아닌 탭에서 연 상태(패널 토글이 실패하는 경로)
const q = new URLSearchParams(location.search)
const granted = q.get('granted') !== '0'
const onTrade = q.get('trade') !== '0'

const log = []
function rec(what, arg) {
  log.push(arg === undefined ? what : `${what} ${JSON.stringify(arg)}`)
  const el = document.getElementById('preview-log')
  if (el) el.textContent = log.join('\n')
}

globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: '0.9.2' }),
    sendMessage: async (m) => { rec('runtime.sendMessage', m); return { ok: true } },
  },
  tabs: {
    query: async () => [{ id: 7, url: onTrade ? 'https://poe.kakaogames.com/trade/search/Standard' : 'https://example.com/' }],
    create: async (o) => rec('tabs.create', o),
    reload: async (id) => rec('tabs.reload', id),
    sendMessage: async (_id, m) => { rec('tabs.sendMessage', m); return onTrade ? { ok: true } : undefined },
  },
  storage: { local: { async get() { return {} }, async set(o) { rec('storage.set', o) } } },
  permissions: {
    contains: async () => granted,
    request: async () => { rec('permissions.request'); return true },
  },
}
// 팝업 버튼은 대부분 window.close() 로 끝난다 — 미리보기에서 창이 닫히면 확인할 수가 없다.
window.close = () => rec('window.close()')

await import('../src/popup/popup.js')

// 호출 로그 + 자가 점검 — 빈 pill 회귀를 눈으로도 잡을 수 있게 한다(자동 검증은 test/popup.dom.test.js).
const panel = document.createElement('div')
panel.style.cssText = 'margin:14px 16px 24px;padding:10px 12px;border-top:1px solid rgba(167,139,250,.25);font:11px/1.6 ui-monospace,monospace;color:#9a93bd;white-space:pre-wrap'
panel.innerHTML = '<b style="color:#c4b5fd">미리보기 로그</b> — 버튼을 눌러 보세요'
  + `<div style="margin:6px 0 8px;color:#7c75a3">granted=${granted} · trade=${onTrade} (URL 파라미터로 바꿉니다)</div>`
  + '<div id="preview-audit" style="margin-bottom:8px"></div><div id="preview-log"></div>'
document.body.appendChild(panel)

const empties = [...document.querySelectorAll('.pop button, .pop a')]
  .filter((el) => !el.textContent.trim() && !el.querySelector('img, svg') && el.getBoundingClientRect().height > 0)
document.getElementById('preview-audit').innerHTML = empties.length
  ? `<span style="color:#fda4af">⚠ 내용이 빈 버튼 ${empties.length}개: ${empties.map((e) => e.id || e.className).join(', ')}</span>`
  : '<span style="color:#5eead4">✓ 빈 버튼 없음</span>'
