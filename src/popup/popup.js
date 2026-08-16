// POE 북마크 아틀라스 — 확장 팝업 (확장 팝업.dc.html 재현)
import './popup.css'
import { icon } from '../lib/icons.js'
import icon128 from '../icons/icon128.png'
import cafeImg from '../icons/naver_cafe_logo.webp'
import ytImg from '../icons/yt_icon_rgb.png'
import discordImg from '../icons/icon_clyde_white_RGB.png'

const SHORTCUTS_PANEL = [
  { label: '패널 열기 / 접기', keys: ['Alt', 'B'] },
  { label: '현재 검색 저장', keys: ['Alt', 'S'] },
  { label: '북마크·히스토리 검색', keys: ['Alt', 'K'] },
]
const SHORTCUTS_STAT = [
  { label: '아이템 검색 포커스', keys: ['Alt', 'F'] },
  { label: '능력치 필터 추가', keys: ['Alt', 'A'] },
  { label: '능력치 그룹 추가', keys: ['Alt', 'G'] },
]
const TRADE_HOME = 'https://poe.kakaogames.com/trade2/search/poe2'

const version = chrome.runtime.getManifest().version
const scRow = (s) => `<div class="pop-sc-row"><span>${s.label}</span><span class="pop-sc-keys">${s.keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span></div>`

document.getElementById('app').innerHTML = `
  <div class="pop">
    <div class="pop-head">
      <img src="${icon128}" alt="" />
      <span class="pop-title"><b>POE 북마크 아틀라스</b><small>POE TRADE MANAGER · v${version}</small></span>
    </div>
    <div class="pop-intro"><p>거래소 검색을 <b>자동으로 기록</b>하고, 복잡한 조건은 <span class="hl">북마크</span>로 영구 보관해요. 다시 짤 필요 없이 한 번에 다시 엽니다.</p></div>
    <div class="pop-sc">
      <div class="pop-sc-label">패널 단축키</div>
      <div class="pop-sc-list">${SHORTCUTS_PANEL.map(scRow).join('')}</div>
      <div class="pop-sc-label">검색 단축키</div>
      <div class="pop-sc-list">${SHORTCUTS_STAT.map(scRow).join('')}</div>
      <button class="pop-sc-edit" id="pop-shortcuts">
        <span class="ic-box">${icon('pencil', 14)}</span>
        <span class="tx"><b>패널 단축키 변경하기</b><small>chrome://extensions/shortcuts 열기</small></span>
        <span class="ext">${icon('external', 14)}</span>
      </button>
    </div>
    <div class="pop-cta">
      <button class="pop-btn pop-btn--primary" id="pop-toggle">${icon('bookmark', 15)}패널 열기 / 접기</button>
      <button class="pop-btn pop-btn--ghost" id="pop-tour">${icon('sparkle', 14)}사용법 가이드 다시 보기</button>
      <button class="pop-btn pop-btn--ghost" id="pop-global" hidden></button>
    </div>
    <div class="pop-foot">
      <span class="pop-foot-tx"><b>피드백 · 문의</b><small>버그 제보·건의는 커뮤니티로</small></span>
      <a class="pop-soc pop-soc--cafe" href="https://cafe.naver.com/seominugi" target="_blank" rel="noopener" title="네이버 카페에서 문의하기"><img src="${cafeImg}" alt="네이버 카페" style="width:18px;height:18px" /></a>
      <a class="pop-soc pop-soc--yt" href="https://www.youtube.com/@seominugi" target="_blank" rel="noopener" title="유튜브 채널"><img src="${ytImg}" alt="유튜브" style="width:20px;height:14px" /></a>
      <a class="pop-soc pop-soc--dc" href="https://discord.gg/kEm2G2qcZQ" target="_blank" rel="noopener" title="디스코드 서버 참여"><img src="${discordImg}" alt="디스코드" style="width:17px;height:17px" /></a>
    </div>
  </div>`

// ── 핸들러 ──
const $ = (id) => document.getElementById(id)
const isTrade = (url) => /(poe\.kakaogames\.com|www\.pathofexile\.com)\/trade2?\//i.test(url || '')
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t }

// content script에 명령 전달. 거래소 탭이 아니면 false.
async function sendCmd(cmd) {
  const t = await activeTab()
  if (t && isTrade(t.url)) { try { await chrome.tabs.sendMessage(t.id, { type: 'ba-command', cmd }) } catch (_) {} return true }
  return false
}

// 거래소가 아닐 때 열어 줄 주소. **카카오로 고정하면 안 된다** — GGG 계정 사용자가
// 영문 거래소를 보고 있는데 팝업 버튼이 카카오로 끌고 가면 로그인이 안 돼 아무것도 못 한다
// (제보 2026-08-16: "확장 프로그램 추가하고 거래소 들어가면 강제로 카카오사이트로 이동").
// 지금 탭이 이미 pathofexile 이면 그쪽 거래소를 연다.
async function tradeHome() {
  const t = await activeTab()
  try {
    if (t && new URL(t.url).hostname === 'www.pathofexile.com') return 'https://www.pathofexile.com/trade2/search/poe2'
  } catch (_) {}
  return TRADE_HOME
}

$('pop-toggle').onclick = async () => {
  const ok = await sendCmd('toggle')
  if (!ok) chrome.tabs.create({ url: await tradeHome() }) // 거래소가 아니면 거래소 열기
  window.close()
}
$('pop-tour').onclick = async () => {
  const ok = await sendCmd('tour')
  if (!ok) { try { await chrome.storage.local.set({ baTourRestart: true }) } catch (_) {} chrome.tabs.create({ url: await tradeHome() }) }
  window.close()
}

// ── 영문(글로벌) 거래소 사용 — optional 권한이라 사용자가 켜야 콘텐츠 스크립트가 주입된다 ──
// 이 버튼이 없으면 GGG 계정 사용자는 "패널이 안 뜬다"만 겪고 켜는 방법을 알 길이 없었다.
// chrome.permissions.request 는 **사용자 제스처** 안에서만 통하므로 클릭 핸들러에서 직접 부른다.
const GLOBAL_ORIGINS = { origins: ['https://www.pathofexile.com/*'] }
const globalBtn = $('pop-global')
async function renderGlobalBtn() {
  let granted = false
  try { granted = await chrome.permissions.contains(GLOBAL_ORIGINS) } catch (_) {}
  globalBtn.hidden = false
  globalBtn.innerHTML = granted
    ? `${icon('check', 14)}영문 거래소에서도 사용 중`
    : `${icon('external', 14)}영문 거래소(pathofexile)에서도 사용`
  globalBtn.title = granted
    ? 'www.pathofexile.com 에서도 패널이 뜹니다. 끄려면 크롬 확장 프로그램 설정에서 사이트 권한을 내리세요.'
    : 'GGG 계정으로 영문 거래소를 쓰신다면 켜 주세요. 크롬이 권한을 물어봅니다.'
  globalBtn.disabled = granted
}
globalBtn.onclick = async () => {
  try {
    const ok = await chrome.permissions.request(GLOBAL_ORIGINS)
    await renderGlobalBtn()
    // 권한을 방금 켰으면 이미 열려 있는 영문 거래소 탭은 새로고침해야 스크립트가 주입된다.
    if (ok) {
      const t = await activeTab()
      try { if (t && new URL(t.url).hostname === 'www.pathofexile.com') chrome.tabs.reload(t.id) } catch (_) {}
    }
  } catch (_) {}
}
renderGlobalBtn()
$('pop-shortcuts').onclick = () => { chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); window.close() }
