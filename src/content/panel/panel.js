import css from './panel.css?inline'
import { renderList, highlightBookmark, clearHighlight, resolveSaveConflict, overwriteSource, analystUrl, researcherUrl, leagueInfo, resolveCurrentLeague } from './renderList.js'
import { icon } from '../../lib/icons.js'
import { listByKind, addBookmark, overwriteBookmark, listFolders, addFolder, needsTourDemo, seedDemoData, clearDemoData,
  listConditionSets, addConditionSet, removeConditionSet, moveConditionSet } from '../../store/store.js'
import { extractConditionSet, conditionSetSummary } from '../../lib/conditionSet.js'
import { suggestName } from '../../lib/suggestName.js'
import cafeIcon from '../../icons/naver_cafe_logo.webp'
import ytIcon from '../../icons/yt_icon_rgb.png'
import discordIcon from '../../icons/icon_clyde_white_RGB.png'
import logoIcon from '../../icons/icon128.png'

// 로고·소셜 로고 — content script(ISOLATED)라 확장 URL로 해석
const logoUrl = chrome.runtime.getURL(logoIcon)
const cafeUrl = chrome.runtime.getURL(cafeIcon)
const ytUrl = chrome.runtime.getURL(ytIcon)
const discordUrl = chrome.runtime.getURL(discordIcon)

const ECON_ITEMS = { poe1: 'https://seominugi.com/poe1/economy/items', poe2: 'https://seominugi.com/poe2/economy/items' }
const ECON_TREND = { poe1: 'https://seominugi.com/poe1/economy/trends', poe2: 'https://seominugi.com/poe2/economy/trends' }

