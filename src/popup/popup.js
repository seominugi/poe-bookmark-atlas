// POE 북마크 아틀라스 — 확장 팝업 (확장 팝업.dc.html 재현)
import './popup.css'
import { icon } from '../lib/icons.js'
import icon128 from '../icons/icon128.png'
import analystImg from '../icons/mascot-analyst.webp'
import researcherImg from '../icons/mascot-researcher.webp'
import cafeImg from '../icons/naver_cafe_logo.webp'
import ytImg from '../icons/yt_icon_rgb.png'
import discordImg from '../icons/icon_clyde_white_RGB.png'

const SHORTCUTS_PANEL = [
  { label: '패널 열기 / 접기', keys: ['Alt', 'B'] },
  { label: '현재 검색 저장', keys: ['Alt', 'S'] },
  { label: '북마크 검색', keys: ['Alt', 'K'] },
]
const SHORTCUTS_STAT = [
  { label: '아이템 검색 포커스', keys: ['Alt', 'F'] },
  { label: '능력치 필터 추가', keys: ['Alt', 'A'] },
  { label: '능력치 그룹 추가', keys: ['Alt', 'G'] },
]
const ECON = { poe1: 'https://seominugi.com/poe1/economy/items', poe2: 'https://seominugi.com/poe2/economy/items' }
const TREND = { poe1: 'https://seominugi.com/poe1/economy/trends', poe2: 'https://seominugi.com/poe2/economy/trends' }
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
      <button class="pop-btn pop-btn--ghost" id="pop-cross">${icon('external', 14)}<span id="pop-cross-tx">PoE1 영문 거래소 연동 켜기</span></button>
      <div class="pop-econ-row">
        <button class="pop-econ pop-econ--items" id="pop-econ"><span class="glint"></span><span class="pic"><img src="${analystImg}" alt="" /></span><span class="lbl">아이템 시세</span></button>
        <button class="pop-econ pop-econ--trend" id="pop-trend"><span class="glint"></span><span class="pic"><img src="${researcherImg}" alt="" /></span><span class="lbl">시장 동향</span></button>
      </div>
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
const gameOf = (url) => (/\/trade2|poe2/i.test(url || '') ? 'poe2' : 'poe1')
const isTrade = (url) => /(poe\.kakaogames\.com|www\.pathofexile\.com)\/trade2?\//i.test(url || '')
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t }

// content script에 명령 전달. 거래소 탭이 아니면 false.
async function sendCmd(cmd) {
  const t = await activeTab()
  if (t && isTrade(t.url)) { try { await chrome.tabs.sendMessage(t.id, { type: 'ba-command', cmd }) } catch (_) {} return true }
  return false
}

$('pop-toggle').onclick = async () => {
  const ok = await sendCmd('toggle')
  if (!ok) chrome.tabs.create({ url: TRADE_HOME }) // 거래소가 아니면 거래소 열기
  window.close()
}
$('pop-tour').onclick = async () => {
  const ok = await sendCmd('tour')
  if (!ok) { try { await chrome.storage.local.set({ baTourRestart: true }) } catch (_) {} chrome.tabs.create({ url: TRADE_HOME }) }
  window.close()
}
$('pop-econ').onclick = async () => { const t = await activeTab(); chrome.tabs.create({ url: ECON[gameOf(t && t.url)] }); window.close() }
$('pop-trend').onclick = async () => { const t = await activeTab(); chrome.tabs.create({ url: TREND[gameOf(t && t.url)] }); window.close() }
$('pop-shortcuts').onclick = () => { chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); window.close() }

// 영문 거래소 전환(PoE1) — pathofexile.com optional 권한 토글 (권한 요청은 확장 페이지에서만 가능)
const CROSS_ORIGINS = ['https://www.pathofexile.com/*']
async function refreshCross() {
  let granted = false
  try { granted = await chrome.permissions.contains({ origins: CROSS_ORIGINS }) } catch (_) {}
  $('pop-cross-tx').textContent = granted ? 'PoE1 영문 거래소 연동: 켜짐 ✓ (패널·전환)' : 'PoE1 영문 거래소 연동 켜기'
}
$('pop-cross').onclick = async () => {
  let granted = false
  try { granted = await chrome.permissions.contains({ origins: CROSS_ORIGINS }) } catch (_) {}
  try {
    if (granted) await chrome.permissions.remove({ origins: CROSS_ORIGINS })
    else await chrome.permissions.request({ origins: CROSS_ORIGINS })
  } catch (_) {}
  refreshCross()
}
refreshCross()
