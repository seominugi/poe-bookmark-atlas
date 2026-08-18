// 업데이트 노트 창 — 서비스 워커가 새 창으로 연다(콘텐츠 스크립트의 토스트 또는 팝업에서 요청).
// 여기까지 왔다는 것은 사용자가 "보겠다"고 누른 것이므로, **여는 즉시 본 것으로 기록**한다.
// (토스트의 '더 이상 안 보기'도 같은 키를 쓴다 — 어느 쪽이든 다시 뜨지 않는다.)
import { notesSince, cmpVersion } from '../lib/updateNotes.js'

const SEEN_KEY = 'updateNotesSeen'
const version = chrome.runtime.getManifest().version
const icon128 = chrome.runtime.getURL('src/icons/icon128.png')

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))


/**
 * 노트 본문(GitHub 릴리즈 노트 마크다운) → HTML.
 * **먼저 전부 이스케이프한 뒤** 허용한 문법만 태그로 되돌린다 — 순서가 반대면 노트 한 줄이 마크업이 된다.
 * 지원: ## ### 소제목 · - 불릿 · **굵게** · `코드` · > 인용 · --- 구분선 · [링크](https://…).
 * 링크는 https 만 받는다(javascript: 등 차단).
 */
const inline = (t) => t
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

export function mdToHtml(md) {
  const out = []
  let para = []
  let list = []
  let quote = []
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] } }
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`); list = [] } }
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.map((q) => `<p>${inline(q)}</p>`).join('')}</blockquote>`); quote = [] } }
  const flushAll = () => { flushPara(); flushList(); flushQuote() }

  for (const raw of esc(String(md || '')).split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushAll(); continue }
    if (/^#{3}\s+/.test(line)) { flushAll(); out.push(`<h4>${inline(line.replace(/^#{3}\s+/, ''))}</h4>`); continue }
    if (/^#{2}\s+/.test(line)) { flushAll(); out.push(`<h3>${inline(line.replace(/^#{2}\s+/, ''))}</h3>`); continue }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushAll(); out.push('<hr>'); continue }
    if (/^-\s+/.test(line)) { flushPara(); flushQuote(); list.push(line.replace(/^-\s+/, '')); continue }
    if (/^&gt;\s*/.test(line)) { flushPara(); flushList(); const q = line.replace(/^&gt;\s*/, ''); if (q) quote.push(q); continue }
    flushList(); flushQuote(); para.push(line)
  }
  flushAll()
  return out.join('')
}

/** 노트 목록 → 페이지 HTML. 순수 함수라 테스트가 이 마크업을 직접 검증한다. */
export function notesHtml(list, ver, iconUrl, seen = null) {
  const body = list.length
    ? list.map((n) => `
      <section class="up-ver">
        <div class="up-ver-head">
          <span class="up-tag">v${esc(n.version)}</span>
          ${cmpVersion(n.version, seen) > 0 ? '<span class="up-new">NEW</span>' : ''}
          ${n.title ? `<span class="up-ver-title">${esc(n.title)}</span>` : ''}
          <span class="up-date">${esc(n.date)}</span>
        </div>
        <div class="up-body">${mdToHtml(n.body)}</div>
      </section>`).join('')
    : `<div class="up-empty">아직 업데이트 이력이 없어요.</div>`

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
  // **언제 열든 전체 이력**을 보여준다(사용자 결정 2026-08-18) — 아직 안 본 버전은 NEW 로 구분한다.
  const list = notesSince(null, version)
  const app = document.getElementById('app')
  if (!app) return // 이 모듈을 페이지 밖에서 import 한 경우(테스트) — 부트스트랩은 건너뛴다
  app.innerHTML = notesHtml(list, version, icon128, seen)
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