export function mountPanel({ game, league, getLeagueMap, getCurrentSearch, migrateSearch, applyConditionSet, getStatMap, tourDemo }) {
  if (document.getElementById('ba-panel-host')) return { toggle() {}, show() {}, hide() {} }
  const host = document.createElement('div')
  host.id = 'ba-panel-host'
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = css
  root.appendChild(style)

  const wrap = document.createElement('div')
  wrap.innerHTML = `
    <div class="ba-root" id="ba-root">
      <div class="ba-head">
        <div class="ba-brand">
          <img class="ba-brand-logo" src="${logoUrl}" alt="" />
          <span class="ba-brand-tx"><b>POE 북마크 아틀라스</b><small>${game === 'poe2' ? 'POE2' : 'POE1'} TRADE MANAGER</small></span>
          <span class="ba-kbd-wrap">
            <span class="ba-kbd-chip">${icon('keyboard', 15)}</span>
            <div class="ba-kbd-pop">
              <div class="ba-kbd-pop-group">패널 단축키</div>
              <div class="ba-kbd-pop-row"><span>패널 열기 / 접기</span><span class="ba-kbd-keys"><kbd>Alt</kbd><kbd>B</kbd></span></div>
              <div class="ba-kbd-pop-row"><span>현재 검색 저장</span><span class="ba-kbd-keys"><kbd>Alt</kbd><kbd>S</kbd></span></div>
              <div class="ba-kbd-pop-row"><span>북마크·히스토리 검색</span><span class="ba-kbd-keys"><kbd>Alt</kbd><kbd>K</kbd></span></div>
              <div class="ba-kbd-pop-row"><span>설정</span><span class="ba-kbd-keys"><kbd>Alt</kbd><kbd>O</kbd></span></div>
              <div class="ba-kbd-pop-group">검색 단축키</div>
              <div class="ba-kbd-pop-row"><span>아이템 검색</span><span class="ba-kbd-keys"><kbd>Alt</kbd><kbd>F</kbd></span></div>
              <div class="ba-kbd-pop-divider"></div>
              <div class="ba-kbd-pop-row"><span>능력치 필터 추가</span><span class="ba-kbd-keys"><kbd>Alt</kbd><kbd>A</kbd></span></div>
              <div class="ba-kbd-pop-sub">여러 그룹이면 <b>반복해서 전환</b></div>
              <div class="ba-kbd-pop-row"><span>능력치 그룹 추가</span><span class="ba-kbd-keys"><kbd>Alt</kbd><kbd>G</kbd></span></div>
              <div class="ba-kbd-pop-foot">확장 아이콘 클릭 → 시세 · 가이드 · 문의</div>
            </div>
          </span>
          <a class="ba-foot-chip-wrap ba-brand-credit" href="https://www.youtube.com/@seominugi" target="_blank" rel="noopener" data-tip="서미누기가 만든 도구예요 — 유튜브 채널 바로가기 ↗"><span class="ba-foot-glow"></span><span class="ba-foot-chip"><span class="ba-foot-glint"></span><b>서미누기 제작</b></span></a>
          <a class="ba-donate" href="https://toon.at/donate/seominugi" target="_blank" rel="noopener" data-tip="후원하기 — 투네이션으로 응원 ↗">${icon('heart', 13)}</a>
        </div>
        <button class="ba-save" id="ba-save" data-tip="최근 거래소 검색을 북마크로 저장">${icon('bookmark', 15)}현재 검색 저장</button>
      </div>
      <div class="ba-econ-row">
        <a class="ba-econ-btn items" href="${ECON_ITEMS[game] || ECON_ITEMS.poe2}" target="_blank" rel="noopener" data-tip="아이템 시세 — 서미누기의 POE 경제 ↗">
          <span class="ba-econ-glint"></span>
          <span class="ba-econ-pic"><img src="${analystUrl}" alt=""></span>
          <span class="ba-econ-lbl"><b>아이템 시세</b></span>
        </a>
        <a class="ba-econ-btn trend" href="${ECON_TREND[game] || ECON_TREND.poe2}" target="_blank" rel="noopener" data-tip="시장 동향 — 서미누기의 POE 경제 ↗">
          <span class="ba-econ-glint"></span>
          <span class="ba-econ-pic"><img src="${researcherUrl}" alt=""></span>
          <span class="ba-econ-lbl"><b>시장 동향</b></span>
        </a>
      </div>
      <div class="ba-namebar" id="ba-namebar" hidden>
        <div class="ba-modal-card" id="ba-modal-card">
          <div class="ba-modal-title" id="ba-modal-title">북마크 이름</div>
          <div class="ba-modal-msg" id="ba-modal-msg" hidden></div>
          <input class="ba-name-input" id="ba-name-input" placeholder="북마크 이름" maxlength="60" />
          <div class="ba-folder-pick" id="ba-folder-pick" hidden></div>
          <div class="ba-modal-btns">
            <button class="ba-name-cancel" id="ba-name-cancel">취소</button>
            <button class="ba-name-alt" id="ba-name-alt" hidden>새로 만들기</button>
            <button class="ba-name-ok" id="ba-name-ok">저장</button>
          </div>
        </div>
      </div>
      <div class="ba-sets" id="ba-sets" hidden></div>
      <div class="ba-list" id="ba-list"></div>
      <div class="ba-foot">
        <div class="ba-foot-tx">
          <small>💜 피드백·문의는 언제든 오른쪽<br>유튜브·네이버 카페·디스코드로!</small>
        </div>
        <a class="ba-foot-soc ba-foot-soc--cafe" href="https://cafe.naver.com/seominugi" target="_blank" rel="noopener" data-tip="네이버 카페에서 문의하기"><img src="${cafeUrl}" alt="네이버 카페"></a>
        <a class="ba-foot-soc ba-foot-soc--yt" href="https://www.youtube.com/@seominugi" target="_blank" rel="noopener" data-tip="유튜브 채널 바로가기"><img src="${ytUrl}" alt="유튜브"></a>
        <a class="ba-foot-soc ba-foot-soc--dc" href="https://discord.gg/kEm2G2qcZQ" target="_blank" rel="noopener" data-tip="디스코드 서버 참여"><img src="${discordUrl}" alt="디스코드"></a>
        <div class="ba-foot-row2">
          <button class="ba-foot-guide" id="ba-foot-guide">${icon('sparkle', 13)}사용법 가이드 다시 보기</button>
          <button class="ba-gear" id="ba-gear" data-tip="설정 (Alt+O)">${icon('settings', 15)}설정</button>
        </div>
      </div>
      <div class="ba-toast" id="ba-toast" hidden></div>
    </div>
    <div class="ba-handle" id="ba-handle">
      <div class="ba-handle-grip" id="ba-handle-grip" data-tip="드래그하면 핸들 위치를 위아래로 옮겨요">${icon('grip', 14)}</div>
      <div class="ba-handle-toggle" id="ba-handle-toggle" data-tip="클릭하면 패널을 접고 펼쳐요 (Alt+B)"><span class="ba-handle-glint"></span><span class="ba-handle-body"><span class="ba-handle-label">북마크</span><span class="ba-handle-badge" id="ba-handle-badge" hidden></span></span></div>
    </div>
    <div class="ba-tip" id="ba-tip" hidden></div>`
  root.appendChild(wrap)

  const $ = (id) => root.getElementById(id)
  const elRoot = $('ba-root')

  // 접기/펼치기 = 표시/숨김 (핸들·✕·툴바 아이콘 공통, 상태 유지). 핸들은 항상 보여 다시 열 수 있음.
  const isCollapsed = () => elRoot.classList.contains('collapsed')
  let panelSide = 'right' // 패널 좌/우 배치 (uiPanelSide 선호)
  // 펼쳤을 때 페이지 콘텐츠를 패널 반대쪽으로 밀어 자리를 확보(도킹) → 검색 영역과 겹침 방지. 좌/우 배치에 따라 방향 반전.
  const applyPagePush = (collapsed) => {
    try {
      const push = collapsed ? '' : '412px'
      document.documentElement.style.setProperty('margin-left', panelSide === 'left' ? push : '', 'important')
      document.documentElement.style.setProperty('margin-right', panelSide === 'right' ? push : '', 'important')
      document.documentElement.style.setProperty('transition', 'margin .25s ease', 'important')
    } catch (_) {}
  }
  // 패널 좌/우 배치 적용 — data-side(CSS 미러링) + 페이지 밀기 방향 갱신. (핸들 그라데이션은 세로 기준이라 재계산 불필요)
  const applySide = (side) => {
    panelSide = side === 'left' ? 'left' : 'right'
    elRoot.setAttribute('data-side', panelSide)
    applyPagePush(isCollapsed())
  }
  // 접힘 시 핸들에 북마크 수 배지 표시
  const updateHandleBadge = async () => {
    const badge = $('ba-handle-badge'); if (!badge) return
    const n = (await listByKind('bookmark', game)).length
    badge.textContent = n
    badge.hidden = !(isCollapsed() && n > 0)
  }
  const setCollapsed = (collapsed) => {
    elRoot.classList.toggle('collapsed', collapsed)
    applyPagePush(collapsed)
    try { chrome.storage.local.set({ uiCollapsed: collapsed }) } catch (_) {}
    updateHandleBadge()
  }
  // 초기 상태: 좁은 화면은 접힘(검색 영역 겹침 방지), 넓으면 펼침. 사용자 토글 선호는 기억.
  if (window.innerWidth < 1700) elRoot.classList.add('collapsed')
  applyPagePush(isCollapsed())
  try {
    chrome.storage.local.get(['uiCollapsed', 'uiPanelSide']).then((r) => {
      if (r && r.uiPanelSide) applySide(r.uiPanelSide)
      if (r && typeof r.uiCollapsed === 'boolean') { elRoot.classList.toggle('collapsed', r.uiCollapsed); applyPagePush(r.uiCollapsed) }
      updateHandleBadge()
    })
  } catch (_) {}
  updateHandleBadge()

  // 핸들 테두리를 패널 그라데이션의 '그 위치 색'으로 동적 일치
  // (panel.css의 fixed border-box 그라데이션이 콘텐츠 스크립트 컨텍스트에서 불안정 → JS로 계산해 inline 적용)
  const HGRAD = ['#fbbf24', '#fb7185', '#c084fc', '#818cf8', '#a78bfa'] // 패널 그라데이션 5스톱(앰버→바이올렛)
  const hpx = (h, i) => parseInt(h.slice(i, i + 2), 16)
  const lerpHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(hpx(a, i) + (hpx(b, i) - hpx(a, i)) * t).toString(16).padStart(2, '0')).join('')
  const gradColorAt = (frac) => {
    const f = Math.max(0, Math.min(1, frac)) * (HGRAD.length - 1)
    const i = Math.min(HGRAD.length - 2, Math.floor(f))
    return lerpHex(HGRAD[i], HGRAD[i + 1], f - i)
  }
  const updateHandleGrad = () => {
    const el = $('ba-handle'); if (!el) return
    const r = el.getBoundingClientRect()
    const H = window.innerHeight || 1
    const c1 = gradColorAt(r.top / H); const c2 = gradColorAt(r.bottom / H)
    el.style.background = `linear-gradient(rgba(24,21,42,.96),rgba(24,21,42,.96)) padding-box, linear-gradient(180deg, ${c1}, ${c2}) border-box`
  }

  // 핸들: 하단 토글(접기/펼치기) + 상단 그립 드래그(상하 위치 이동)
  $('ba-handle-toggle').onclick = () => setCollapsed(!isCollapsed())
  ;(() => {
    const handleEl = $('ba-handle')
    const grip = $('ba-handle-grip')
    let dragging = false
    let startY = 0
    let startTop = 0
    grip.addEventListener('pointerdown', (e) => {
      dragging = true; startY = e.clientY; startTop = handleEl.getBoundingClientRect().top
      try { grip.setPointerCapture(e.pointerId) } catch (_) {}
      e.preventDefault()
    })
    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const top = Math.max(8, Math.min(window.innerHeight - 124, startTop + (e.clientY - startY)))
      handleEl.style.top = top + 'px'
      handleEl.style.marginTop = '0'
      updateHandleGrad() // 드래그하며 그라데이션 색 갱신
    })
    const endDrag = (e) => { if (!dragging) return; dragging = false; try { grip.releasePointerCapture(e.pointerId) } catch (_) {} }
    grip.addEventListener('pointerup', endDrag)
    grip.addEventListener('pointercancel', endDrag)
  })()
  updateHandleGrad() // 초기 1회
  window.addEventListener('resize', updateHandleGrad)

  let toastTimer = null
  const toast = (msg) => {
    const t = $('ba-toast'); t.textContent = msg; t.hidden = false
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true }, 2200)
  }

  // 패널 내 북마크 검색창 포커스 단축키 (Alt+K) — 접혀 있으면 펼친 뒤 포커스
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyK') return
    e.preventDefault()
    if (isCollapsed()) setCollapsed(false)
    const inp = root.querySelector('.ba-search-input[data-scope="bm"]')
    if (inp) { inp.focus(); inp.select() }
  }, true)

  // 설정 열기 단축키 (Alt+O) — 접혀 있으면 펼친 뒤 설정 모달
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyO') return
    e.preventDefault()
    if (isCollapsed()) setCollapsed(false)
    showSettings()
  }, true)

  // 밀도는 '조밀'로 통합 (여유/조밀 토글 제거 — 항상 조밀)
  elRoot.setAttribute('data-density', 'compact')

  // 커스텀 툴팁 — 네이티브 title 대신 패널 안(Shadow DOM)에서 렌더. 우측 도킹이라 요소 왼쪽에 표시.
  const tipEl = $('ba-tip')
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]')
    if (!el) return
    const raw = el.getAttribute('data-tip')
    // 구분선 마커(────────)는 폭 100% <hr>로, 《...》는 강조색(시안) 텍스트로 치환(나머지는 escape해 안전하게 HTML 렌더)
    if (raw.indexOf('────────') >= 0 || raw.indexOf('《') >= 0) {
      const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
      tipEl.innerHTML = esc(raw)
        .replace(/\n?────────\n?/, '<hr class="ba-tip-hr">')
        .replace(/《([^》]*)》/g, '<span class="ba-tip-accent">$1</span>')
    } else {
      tipEl.textContent = raw
    }
    tipEl.hidden = false
    const r = el.getBoundingClientRect()
    if (panelSide === 'left') { // 좌측 도킹: 요소의 오른쪽에 표시
      tipEl.style.right = 'auto'
      tipEl.style.left = Math.max(8, Math.min(window.innerWidth - tipEl.offsetWidth - 8, r.right + 8)) + 'px'
    } else { // 우측 도킹: 요소의 왼쪽에 표시
      tipEl.style.left = 'auto'
      tipEl.style.right = Math.max(8, window.innerWidth - r.left + 8) + 'px'
    }
    // 세로: 요소 상단에 맞추되, 아래로 넘치면 위로 끌어올려 뷰포트 안에 유지(긴 조건 목록 대응)
    const h = tipEl.offsetHeight
    let top = r.top
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - h)
    tipEl.style.top = top + 'px'
  })
  root.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest('[data-tip]')) tipEl.hidden = true
  })

  // 패널 내부 인라인 이름 입력 (네이티브 prompt 대체). @returns {Promise<string|null>}
  function showNameInput(defaultName, title = '이름 변경') {
    return new Promise((resolve) => {
      const bar = $('ba-namebar'); const input = $('ba-name-input')
      const ok = $('ba-name-ok'); const cancel = $('ba-name-cancel'); const pick = $('ba-folder-pick')
      $('ba-modal-title').textContent = title
      pick.hidden = true; pick.innerHTML = '' // 폴더 피커는 이 모달에서 미사용
      input.hidden = false; ok.textContent = '저장'
      input.value = defaultName || ''
      bar.hidden = false
      input.focus(); input.select()
      const finish = (val) => {
        bar.hidden = true
        ok.removeEventListener('click', onOk)
        cancel.removeEventListener('click', onCancel)
        input.removeEventListener('keydown', onKey)
        bar.removeEventListener('click', onOverlay)
        resolve(val)
      }
      const onOk = () => finish(input.value.trim() || defaultName || '')
      const onCancel = () => finish(null)
      const onOverlay = (e) => { if (e.target === bar) onCancel() } // 어두운 배경 클릭 = 취소
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onOk() }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }
      ok.addEventListener('click', onOk)
      cancel.addEventListener('click', onCancel)
      input.addEventListener('keydown', onKey)
      bar.addEventListener('click', onOverlay)
    })
  }

  // 저장 충돌 팝오버 — 오버레이 없이 강조된 북마크 바로 옆에 뜬다(북마크가 안 가림).
  // (rowId, title, message, buttons[{label,value,primary?,alt?}]) → Promise<value | 'cancel'>
  function showConflict(rowId, title, message, buttons) {
    const listEl = $('ba-list')
    highlightBookmark(listEl, rowId, { hold: true }) // 대상 북마크 강조(ring) + 스크롤
    const spot = document.createElement('div') // hole-punch focus — 대상만 남기고 주변을 어둡게(opacity 디밍이 패널 transition과 충돌해 대체)
    spot.className = 'ba-focus-spot'
    elRoot.appendChild(spot) // .ba-root 직속 → box-shadow가 패널(overflow:hidden)에 클립되어 패널만 어둡게
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    return new Promise((resolve) => {
      const pop = document.createElement('div')
      pop.className = 'ba-conflict-pop'
      pop.innerHTML =
        `<div class="ba-conflict-title">${esc(title)}</div><div class="ba-conflict-msg">${esc(message)}</div>` +
        '<div class="ba-conflict-btns"><button class="ba-conflict-btn cancel" data-v="__cancel">취소</button>' +
        buttons.map((b) => `<button class="ba-conflict-btn${b.primary ? ' primary' : b.alt ? ' alt' : ''}" data-v="${esc(b.value)}">${esc(b.label)}</button>`).join('') + '</div>'
      elRoot.appendChild(pop) // .ba-root 직속(overflow는 fixed+clamp로 회피)
      const pw = pop.offsetWidth; const ph = pop.offsetHeight
      // 행은 매번 재조회 — 대화 중 재렌더(records-changed)가 행 엘리먼트를 통째로 교체하면 캡처 참조가 stale(rect 0)이 되기 때문
      const getRow = () => listEl.querySelector(`.ba-row[data-id="${CSS.escape(rowId)}"]`)
      // 스크롤·재렌더로 대상 행이 움직이면 오버레이·팝오버가 어긋나므로, 그때마다 대상 위치로 재배치한다.
      const reposition = () => {
        const rr = elRoot.getBoundingClientRect()
        const left = Math.max(10, Math.min(rr.width - pw - 10, (rr.width - pw) / 2))
        const row = getRow()
        let top
        if (row) {
          const br = row.getBoundingClientRect()
          const P = 4 // hole-punch 오버레이를 대상 행 위에(.ba-root 상대 좌표 — fixed가 transform 조상 기준)
          spot.style.display = ''
          spot.style.top = (br.top - rr.top - P) + 'px'; spot.style.left = (br.left - rr.left - P) + 'px'
          spot.style.width = (br.width + 2 * P) + 'px'; spot.style.height = (br.height + 2 * P) + 'px'
          top = br.bottom - rr.top + 8; if (top + ph > rr.height - 10) top = br.top - rr.top - ph - 8 // 팝오버는 강조 북마크 아래(넘치면 위)
        } else { spot.style.display = 'none'; top = rr.height - ph - 14 }
        pop.style.left = left + 'px'; pop.style.top = Math.max(10, top) + 'px'
      }
      reposition()
      listEl.addEventListener('scroll', reposition, { passive: true })
      const blockWheel = (e) => e.preventDefault() // 저장 직후 튀는 휠 스크롤로 대상이 밀려 focus가 어긋나던 문제 차단(대화 동안 리스트 스크롤 잠금 — 모달)
      listEl.addEventListener('wheel', blockWheel, { passive: false })
      // 대화 중 재렌더가 행을 교체하면 강조 클래스·스크롤이 사라짐 → 새 행에 강조 재적용(재센터) 후 재배치.
      // ("다이얼로그 동안 focus가 안 잡히다가 취소하면 그제야 스크롤되던" 근본 원인 — 취소 경로만 fresh 조회였음)
      const mo = new MutationObserver(() => {
        const row = getRow()
        if (row && !row.classList.contains('ba-spot-target')) highlightBookmark(listEl, rowId, { hold: true })
        reposition()
      })
      mo.observe(listEl, { childList: true, subtree: true })
      const pb = pop.querySelector('.ba-conflict-btn.primary') || pop.querySelector('.ba-conflict-btn'); if (pb) pb.focus()
      const finish = (val) => {
        pop.remove(); spot.remove(); clearHighlight(listEl)
        mo.disconnect()
        listEl.removeEventListener('scroll', reposition); listEl.removeEventListener('wheel', blockWheel)
        document.removeEventListener('keydown', onKey, true); document.removeEventListener('click', onOut, true)
        resolve(val)
      }
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish('cancel') } }
      // 팝오버 밖 클릭 = 취소. composedPath로 검사 — document 리스너라 shadow 내부 클릭이 host로 리타겟팅돼 closest가 못 찾는 문제 회피.
      const onOut = (e) => { if (!e.composedPath().some((el) => el && el.classList && el.classList.contains('ba-conflict-pop'))) finish('cancel') }
      pop.querySelectorAll('.ba-conflict-btn').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); finish(btn.dataset.v === '__cancel' ? 'cancel' : btn.dataset.v) }))
      document.addEventListener('keydown', onKey, true)
      setTimeout(() => document.addEventListener('click', onOut, true), 0) // 다음 틱부터(트리거 클릭 무시)
    })
  }

  // 설정 모달 — ba-namebar 재사용. 현재는 '패널 위치'(좌/우). 향후 설정을 여기 모은다.
  function showSettings() {
    const bar = $('ba-namebar'); const input = $('ba-name-input'); const msg = $('ba-modal-msg')
    const ok = $('ba-name-ok'); const cancel = $('ba-name-cancel'); const alt = $('ba-name-alt'); const pick = $('ba-folder-pick')
    $('ba-modal-title').textContent = '설정'
    msg.hidden = true; input.hidden = true; alt.hidden = true; cancel.hidden = true
    ok.textContent = '닫기'
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const render = () => {
      // 내 리그 — 리그 이관 대상이자 '현재' 배지의 기준. 자동(페이지 URL → 최근 검색)으로도 대부분 맞지만,
      // 오래된 북마크 링크로 들어오면 URL이 끝난 리그라 자동 판정이 흔들린다. 그때 사용자가 못 박을 수 있게 한다.
      const leagues = Object.entries(ui.getLeagueMap())
      // 저장된 값이 목록에 없어도(리그 목록 로드 전·끝난 리그) 선택지에 남긴다 — 안 그러면 설정이 조용히 사라진 것처럼 보인다
      if (userLeague && !leagues.some(([id]) => id === userLeague)) leagues.push([userLeague, userLeague])
      const leagueRow =
        '<span class="lbl">내 리그</span>' +
        `<select class="ba-set-league" title="북마크를 되살릴 때 이 리그로 다시 검색합니다">
          <option value=""${userLeague ? '' : ' selected'}>자동 (거래소 화면·최근 검색 기준)</option>
          ${leagues.map(([id, name]) => `<option value="${esc(id)}"${id === userLeague ? ' selected' : ''}>${esc(name)}</option>`).join('')}
        </select>`
      pick.innerHTML =
        leagueRow +
        '<span class="lbl">패널 위치</span>' +
        // 선택지를 뜻하는 방향 그대로 배치한다 — '왼쪽'이 왼쪽 칸, '오른쪽'이 오른쪽 칸.
        // 반대로 두면 버튼 위치와 결과가 어긋나 매번 라벨을 읽어야 한다.
        `<span class="ba-seg ba-set-seg">
          <span class="ba-set-opt${panelSide === 'left' ? ' active' : ''}" data-side="left">왼쪽</span>
          <span class="ba-set-opt${panelSide === 'right' ? ' active' : ''}" data-side="right">오른쪽</span>
        </span>`
      pick.querySelectorAll('.ba-set-opt').forEach((o) => o.addEventListener('click', async () => {
        applySide(o.dataset.side)
        try { await chrome.storage.local.set({ uiPanelSide: o.dataset.side }) } catch (_) {}
        render()
      }))
      const sel = pick.querySelector('.ba-set-league')
      if (sel) sel.addEventListener('change', async () => { await setUserLeague(sel.value); render() })
    }
    render()
    pick.hidden = false; bar.hidden = false; ok.focus()
    const finish = () => {
      bar.hidden = true; pick.hidden = true; pick.innerHTML = ''
      input.hidden = false; cancel.hidden = false; ok.textContent = '저장' // 다른 다이얼로그용 원복
      ok.removeEventListener('click', finish); bar.removeEventListener('click', onOverlay); root.removeEventListener('keydown', onKey, true)
    }
    const onOverlay = (e) => { if (e.target === bar) finish() }
    const onKey = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish() } }
    ok.addEventListener('click', finish); bar.addEventListener('click', onOverlay); root.addEventListener('keydown', onKey, true)
  }

  // 저장 다이얼로그 — 이름 + 폴더 선택(미분류·기존 폴더·+새 폴더). @returns {Promise<{name, folderId}|null>}
  async function showSaveInput(defaultName, currentFolderId = null, title = '북마크 저장') {
    const folders = await listFolders(game)
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    return new Promise((resolve) => {
      const bar = $('ba-namebar'); const input = $('ba-name-input')
      const ok = $('ba-name-ok'); const cancel = $('ba-name-cancel'); const pick = $('ba-folder-pick')
      let folderId = currentFolderId ?? null
      let creating = false
      const cleanup = () => {
        ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); input.removeEventListener('keydown', onKey)
        bar.removeEventListener('click', onOverlay)
        bar.hidden = true; pick.hidden = true; pick.innerHTML = ''
      }
      const onOk = async () => {
        const name = input.value.trim() || defaultName || ''
        let fid = folderId
        if (creating) {
          const nname = (pick.querySelector('.ba-newfolder-input')?.value || '').trim()
          fid = nname ? (await addFolder(nname, game)).id : null
        }
        cleanup(); resolve({ name, folderId: fid })
      }
      const onCancel = () => { cleanup(); resolve(null) }
      const onOverlay = (e) => { if (e.target === bar) onCancel() } // 어두운 배경 클릭 = 취소
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onOk() }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }
      const render = () => {
        const chip = (fid, label, extra = '') =>
          `<span class="chip ${extra} ${!creating && (folderId ?? null) === (fid ?? null) ? 'active' : ''}" data-fid="${fid ?? ''}">${esc(label)}</span>`
        pick.innerHTML =
          '<span class="lbl">저장 폴더</span>' +
          chip(null, '미분류') +
          folders.map((f) => chip(f.id, f.name)).join('') +
          `<span class="chip new ${creating ? 'active' : ''}" data-new="1">+ 새 폴더</span>` +
          (creating ? '<input class="ba-newfolder-input" placeholder="새 폴더 이름" maxlength="40" />' : '')
        pick.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
          if (c.dataset.new) {
            creating = true; render()
            const ni = pick.querySelector('.ba-newfolder-input')
            if (ni) { ni.addEventListener('keydown', onKey); ni.focus() }
            return
          }
          creating = false; folderId = c.dataset.fid || null; render()
        }))
      }
      $('ba-modal-title').textContent = title
      input.hidden = false; ok.textContent = '저장'
      input.value = defaultName || ''
      pick.hidden = false; render()
      bar.hidden = false; input.focus(); input.select()
      ok.addEventListener('click', onOk); cancel.addEventListener('click', onCancel); input.addEventListener('keydown', onKey)
      bar.addEventListener('click', onOverlay)
    })
  }

  // 이동 다이얼로그 — 폴더만 선택(이름 입력 없음). showSaveInput의 폴더 피커 UI 재사용.
  // @returns {Promise<string|null|false>} 폴더 id | null(미분류) | false(취소). null과 취소를 구분해야 미분류로 이동 가능.
  async function showFolderPick(currentFolderId = null, title = '다른 폴더로 이동') {
    const folders = await listFolders(game)
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    return new Promise((resolve) => {
      const bar = $('ba-namebar'); const input = $('ba-name-input')
      const ok = $('ba-name-ok'); const cancel = $('ba-name-cancel'); const pick = $('ba-folder-pick')
      let folderId = currentFolderId ?? null
      let creating = false
      const cleanup = () => {
        ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel)
        bar.removeEventListener('click', onOverlay)
        bar.hidden = true; pick.hidden = true; pick.innerHTML = ''
        input.hidden = false; ok.textContent = '저장' // 다른 다이얼로그를 위해 namebar 원복
      }
      const onOk = async () => {
        let fid = folderId
        if (creating) {
          const nname = (pick.querySelector('.ba-newfolder-input')?.value || '').trim()
          fid = nname ? (await addFolder(nname, game)).id : null
        }
        cleanup(); resolve(fid)
      }
      const onCancel = () => { cleanup(); resolve(false) }
      const onOverlay = (e) => { if (e.target === bar) onCancel() } // 어두운 배경 클릭 = 취소
      const render = () => {
        const chip = (fid, label, extra = '') =>
          `<span class="chip ${extra} ${!creating && (folderId ?? null) === (fid ?? null) ? 'active' : ''}" data-fid="${fid ?? ''}">${esc(label)}</span>`
        pick.innerHTML =
          '<span class="lbl">이동할 폴더</span>' +
          chip(null, '미분류') +
          folders.map((f) => chip(f.id, f.name)).join('') +
          `<span class="chip new ${creating ? 'active' : ''}" data-new="1">+ 새 폴더</span>` +
          (creating ? '<input class="ba-newfolder-input" placeholder="새 폴더 이름" maxlength="40" />' : '')
        pick.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
          if (c.dataset.new) {
            creating = true; render()
            const ni = pick.querySelector('.ba-newfolder-input')
            if (ni) { ni.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onOk() } else if (e.key === 'Escape') { e.preventDefault(); onCancel() } }); ni.focus() }
            return
          }
          creating = false; folderId = c.dataset.fid || null; render()
        }))
      }
      $('ba-modal-title').textContent = title
      input.hidden = true; ok.textContent = '이동' // 이동 모드: 이름 입력 숨김, 버튼 라벨 변경
      pick.hidden = false; render()
      bar.hidden = false
      ok.addEventListener('click', onOk); cancel.addEventListener('click', onCancel)
      bar.addEventListener('click', onOverlay)
    })
  }

  const ui = {
    showNameInput, showSaveInput, showFolderPick, showConflict, toast, game, league,
    getLeagueMap: getLeagueMap || (() => ({})),
    migrateSearch, // 저장된 조건을 현재 리그로 다시 검색(renderList의 지난 리그 북마크 흐름에서 사용)
    // 아래에서 const로 정의되는 콜백들은 화살표로 감싸 '호출 시점'에 해석한다.
    // 여기서 직접 참조하면 TDZ로 터지고, 반대로 mountPanel 뒷부분에서 ui에 붙이면
    // 그 지점까지 실행이 도달하지 못했을 때 조용히 falsy가 되어 버튼이 무반응이 된다(실측 사례 있음).
    registerConditionSet: (id) => registerConditionSet(id),
    addStatsToSearch: (id) => addStatsToSearch(id),
    saveCurrentSearch: (folderId) => doSave(folderId),
    userLeague: null, // 설정에서 직접 고른 리그(빈 값 = 자동 판정). 아래 setUserLeague/저장소 로드에서 채운다
  }
  const refresh = () => renderList($('ba-list'), root, ui)

  // ── 조건 묶음 칩 ──
  // 자주 쓰는 조건 뭉치를 클릭 1회로 현재 검색에 얹는다. 거래소에서 조건 7개를 손으로 넣으면
  // 상호작용 30회가 넘는데, 여기선 1회다(lib/conditionSet.js 헤더 참조).
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  let setsEditing = false // 편집 모드 — 평소엔 삭제·이동 버튼을 숨겨 오클릭으로 묶음이 사라지지 않게
  let applyingSet = false // 연타 차단 — 요청이 몰리면 거래소 요청 제한(429)에 걸려 검색 자체가 막힌다

  const renderSets = async () => {
    const el = $('ba-sets')
    if (!el) return
    const sets = await listConditionSets(game)
    if (!sets.length) { el.hidden = true; el.innerHTML = ''; return } // 없으면 자리 차지 안 함
    el.hidden = false
    const chips = sets.map((s) => {
      const tip = esc([s.name, conditionSetSummary(s), '────────', ...s.stats.map((x) => x.text + (x.value ? ` ${x.value.min != null ? '≥' + x.value.min : ''}${x.value.max != null ? ' ≤' + x.value.max : ''}` : ''))].filter(Boolean).join('\n'))
      const edit = setsEditing
        ? `<span class="ba-set-mv" data-id="${s.id}" data-dir="-1" data-tip="앞으로">${icon('chevronRight', 11)}</span>`
          + `<span class="ba-set-mv" data-id="${s.id}" data-dir="1" data-tip="뒤로">${icon('chevronRight', 11)}</span>`
          + `<span class="ba-set-del" data-id="${s.id}" data-tip="묶음 삭제">${icon('x', 11)}</span>`
        : ''
      return `<span class="ba-set${setsEditing ? ' editing' : ''}" data-id="${s.id}" data-tip="${tip}">`
        + `<span class="ba-set-go">${icon('plus', 12)}${esc(s.name)}</span>${edit}</span>`
    }).join('')
    el.innerHTML = `<span class="ba-sets-lbl">${icon('layers', 12)}조건 묶음</span>${chips}`
      + `<span class="ba-sets-edit${setsEditing ? ' on' : ''}" data-tip="${setsEditing ? '편집 끝내기' : '묶음 삭제·순서 변경'}">${icon(setsEditing ? 'check' : 'pencil', 12)}</span>`

    el.querySelectorAll('.ba-set-go').forEach((c) => c.addEventListener('click', (e) => {
      e.stopPropagation()
      if (setsEditing) return
      runConditionSet(c.closest('.ba-set').dataset.id)
    }))
    el.querySelectorAll('.ba-set-del').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation(); await removeConditionSet(b.dataset.id); await renderSets(); toast('묶음을 삭제했습니다.')
    }))
    el.querySelectorAll('.ba-set-mv').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation(); await moveConditionSet(b.dataset.id, Number(b.dataset.dir)); await renderSets()
    }))
    const editBtn = el.querySelector('.ba-sets-edit')
    if (editBtn) editBtn.addEventListener('click', async () => { setsEditing = !setsEditing; await renderSets() })
  }

  const SET_FAIL = {
    rate: '거래소 요청이 잠시 제한됐어요. 30초쯤 뒤에 다시 시도해 주세요.',
    auth: '거래소 로그인이 풀린 것 같아요. 새로고침 후 다시 시도해 주세요.',
    network: '거래소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
    http: '거래소가 이 조건을 받아주지 않았어요.',
  }
  // 조건 얹기 공통 실행 — 현재 검색에 병합해 새 검색을 만들고 이동한다.
  // 무엇에 얹었는지는 이동 후 토스트로 알린다(이동 전에 띄우면 페이지가 바뀌며 사라진다).
  // 되돌리기는 브라우저 뒤로가기. 연타는 막는다 — 요청이 몰리면 거래소 요청 제한(429)에 걸린다.
  const applyAndGo = async (set, label) => {
    if (applyingSet) return
    if (!applyConditionSet) { toast('이 화면에서는 조건을 넣을 수 없어요.'); return }
    applyingSet = true
    try {
      toast(`"${label}" 넣는 중…`)
      const res = await applyConditionSet(set)
      if (!res || !res.ok) { toast(SET_FAIL[res && res.reason] || '조건을 넣지 못했어요.'); return }
      try { await chrome.storage.local.set({ baSetApplied: { name: label, merged: res.merged, at: Date.now() } }) } catch (_) {}
      location.href = res.url
    } finally { applyingSet = false }
  }

  const runConditionSet = async (id) => {
    if (applyingSet) return
    const set = (await listConditionSets(game)).find((s) => s.id === id)
    if (!set) return
    await applyAndGo(set, set.name)
  }

  // 조건 칩 클릭 → 그 북마크·히스토리의 **능력치만** 지금 검색에 추가한다.
  // 조건 묶음(칩 줄)과 달리 등록이 필요 없고, 매번 레코드의 원본 query를 새로 읽으므로
  // 추출 로직이 개선되면 저장된 묶음과 달리 자동으로 반영된다.
  // 유형(아이템 종류)은 일부러 뺀다 — 지금 보던 검색의 유형을 덮으면 '얹기'가 아니라 '바꾸기'가 된다.
  const addStatsToSearch = async (recId) => {
    if (applyingSet) return
    const rec = [...(await listByKind('bookmark', game)), ...(await listByKind('history', game))].find((r) => r.id === recId)
    const set = extractConditionSet(rec, getStatMap ? getStatMap() : {})
    if (!set || !set.stats.length) { toast('이 검색에는 넣을 능력치가 없어요.'); return }
    await applyAndGo({ ...set, itemType: null }, `${rec.name || rec.title || '검색'} 능력치`)
  }

  // 이동 후 1회 안내 — 새로 만든 검색인지, 보던 검색에 얹은 것인지 밝힌다(뒤로가기로 되돌릴 수 있음)
  try {
    chrome.storage.local.get('baSetApplied').then((r) => {
      const a = r && r.baSetApplied
      if (!a || Date.now() - (a.at || 0) > 15000) return // 오래된 흔적은 무시
      chrome.storage.local.remove('baSetApplied')
      toast(a.merged ? `"${a.name}"을(를) 보던 검색에 얹었어요 — 되돌리려면 뒤로가기` : `"${a.name}"으로 검색했어요`)
    })
  } catch (_) {}

  // 북마크·히스토리 ⋯ 에서 호출 — 그 검색의 조건을 묶음으로 등록한다
  const registerConditionSet = async (recId) => {
    const rec = [...(await listByKind('bookmark', game)), ...(await listByKind('history', game))].find((r) => r.id === recId)
    const set = extractConditionSet(rec, getStatMap ? getStatMap() : {})
    if (!set) { toast('이 검색에는 저장된 조건이 없어 묶음으로 만들 수 없어요.'); return }
    const name = await showNameInput(rec.name || rec.title || '새 묶음', '조건 묶음 이름')
    if (name === null) return
    const saved = await addConditionSet(name, game, set)
    if (!saved) { toast('담을 조건이 없어요.'); return }
    await renderSets()
    toast(`"${saved.name}" 묶음을 만들었어요 — ${conditionSetSummary(saved)}`)
  }

  // 내 리그 설정 — 게임별로 따로 보관(poe1·poe2는 리그 이름이 다르다). 빈 값 = 자동 판정.
  let userLeague = ''
  const applyUserLeague = (v) => { userLeague = v || ''; ui.userLeague = userLeague || null }
  const setUserLeague = async (v) => {
    applyUserLeague(v)
    try {
      const cur = (await chrome.storage.local.get('uiLeague')).uiLeague || {}
      await chrome.storage.local.set({ uiLeague: { ...cur, [game]: userLeague } })
    } catch (_) {}
    await refresh()
  }
  try {
    chrome.storage.local.get('uiLeague').then((r) => {
      const v = r && r.uiLeague && r.uiLeague[game]
      if (v) { applyUserLeague(v); refresh() }
    })
  } catch (_) {}

  // 최근(현재) 검색을 북마크로 저장 (버튼 + 단축키/팝업 + 폴더별 + 버튼 공용)
  // presetFolderId: 폴더 헤더 +에서 호출 시 그 폴더를 저장 다이얼로그에 미리 선택
  const doSave = async (presetFolderId = null) => {
    const latest = (await listByKind('history', game))[0]
    if (!latest) { toast('먼저 거래소에서 검색을 실행하세요.'); return }
    const action = await resolveSaveConflict(latest, game, ui)
    if (action.cancel) { if (action.highlightId) highlightBookmark($('ba-list'), action.highlightId); return }
    if (action.overwriteId) {
      await overwriteBookmark(action.overwriteId, overwriteSource(latest))
      await refresh()
      highlightBookmark($('ba-list'), action.overwriteId)
      toast('최신 검색으로 덮어썼습니다.')
      return
    }
    const res = await showSaveInput(suggestName(latest), presetFolderId)
    if (res === null) return
    const saved = await addBookmark(
      {
        game: latest.game, league: latest.league, url: latest.url,
        title: latest.title, itemType: latest.itemType, name: latest.name,
        stats: latest.stats, statGroups: latest.statGroups,
        otherFilters: latest.otherFilters, priceFilter: latest.priceFilter, icon: latest.icon, snapshot: latest.snapshot,
        dedupeKey: latest.dedupeKey, folderId: res.folderId,
      },
      res.name || latest.title,
    )
    await refresh()
    highlightBookmark($('ba-list'), saved.id)
    toast('북마크에 저장했습니다.')
  }
  $('ba-save').onclick = () => doSave() // 클릭 이벤트가 presetFolderId로 새지 않게 래핑
  $('ba-foot-guide').onclick = () => startTour()
  const gearBtn = $('ba-gear'); if (gearBtn) gearBtn.onclick = () => showSettings()
  // 영문 거래소 전환 버튼 — 상단 공간 절약을 위해 현재 마크업을 숨김(head 템플릿에서 제거).
  // 핸들러는 복원 대비 유지(버튼이 없으면 아래 가드로 무효). 복원 시 .ba-convert-row 마크업만 되살리면 됨.
  const convertBtn = $('ba-convert')
  if (convertBtn) convertBtn.onclick = async () => {
    const cur = getCurrentSearch && getCurrentSearch()
    if (!cur) { toast('먼저 거래소에서 검색을 한 번 실행해 주세요.'); return }
    toast('영문 거래소를 여는 중…')
    try {
      const r = await chrome.runtime.sendMessage({ type: 'ba-convert', game, query: cur.query, league: cur.league })
      if (r && r.reason === 'no-permission') toast('확장 팝업에서 "영문 거래소 전환"을 먼저 켜주세요.')
      else if (!r || !r.ok) toast('전환에 실패했어요. 다시 시도해 주세요.')
    } catch (_) { toast('전환에 실패했어요.') }
  }

  // ── 사용법 가이드 코치마크 (4스텝) ──
  const TOUR = [
    { sel: '#ba-save', title: '자주하는 검색은 북마크로', body: '거래소에서 검색하면 자동 기록돼요. 그중 자주 쓰는 검색은 "현재 검색 저장"으로 영구 보관하고, 저장할 때 폴더도 바로 고를 수 있어요.' },
    { sel: '.ba-pob-btn', global: true, demo: true, title: '아이템을 PoB로', body: '검색 결과 카드의 "PoB" 버튼을 누르면 그 아이템을 영문 Path of Building import 텍스트로 복사해요.' },
    { sel: '.ba-exr-chip', global: true, demo: true, title: '가격을 한눈에', body: '제시 가격(POE1 카오스, POE2 엑잘) 옆에 환산값이 자동으로 붙어요 — 서미누기 환율 기준.' },
    { sel: '.ba-folder-savechip', title: '폴더에 바로 저장', body: '각 폴더 맨 위의 "+ 이 폴더에 현재 검색 저장"을 누르면, 지금 거래소 검색을 그 폴더로 곧장 넣을 수 있어요.' },
    { sel: '.ba-open', title: '한 번에 다시 열기', body: '북마크 이름을 클릭하면 그 검색을 거래소에서 그대로 다시 엽니다. 복잡한 조건을 다시 짤 필요가 없어요.' },
    { sel: '.ba-price-pill', title: '검색 시점 시세', body: '가격에 마우스를 올리면 검색 당시 매물 기준 시세(빠르게 팔리는 가격)를 보여줘요. 북마크를 열면 최신 시세로 갱신됩니다.' },
    { sel: '.ba-more', title: '카드 액션 모음', body: '⋯ 를 누르면 검색 링크 복사, 내 리그로 다시 검색, 최근 검색으로 갱신, 이름 변경, 다른 폴더로 이동, 삭제 메뉴가 떠요. 리그가 바뀌어 깨진 북마크는 "내 리그로 다시 검색"으로 되살립니다.' },
    { sel: '.ba-folder-ic[data-id]', title: '폴더 색상 구분', body: '폴더 아이콘을 클릭하면 색을 바꿀 수 있어요. 색으로 분류하면 원하는 폴더를 한눈에 찾습니다.' },
    { sel: '.ba-action-row', title: '정리 도구', body: '모든 폴더 접기·펼치기와 새 폴더 추가가 여기 모여 있어요.' },
    { sel: '.ba-io-group', title: '백업 · 공유 (JSON)', body: '북마크를 JSON 파일로 내보내 백업하거나 다른 사람과 공유할 수 있어요. 받은 JSON은 가져오기로 합쳐집니다. 특정 폴더만 내보내려면 폴더 헤더의 ⬇ 아이콘을 쓰세요.' },
    { sel: '.ba-sec-hist', title: '자동 기록된 히스토리', body: '최근 검색이 시간과 함께 자동 적재됩니다. ☆를 누르면 바로 북마크로 승격돼요.' },
    { sel: '.ba-econ-row', title: '시세는 서미누기에서', body: '아이템 시세·시장 동향 버튼으로 서미누기의 POE 경제 데이터를 바로 확인할 수 있어요.' },
    { sel: '.ba-gear', title: '설정', body: '⚙ 을 누르면 패널 위치(좌/우) 등을 바꿀 수 있어요 (Alt+O).' },
    { sel: '#ba-handle', title: '언제든 접기', body: '우측 핸들을 클릭하면 패널을 접고 펼칠 수 있어요 (Alt+B).' },
    { sel: '.ba-kbd-chip', title: '단축키 모음 & 변경', body: '⌨ 칩에 마우스를 올리면 모든 단축키가 정리돼 떠요 — Alt+A 능력치 필터 추가(반복 시 그룹 전환)가 특히 편해요. 패널 단축키(Alt+B·S)는 chrome://extensions/shortcuts 에서 직접 바꿀 수 있어요. 준비 끝!' },
  ]
  async function startTour() {
    const wasCollapsed = isCollapsed()
    setCollapsed(false)
    // 패널이 접혀 있다가 열리는 거면 .ba-root의 슬라이드인(.26s)이 끝날 때까지 기다린다 — 그 전에 첫 스텝을
    // 측정하면 대상이 슬라이드 도중 위치로 잡혀, 패널이 마저 열리는 동안 스포트라이트·화살표가 실제 위치와 어긋난다.
    if (wasCollapsed) await new Promise((r) => setTimeout(r, 280))
    // 첫 화면처럼 비어 있으면 투어 동안만 데모 데이터를 띄운다(종료 시 제거 — 실제 저장소 무오염)
    let demoOn = false
    // 북마크·폴더·가격이 없으면(히스토리만 쌓인 흔한 상태 포함) 투어 동안만 데모를 띄운다 — 없으면 5·6·8스텝이 가리킬 대상이 없다
    // 데모를 페이지 URL의 리그로 심으면 안 된다 — 옛 북마크 링크로 들어온 상태면 그 URL이 이미 끝난 리그라
    // 예시 데이터가 'Settlers' 같은 옛 리그 섹션(지난 배지·접힘)에 들어가 사용자를 헷갈리게 한다.
    // 살아있는 리그(설정 → 페이지 → 최근 검색)를 쓰고, 하나도 못 정하면 실제 리그명 대신 '예전 리그'로 적는다.
    const demoLeague =
      resolveCurrentLeague(
        { userLeague, pageLeague: league, history: await listByKind('history', game) },
        leagueInfo(ui.getLeagueMap()),
      ) || '예전 리그'
    try { if (await needsTourDemo(game)) { await seedDemoData(game, demoLeague); demoOn = true; await refresh(); await new Promise((r) => setTimeout(r, 90)) } } catch (_) {}
    let i = 0
    const card = document.createElement('div')
    card.className = 'ba-tour-card'
    const box = document.createElement('div') // 스포트라이트 구멍 — 주변을 어둡게(box-shadow) + 숨쉬는 테두리
    box.className = 'ba-tour-spot'
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg') // 스포트라이트↔카드가 멀 때(예: global 스텝) 연결선으로 강조
    arrow.setAttribute('class', 'ba-tour-arrow')
    arrow.innerHTML = '<defs><marker id="ba-tour-arrowhead" markerWidth="14" markerHeight="16" refX="14" refY="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L14,8 L0,16 Z" class="ba-tour-arrowhead"></path></marker></defs><path class="ba-tour-arrow-line" marker-end="url(#ba-tour-arrowhead)"></path>'
    root.appendChild(box)
    root.appendChild(arrow)
    root.appendChild(card)
    const finish = () => { box.remove(); arrow.remove(); card.remove(); document.removeEventListener('keydown', onKeyNav, true); if (tourDemo) tourDemo.hide(); if (demoOn) { clearDemoData().then(() => refresh()).catch(() => {}) } try { chrome.storage.local.set({ tourDone: true }) } catch (_) {} }
    const goNext = () => { i += 1; if (i >= TOUR.length) finish(); else render() }
    const goPrev = () => { if (i > 0) { i -= 1; render() } }
    // 방향키로도 이전/다음 이동 — 페이지 검색창 등에 포커스가 있으면(텍스트 커서 이동 용도) 가로채지 않는다
    const onKeyNav = (e) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const ae = document.activeElement
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return
      e.preventDefault()
      if (e.key === 'ArrowRight') goNext(); else goPrev()
    }
    document.addEventListener('keydown', onKeyNav, true)
    const place = (target) => {
      const rc = target ? target.getBoundingClientRect() : null
      if (!rc || (!rc.width && !rc.height)) { box.style.opacity = '0'; return null }
      // 콘텐츠 영역(패딩 제외) 기준 + 대칭 여백 — 비대칭 패딩(예: 섹션 헤더 padding-bottom)에서도 위아래 여백이 같게
      const cs = getComputedStyle(target)
      const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0
      const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0
      const PAD = 5
      const top = rc.top + pt - PAD, left = rc.left + pl - PAD
      const width = rc.width - pl - pr + 2 * PAD, height = rc.height - pt - pb + 2 * PAD
      box.style.opacity = '1'
      box.style.top = top + 'px'
      box.style.left = left + 'px'
      box.style.width = width + 'px'
      box.style.height = height + 'px'
      return { top, left, width, height } // .ba-tour-spot엔 top/left/width/height 트랜지션이 걸려 있어 — 방금 바꾼 스타일을
      // 동기 getBoundingClientRect()로 되읽으면 트랜지션 시작 전(이전 스텝) 값이 나온다. 화살표는 이 계산값을 직접 써야 정확하다.
    }
    // 내 상하좌우 네 변의 "가운데" 점 중 상대 중심에 실제로 가장 가까운 곳을 고른다(중심점 dx/dy 비율로
    // 축만 판단하면 옆으로 넓적한 상자는 실제로 더 가까운 변이 있어도 비율 때문에 엉뚱한 변을 고르게 된다 —
    // 네 후보 거리를 직접 비교하는 쪽이 "가까운 곳"이라는 뜻 그대로다). nx/ny는 그 변의 바깥 방향(수직) — 곡선
    // 제어점 계산에 씀. 모서리를 비스듬히 스치지 않고 늘 변의 가운데에서 나가고 들어온다.
    const edgeAnchor = (rect, otherX, otherY, pad) => {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
      const candidates = [
        { x: cx, y: rect.top - pad, nx: 0, ny: -1 },
        { x: cx, y: rect.top + rect.height + pad, nx: 0, ny: 1 },
        { x: rect.left - pad, y: cy, nx: -1, ny: 0 },
        { x: rect.left + rect.width + pad, y: cy, nx: 1, ny: 0 },
      ]
      let best = candidates[0], bestDist = Infinity
      for (const c of candidates) {
        const d = Math.hypot(c.x - otherX, c.y - otherY)
        if (d < bestDist) { bestDist = d; best = c }
      }
      return best
    }
    const HEAD = 14 // 화살촉(SVG 마커) 길이. neck→apex를 이 길이의 '직선'으로 그어 선이 화살촉 정중앙에 물리게 한다.
    const positionArrow = (br) => {
      const cr = card.getBoundingClientRect()
      if (!br || !cr.width) { arrow.style.opacity = '0'; return }
      const bc = { x: br.left + br.width / 2, y: br.top + br.height / 2 }
      const cc = { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 }
      const a = edgeAnchor(br, cc.x, cc.y, 0) // 스포트라이트 쪽 변 중앙 + 바깥 법선(a.nx/ny)
      const c = edgeAnchor(cr, bc.x, bc.y, 0) // 카드 쪽 변 중앙 + 바깥 법선
      const gap = Math.hypot(a.x - c.x, a.y - c.y)
      // 화살촉이 요소 테두리를 살짝 안 물게 apex를 바깥으로 조금 띄운다. 자리가 좁으면 화살촉 길이도 줄여 곡선이 접히지 않게.
      const tipGap = Math.min(7, gap * 0.12)
      const head = Math.min(HEAD, gap * 0.5)
      const apex = { x: a.x + a.nx * tipGap, y: a.y + a.ny * tipGap } // 화살촉 끝(뾰족한 곳) — 스포트라이트를 가리킴
      const neck = { x: apex.x + a.nx * head, y: apex.y + a.ny * head } // 화살촉 밑동 = 곡선이 직선으로 바뀌는 지점
      const start = { x: c.x + c.nx * 12, y: c.y + c.ny * 12 } // 카드 쪽 시작(그림자 여백 12)
      // 베지어는 neck에서 끝나되 끝 접선을 화살촉 축(-a.n, 요소 쪽)에 맞춰 곡선→직선이 매끄럽게 이어진다.
      // 이어서 neck→apex를 '직선'으로 그으면 화살촉이 그 위에 정확히 얹혀, 선이 화살촉 옆이 아닌 정중앙에 연결된다.
      const span = Math.hypot(neck.x - start.x, neck.y - start.y)
      const bow = Math.min(80, Math.max(16, span * 0.32))
      const c1 = { x: start.x + c.nx * bow, y: start.y + c.ny * bow } // 카드 변에서 수직으로 빠져나가듯(법선은 앵커 c의 것)
      const c2 = { x: neck.x + a.nx * bow, y: neck.y + a.ny * bow } // neck 접선을 화살촉 축과 일치시킴
      const path = arrow.querySelector('.ba-tour-arrow-line')
      path.setAttribute('d', `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${neck.x} ${neck.y} L ${apex.x} ${apex.y}`)
      arrow.style.opacity = '1'
    }
    const render = () => {
      const step = TOUR[i]
      // global: 패널(shadow root) 밖 — 거래소 페이지에 주입한 PoB 버튼·환산 칩처럼 document 쪽 대상.
      // 검색 결과 없이 투어를 시작하면 아직 안 떠 있을 수 있어(스포트라이트만 자동 숨김, place()의 기존 0-rect 처리로 대응).
      const scope = step.global ? document : root
      let target = scope.querySelector(step.sel)
      // 페이지 쪽 대상(PoB 버튼·환산 칩)이 없으면 = 검색 결과가 없는 화면 → 투어 동안만 '예시' 요소를 놓고 그걸 가리킨다.
      // (패널이 빈 목록에서 seedDemoData로 예시를 띄우는 것과 같은 처리) 예시가 필요 없는 스텝에선 즉시 치운다.
      if (tourDemo) {
        if (step.demo && (!target || !target.getBoundingClientRect().width)) {
          tourDemo.show(panelSide)
          target = scope.querySelector(step.sel)
        } else if (!step.demo) tourDemo.hide()
      }
      if (target && !target.getBoundingClientRect().width) {
        // 접힌 폴더·리그 섹션 안이면 투어 동안만 임시로 펼쳐 대상이 보이게(사용자 설정 Set은 건드리지 않음).
        // 리그 섹션은 끝난 리그가 기본 접힘이라, 북마크가 지난 리그에만 있으면 여기서 걸린다.
        const foldedLeague = target.closest('.ba-league--collapsed')
        if (foldedLeague) foldedLeague.classList.remove('ba-league--collapsed')
        const folded = target.closest('.ba-folder--collapsed')
        if (folded) folded.classList.remove('ba-folder--collapsed')
        if (!target.getBoundingClientRect().width) {
          target = [...scope.querySelectorAll(step.sel)].find((e) => e.getBoundingClientRect().width) || target
        }
      }
      card.innerHTML = `<div class="ba-tour-step">${i + 1} / ${TOUR.length}</div><div class="ba-tour-title">${step.title}</div><p>${step.body}</p><div class="ba-tour-btns"><button class="ba-tour-skip">건너뛰기</button>${i > 0 ? '<button class="ba-tour-prev">이전</button>' : ''}<button class="ba-tour-next">${i === TOUR.length - 1 ? '완료' : '다음'}</button></div><div class="ba-tour-kbdhint">${i > 0 ? '<kbd>←</kbd>' : ''}<kbd>→</kbd> 방향키로 이동</div>`
      card.querySelector('.ba-tour-next').onclick = goNext
      card.querySelector('.ba-tour-skip').onclick = finish
      const prevBtn = card.querySelector('.ba-tour-prev'); if (prevBtn) prevBtn.onclick = goPrev
      if (target) target.scrollIntoView({ block: 'center' }) // instant — 동기 스크롤이라 직후 rect가 정확
      const boxRect = place(target) // 동기 즉시 배치 — rAF·setTimeout은 비활성 탭에서 지연/정지되므로 사용 안 함
      const rc = target ? target.getBoundingClientRect() : null
      card.style.top = (rc ? Math.min(window.innerHeight - 180, Math.max(8, rc.bottom + 12)) : 80) + 'px'
      if (panelSide === 'left') { card.style.left = '420px'; card.style.right = 'auto' } // 좌/우 배치 대응
      else { card.style.right = '420px'; card.style.left = 'auto' }
      positionArrow(boxRect)
    }
    render()
  }

  // 단축키 칩: 호버 시 팝오버 표시(.ba-kbd-wrap:hover). 패널이 overflow:hidden이라
  // absolute면 잘림 → position:fixed로 띄우고 JS로 칩 아래 배치(.ba-root 기준, 패널 좌우 클램프).
  ;(() => {
    const wrap = root.querySelector('.ba-kbd-wrap')
    if (!wrap) return
    const chip = wrap.querySelector('.ba-kbd-chip')
    const pop = wrap.querySelector('.ba-kbd-pop')
    const positionPop = () => {
      const cr = chip.getBoundingClientRect()
      const rr = elRoot.getBoundingClientRect()
      const popW = pop.offsetWidth || 278
      let leftVp = cr.right - popW // 칩 우측에 맞춤
      const minVp = rr.left + 12
      const maxVp = rr.right - 12 - popW
      if (leftVp < minVp) leftVp = minVp
      if (leftVp > maxVp) leftVp = maxVp
      // .ba-root에 transform이 있어 position:fixed가 .ba-root 기준 → .ba-root-상대 좌표로 변환
      pop.style.left = Math.round(leftVp - rr.left) + 'px'
      pop.style.top = Math.round(cr.bottom - rr.top + 9) + 'px'
    }
    wrap.addEventListener('mouseenter', positionPop)
  })()

  document.addEventListener('ba:records-changed', () => { refresh(); updateHandleBadge() })
  renderSets()
  // 팝업에서 패널 좌/우 배치를 바꾸면 즉시 반영
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      if (changes.uiPanelSide) applySide(changes.uiPanelSide.newValue || 'right')
      // 다른 탭에서 리그를 바꾸면 이 탭도 따라간다(같은 게임일 때만)
      if (changes.uiLeague) {
        const v = (changes.uiLeague.newValue || {})[game] || ''
        if (v !== userLeague) { applyUserLeague(v); refresh() }
      }
      if (changes.conditionSets) renderSets() // 다른 탭에서 묶음을 추가·삭제하면 칩 줄도 따라간다
    })
  } catch (_) {}
  refresh()

  // 첫 실행 가이드(1회, tourDone) + 팝업 "다시 보기"(baTourRestart) 재실행
  try {
    chrome.storage.local.get(['tourDone', 'baTourRestart']).then((r) => {
      if (r && r.baTourRestart) { chrome.storage.local.remove('baTourRestart'); setTimeout(startTour, 600) }
      else if (!r || !r.tourDone) setTimeout(startTour, 1200)
    })
  } catch (_) {}

  return {
    toggle: () => setCollapsed(!isCollapsed()),
    show: () => setCollapsed(false),
    hide: () => setCollapsed(true),
    save: doSave,
    startTour,
  }
}
