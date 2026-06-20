import css from './panel.css?inline'
import { renderList } from './renderList.js'

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
    <div class="ba-root collapsed" id="ba-root">
      <div class="ba-handle" id="ba-handle">🔖 북마크</div>
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
  tabs.forEach((t) => {
    t.onclick = () => {
      tabs.forEach((x) => x.classList.toggle('active', x === t))
      tab = t.dataset.tab
      refresh()
    }
  })
  document.addEventListener('ba:records-changed', refresh)
  refresh()
}
