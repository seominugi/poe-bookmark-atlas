import css from './panel.css?inline'
import { renderList, highlightBookmark, analystUrl, researcherUrl } from './renderList.js'
import { icon } from '../../lib/icons.js'
import { listByKind, addBookmark, findBookmark, listFolders, addFolder } from '../../store/store.js'
import { suggestName } from '../../lib/suggestName.js'
import cafeIcon from '../../icons/naver_cafe_logo.webp'
import ytIcon from '../../icons/yt_icon_rgb.png'
import discordIcon from '../../icons/icon_clyde_white_RGB.png'

// 소셜 로고 — content script(ISOLATED)라 확장 URL로 해석
const cafeUrl = chrome.runtime.getURL(cafeIcon)
const ytUrl = chrome.runtime.getURL(ytIcon)
const discordUrl = chrome.runtime.getURL(discordIcon)

const ECON_ITEMS = { poe1: 'https://seominugi.com/poe1/economy/items', poe2: 'https://seominugi.com/poe2/economy/items' }
const ECON_TREND = { poe1: 'https://seominugi.com/poe1/economy/trends', poe2: 'https://seominugi.com/poe2/economy/trends' }

export function mountPanel({ game, league }) {
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
        <span class="ba-title">북마크 아틀라스 · ${game === 'poe2' ? 'POE2' : 'POE1'}</span>
        <button class="ba-save" id="ba-save" data-tip="최근 검색을 북마크로 저장">${icon('bookmark', 14)}현재 검색 저장</button>
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
        <input class="ba-name-input" id="ba-name-input" placeholder="북마크 이름" maxlength="60" />
        <button class="ba-name-ok" id="ba-name-ok">저장</button>
        <button class="ba-name-cancel" id="ba-name-cancel">취소</button>
        <div class="ba-folder-pick" id="ba-folder-pick" hidden></div>
      </div>
      <div class="ba-list" id="ba-list"></div>
      <div class="ba-foot">
        <div class="ba-foot-tx">
          <span class="ba-foot-chip-wrap"><span class="ba-foot-glow"></span><span class="ba-foot-chip"><span class="ba-foot-glint"></span><b>서미누기 제작</b></span></span>
          <small>피드백 · 문의 — 버그·건의 환영</small>
        </div>
        <a class="ba-foot-soc ba-foot-soc--cafe" href="https://cafe.naver.com/seominugi" target="_blank" rel="noopener" data-tip="네이버 카페에서 문의하기"><img src="${cafeUrl}" alt="네이버 카페"></a>
        <a class="ba-foot-soc ba-foot-soc--yt" href="https://www.youtube.com/@seominugi" target="_blank" rel="noopener" data-tip="유튜브 채널 바로가기"><img src="${ytUrl}" alt="유튜브"></a>
        <a class="ba-foot-soc ba-foot-soc--dc" href="https://discord.gg/kEm2G2qcZQ" target="_blank" rel="noopener" data-tip="디스코드 서버 참여"><img src="${discordUrl}" alt="디스코드"></a>
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
  // 펼쳤을 때 페이지 콘텐츠를 왼쪽으로 밀어 패널 자리를 확보(도킹) → 검색 영역과 겹침 방지
  const applyPagePush = (collapsed) => {
    try {
      document.documentElement.style.setProperty('margin-right', collapsed ? '' : '390px', 'important')
      document.documentElement.style.setProperty('transition', 'margin-right .25s ease', 'important')
    } catch (_) {}
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
    chrome.storage.local.get('uiCollapsed').then((r) => {
      if (r && typeof r.uiCollapsed === 'boolean') { elRoot.classList.toggle('collapsed', r.uiCollapsed); applyPagePush(r.uiCollapsed) }
      updateHandleBadge()
    })
  } catch (_) {}
  updateHandleBadge()

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
    })
    const endDrag = (e) => { if (!dragging) return; dragging = false; try { grip.releasePointerCapture(e.pointerId) } catch (_) {} }
    grip.addEventListener('pointerup', endDrag)
    grip.addEventListener('pointercancel', endDrag)
  })()

  let toastTimer = null
  const toast = (msg) => {
    const t = $('ba-toast'); t.textContent = msg; t.hidden = false
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true }, 2200)
  }

  // 정보 밀도 (여유/조밀) — 북마크 섹션 헤더의 토글로 제어. chrome.storage 영속화.
  let density = 'comfortable'
  const applyDensity = (d) => { density = d; elRoot.setAttribute('data-density', d) }
  applyDensity(density)
  try { chrome.storage.local.get('uiDensity').then((r) => { if (r && r.uiDensity && r.uiDensity !== density) { applyDensity(r.uiDensity); refresh() } }) } catch (_) {}

  // 커스텀 툴팁 — 네이티브 title 대신 패널 안(Shadow DOM)에서 렌더. 우측 도킹이라 요소 왼쪽에 표시.
  const tipEl = $('ba-tip')
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]')
    if (!el) return
    tipEl.textContent = el.getAttribute('data-tip')
    tipEl.hidden = false
    const r = el.getBoundingClientRect()
    tipEl.style.left = 'auto'
    tipEl.style.right = Math.max(8, window.innerWidth - r.left + 8) + 'px'
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
  function showNameInput(defaultName) {
    return new Promise((resolve) => {
      const bar = $('ba-namebar'); const input = $('ba-name-input')
      const ok = $('ba-name-ok'); const cancel = $('ba-name-cancel')
      input.value = defaultName || ''
      bar.hidden = false
      input.focus(); input.select()
      const finish = (val) => {
        bar.hidden = true
        ok.removeEventListener('click', onOk)
        cancel.removeEventListener('click', onCancel)
        input.removeEventListener('keydown', onKey)
        resolve(val)
      }
      const onOk = () => finish(input.value.trim() || defaultName || '')
      const onCancel = () => finish(null)
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onOk() }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }
      ok.addEventListener('click', onOk)
      cancel.addEventListener('click', onCancel)
      input.addEventListener('keydown', onKey)
    })
  }

  // 저장 다이얼로그 — 이름 + 폴더 선택(미분류·기존 폴더·+새 폴더). @returns {Promise<{name, folderId}|null>}
  async function showSaveInput(defaultName, currentFolderId = null) {
    const folders = await listFolders(game)
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    return new Promise((resolve) => {
      const bar = $('ba-namebar'); const input = $('ba-name-input')
      const ok = $('ba-name-ok'); const cancel = $('ba-name-cancel'); const pick = $('ba-folder-pick')
      let folderId = currentFolderId ?? null
      let creating = false
      const cleanup = () => {
        ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); input.removeEventListener('keydown', onKey)
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
      input.value = defaultName || ''
      pick.hidden = false; render()
      bar.hidden = false; input.focus(); input.select()
      ok.addEventListener('click', onOk); cancel.addEventListener('click', onCancel); input.addEventListener('keydown', onKey)
    })
  }

  const ui = {
    showNameInput, showSaveInput, toast, game, league,
    getDensity: () => density,
    setDensity: (d) => { applyDensity(d); try { chrome.storage.local.set({ uiDensity: d }) } catch (_) {} refresh() },
  }
  const refresh = () => renderList($('ba-list'), root, ui)

  // 최근(현재) 검색을 북마크로 저장 (버튼 + 단축키/팝업 공용)
  const doSave = async () => {
    const latest = (await listByKind('history', game))[0]
    if (!latest) { toast('먼저 거래소에서 검색을 실행하세요.'); return }
    const dup = await findBookmark(latest.dedupeKey, game)
    if (dup) { toast('이미 같은 조건의 북마크가 있습니다.'); highlightBookmark($('ba-list'), dup.id); return }
    const res = await showSaveInput(suggestName(latest))
    if (res === null) return
    await addBookmark(
      {
        game: latest.game, league: latest.league, url: latest.url,
        title: latest.title, itemType: latest.itemType, name: latest.name,
        stats: latest.stats, statGroups: latest.statGroups, priceFilter: latest.priceFilter, snapshot: latest.snapshot,
        dedupeKey: latest.dedupeKey, folderId: res.folderId,
      },
      res.name || latest.title,
    )
    refresh()
    toast('북마크에 저장했습니다.')
  }
  $('ba-save').onclick = doSave

  // ── 사용법 가이드 코치마크 (4스텝) ──
  const TOUR = [
    { sel: '#ba-save', title: '① 좋은 검색은 북마크로', body: '거래소에서 검색하면 자동 기록돼요. 그중 좋은 검색은 "현재 검색 저장"으로 영구 보관하고, 저장 시 폴더도 바로 고를 수 있어요.' },
    { sel: '.ba-open', title: '② 한 번에 다시 열기', body: '북마크 이름을 클릭하면 그 검색을 거래소에서 그대로 다시 엽니다. 복잡한 조건을 다시 짤 필요가 없어요.' },
    { sel: '.ba-sec-hist', title: '③ 자동 기록된 히스토리', body: '최근 검색이 시간과 함께 자동 적재됩니다. ☆를 누르면 바로 북마크로 승격돼요.' },
    { sel: '.ba-econ-row', title: '④ 시세는 서미누기에서', body: '아이템 시세·시장 동향 버튼으로 서미누기의 POE 경제 데이터를 바로 확인할 수 있어요.' },
    { sel: '#ba-handle', title: '⑤ 언제든 접기', body: '우측 핸들을 클릭하면 패널을 접고 펼칠 수 있어요. 단축키는 Alt+B 입니다. 준비 끝!' },
  ]
  function startTour() {
    setCollapsed(false)
    let i = 0
    let prev = null
    const card = document.createElement('div')
    card.className = 'ba-tour-card'
    root.appendChild(card)
    const clearHL = () => { if (prev) prev.classList.remove('ba-tour-hl') }
    const finish = () => { clearHL(); card.remove(); try { chrome.storage.local.set({ tourDone: true }) } catch (_) {} }
    const render = () => {
      const step = TOUR[i]
      const target = root.querySelector(step.sel)
      clearHL()
      if (target) { target.classList.add('ba-tour-hl'); prev = target; target.scrollIntoView({ block: 'nearest' }) }
      card.innerHTML = `<div class="ba-tour-step">${i + 1} / ${TOUR.length}</div><div class="ba-tour-title">${step.title}</div><p>${step.body}</p><div class="ba-tour-btns"><button class="ba-tour-skip">건너뛰기</button><button class="ba-tour-next">${i === TOUR.length - 1 ? '완료' : '다음'}</button></div>`
      const rect = target ? target.getBoundingClientRect() : null
      card.style.top = (rect ? Math.min(window.innerHeight - 170, Math.max(8, rect.bottom + 8)) : 80) + 'px'
      card.querySelector('.ba-tour-next').onclick = () => { i += 1; if (i >= TOUR.length) finish(); else render() }
      card.querySelector('.ba-tour-skip').onclick = finish
    }
    render()
  }

  document.addEventListener('ba:records-changed', () => { refresh(); updateHandleBadge() })
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
