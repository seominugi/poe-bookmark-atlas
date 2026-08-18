// 업데이트 노트 창 — 서비스 워커가 새 창으로 연다(콘텐츠 스크립트의 토스트 또는 팝업에서 요청).
// 여기까지 왔다는 것은 사용자가 "보겠다"고 누른 것이므로, **여는 즉시 본 것으로 기록**한다.
// (토스트의 '더 이상 안 보기'도 같은 키를 쓴다 — 어느 쪽이든 다시 뜨지 않는다.)
import { notesSince } from '../lib/updateNotes.js'

const SEEN_KEY = 'updateNotesSeen'
const version = chrome.runtime.getManifest().version
const icon128 = chrome.runtime.getURL('src/icons/icon128.png')

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// ?all=1 로 열면 전체 이력을 보여준다(팝업의 '업데이트 노트' 버튼). 기본은 아직 안 본 것만.
const showAll = new URLSearchParams(location.search).get('all') === '1'

/** 노트 목록 → 페이지 HTML. 순수 함수라 테스트가 이 마크업을 직접 검증한다. */
export function notesHtml(list, ver, iconUrl) {
  const body = list.length
    ? list.map((n) => `
      <section class="up-ver">
        <div class="up-ver-head">
          <span class="up-tag">v${esc(n.version)}</span>
          ${n.title ? `<span class="up-ver-title">${esc(n.title)}</span>` : ''}
          <span class="up-date">${esc(n.date)}</span>
        </div>
        <ul class="up-items">${n.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      </section>`).join('')
    : `<div class="up-empty">새로 알려드릴 소식이 없어요.<br>다음 업데이트 때 여기로 다시 찾아뵐게요.</div>`

  return `
    <div class="up">
      <div class="up-head">
        <img src="${iconUrl}" alt="" />
        <span class="up-title"><b>POE 북마크 아틀라스</b><small>업데이트 노트 · 현재 v${esc(ver)}</small></span>
      </div>
      ${body}
      <div class="up-foot">
        <span class="up-foot-tx">버그 제보·건의는 <a class="up-link" href="https://cafe.naver.com/seominugi" target="_blank" rel="noopener">네이버 카페</a> 또는 <a class="up-link" href="https://discord.gg/kEm2G2qcZQ" target="_blank" rel="noopener">디스코드</a>로 보내주세요.</span>
        <button class="up-btn up-btn--primary" id="up-close">닫기</button>
      </div>
    </div>`
}

async function render() {
  let seen = null
  try { seen = (await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] ?? null } catch (_) {}
  // 전체 보기도 같은 함수로 — seen 을 null 로 두면 '현재 버전 이하 전부'가 된다(미배포 노트는 여전히 안 샌다).
  const list = notesSince(showAll ? null : seen, version)
  const app = document.getElementById('app')
  if (!app) return // 이 모듈을 페이지 밖에서 import 한 경우(테스트) — 부트스트랩은 건너뛴다
  app.innerHTML = notesHtml(list, version, icon128)
  // 탭으로 열리므로 window.close() 는 통하지 않는다(스크립트가 연 창에서만 허용) — 탭을 닫는다.
  document.getElementById('up-close').onclick = () => {
    Promise.resolve(chrome.tabs.getCurrent())
      .then((t) => (t ? chrome.tabs.remove(t.id) : window.close()))
      .catch(() => window.close())
  }
}

// 본 것으로 기록 — 렌더보다 먼저 읽어야 하므로 렌더가 끝난 뒤에 쓴다.
async function markSeen() {
  try { await chrome.storage.local.set({ [SEEN_KEY]: version }) } catch (_) {}
}

render().then(markSeen)
