import css from './panel.css?inline'
import { renderList, highlightBookmark, analystUrl, researcherUrl } from './renderList.js'
import { icon } from '../../lib/icons.js'
import { listByKind, addBookmark, findBookmark, listFolders, addFolder } from '../../store/store.js'
import { suggestName } from '../../lib/suggestName.js'

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
      <div class="ba-handle" id="ba-handle">북마크</div>
      <div class="ba-head">
        <span class="ba-title">북마크 아틀라스 · ${game === 'poe2' ? 'POE2' : 'POE1'}</span>
        <div class="ba-head-actions">
          <button class="ba-density" id="ba-density" data-tip="정보 밀도 전환 (여유 ↔ 조밀)">${icon('layers', 15)}</button>
          <button class="ba-save" id="ba-save" data-tip="최근 검색을 북마크로 저장">${icon('bookmark', 14)}현재 검색 저장</button>
        </div>
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
      <div class="ba-social">
        <a class="ba-soc" href="https://www.youtube.com/@seominugi" target="_blank" rel="noopener" data-tip="유튜브 채널">${icon('play', 12)}유튜브</a>
        <a class="ba-soc" href="https://discord.gg/kEm2G2qcZQ" target="_blank" rel="noopener" data-tip="디스코드 — 피드백·버그 제보">${icon('chat', 12)}디스코드</a>
        <a class="ba-soc" href="https://cafe.naver.com/seominugi" target="_blank" rel="noopener" data-tip="네이버 카페">${icon('coffee', 12)}카페</a>
        <a class="ba-donate" href="https://toon.at/donate/seominugi" target="_blank" rel="noopener" data-tip="투네이션으로 후원하기 — 감사합니다!">${icon('heart', 12)}후원</a>
      </div>
      <div class="ba-namebar" id="ba-namebar" hidden>
        <input class="ba-name-input" id="ba-name-input" placeholder="북마크 이름" maxlength="60" />
        <button class="ba-name-ok" id="ba-name-ok">저장</button>
        <button class="ba-name-cancel" id="ba-name-cancel">취소</button>
        <div class="ba-folder-pick" id="ba-folder-pick" hidden></div>
      </div>
      <div class="ba-list" id="ba-list"></div>
      <div class="ba-toast" id="ba-toast" hidden></div>
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
  const setCollapsed = (collapsed) => {
    elRoot.classList.toggle('collapsed', collapsed)
    applyPagePush(collapsed)
    try { chrome.storage.local.set({ uiCollapsed: collapsed }) } catch (_) {}
  }
  // 초기 상태: 좁은 화면은 접힘(검색 영역 겹침 방지), 넓으면 펼침. 사용자 토글 선호는 기억.
  if (window.innerWidth < 1700) elRoot.classList.add('collapsed')
  applyPagePush(isCollapsed())
  try {
    chrome.storage.local.get('uiCollapsed').then((r) => {
      if (r && typeof r.uiCollapsed === 'boolean') { elRoot.classList.toggle('collapsed', r.uiCollapsed); applyPagePush(r.uiCollapsed) }
    })
  } catch (_) {}
  $('ba-handle').onclick = () => setCollapsed(!isCollapsed())

  let toastTimer = null
  const toast = (msg) => {
    const t = $('ba-toast'); t.textContent = msg; t.hidden = false
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true }, 2200)
  }

  // 정보 밀도 (여유/조밀) — 노안 배려 기본은 여유. chrome.storage 영속화.
  let density = 'comfortable'
  const applyDensity = (d) => { density = d; elRoot.setAttribute('data-density', d) }
  applyDensity(density)
  try { chrome.storage.local.get('uiDensity').then((r) => { if (r && r.uiDensity) applyDensity(r.uiDensity) }) } catch (_) {}
  $('ba-density').onclick = () => {
    const next = density === 'comfortable' ? 'compact' : 'comfortable'
    applyDensity(next)
    try { chrome.storage.local.set({ uiDensity: next }) } catch (_) {}
    toast(next === 'compact' ? '조밀 모드' : '여유 모드')
  }

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

  const ui = { showNameInput, showSaveInput, toast, game, league }
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
    { sel: '#ba-save', text: '거래소에서 검색하면 자동으로 기록돼요. 마음에 드는 검색은 여기서 북마크로 저장하세요.' },
    { sel: '.ba-sec-head', text: '북마크는 폴더로 정리하고, 손잡이를 잡아 드래그로 순서·폴더를 옮길 수 있어요.' },
    { sel: '.ba-list', text: '북마크 이름을 클릭하면 그 검색을 그대로 다시 열어요. 링크 복사·JSON 내보내기도 됩니다.' },
    { sel: '#ba-handle', text: '이 손잡이로 패널을 접고 펼 수 있어요. 단축키는 Alt+B 입니다.' },
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
      card.innerHTML = `<div class="ba-tour-step">${i + 1} / ${TOUR.length}</div><p>${step.text}</p><div class="ba-tour-btns"><button class="ba-tour-skip">건너뛰기</button><button class="ba-tour-next">${i === TOUR.length - 1 ? '완료' : '다음'}</button></div>`
      const rect = target ? target.getBoundingClientRect() : null
      card.style.top = (rect ? Math.min(window.innerHeight - 170, Math.max(8, rect.bottom + 8)) : 80) + 'px'
      card.querySelector('.ba-tour-next').onclick = () => { i += 1; if (i >= TOUR.length) finish(); else render() }
      card.querySelector('.ba-tour-skip').onclick = finish
    }
    render()
  }

  document.addEventListener('ba:records-changed', refresh)
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
