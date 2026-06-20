import css from './panel.css?inline'
import { renderList } from './renderList.js'
import { listByKind, addBookmark } from '../../store/store.js'

const ECON = {
  poe1: 'https://seominugi.com/poe1/economy/items',
  poe2: 'https://seominugi.com/poe2/economy/items',
}

export function mountPanel({ game }) {
  if (document.getElementById('ba-panel-host')) return
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
        <span class="ba-title">🔖 북마크 아틀라스</span>
        <button class="ba-save" id="ba-save" title="최근 검색을 북마크로 저장">★ 현재 검색 저장</button>
      </div>
      <div class="ba-tabs">
        <div class="ba-tab active" data-tab="bookmark">🔖 북마크</div>
        <div class="ba-tab" data-tab="history">🕘 히스토리</div>
      </div>
      <div class="ba-list" id="ba-list"></div>
      <div class="ba-foot"><a href="${ECON[game] || ECON.poe2}" target="_blank" rel="noopener">📊 아이템 시세 자세히 → seominugi.com ↗</a></div>
    </div>`
  root.appendChild(wrap)

  const elRoot = root.getElementById('ba-root')
  root.getElementById('ba-handle').onclick = () => elRoot.classList.toggle('collapsed')

  let tab = 'bookmark'
  const tabs = root.querySelectorAll('.ba-tab')
  const refresh = () => renderList(root.getElementById('ba-list'), tab, root)
  const selectTab = (name) => {
    tab = name
    tabs.forEach((x) => x.classList.toggle('active', x.dataset.tab === name))
    refresh()
  }
  tabs.forEach((t) => { t.onclick = () => selectTab(t.dataset.tab) })

  // 최근(현재) 검색을 북마크로 저장
  root.getElementById('ba-save').onclick = async () => {
    const latest = (await listByKind('history'))[0]
    if (!latest) { alert('먼저 거래소에서 검색을 실행하세요.'); return }
    const name = prompt('북마크 이름', latest.name || latest.title)
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
  }

  document.addEventListener('ba:records-changed', refresh)
  refresh()
}
