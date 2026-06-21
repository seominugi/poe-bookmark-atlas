import css from './panel.css?inline'
import { renderList } from './renderList.js'
import { listByKind, addBookmark } from '../../store/store.js'

const ECON = {
  poe1: 'https://seominugi.com/poe1/economy/items',
  poe2: 'https://seominugi.com/poe2/economy/items',
}

export function mountPanel({ game }) {
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
      <div class="ba-handle" id="ba-handle">🔖 북마크</div>
      <div class="ba-head">
        <span class="ba-title">🔖 북마크 아틀라스 · ${game === 'poe2' ? 'POE2' : 'POE1'}</span>
        <button class="ba-save" id="ba-save" title="최근 검색을 북마크로 저장">★ 현재 검색 저장</button>
      </div>
      <div class="ba-namebar" id="ba-namebar" hidden>
        <input class="ba-name-input" id="ba-name-input" placeholder="북마크 이름" maxlength="60" />
        <button class="ba-name-ok" id="ba-name-ok">저장</button>
        <button class="ba-name-cancel" id="ba-name-cancel">취소</button>
      </div>
      <div class="ba-tabs">
        <div class="ba-tab active" data-tab="bookmark">🔖 북마크</div>
        <div class="ba-tab" data-tab="history">🕘 히스토리</div>
      </div>
      <div class="ba-list" id="ba-list"></div>
      <div class="ba-toast" id="ba-toast" hidden></div>
      <div class="ba-foot"><a href="${ECON[game] || ECON.poe2}" target="_blank" rel="noopener">📊 아이템 시세 자세히 → seominugi.com ↗</a></div>
    </div>`
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

  const ui = { showNameInput, toast, game }
  let tab = 'bookmark'
  const tabs = root.querySelectorAll('.ba-tab')
  const refresh = () => renderList($('ba-list'), tab, root, ui)
  const selectTab = (name) => {
    tab = name
    tabs.forEach((x) => x.classList.toggle('active', x.dataset.tab === name))
    refresh()
  }
  tabs.forEach((t) => { t.onclick = () => selectTab(t.dataset.tab) })

  // 최근(현재) 검색을 북마크로 저장
  $('ba-save').onclick = async () => {
    const latest = (await listByKind('history', game))[0]
    if (!latest) { toast('먼저 거래소에서 검색을 실행하세요.'); return }
    const name = await showNameInput(latest.name || latest.title)
    if (name === null) return
    await addBookmark(
      {
        game: latest.game, league: latest.league, url: latest.url,
        title: latest.title, itemType: latest.itemType, name: latest.name,
        stats: latest.stats, priceFilter: latest.priceFilter, snapshot: latest.snapshot,
        dedupeKey: latest.dedupeKey,
      },
      name || latest.title,
    )
    selectTab('bookmark')
    toast('북마크에 저장했습니다.')
  }

  document.addEventListener('ba:records-changed', refresh)
  refresh()

  return {
    toggle: () => setCollapsed(!isCollapsed()),
    show: () => setCollapsed(false),
    hide: () => setCollapsed(true),
  }
}
