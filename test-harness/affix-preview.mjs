// 속성 목록(affix-picker) 미리보기 — 실제 statAffixes/statTiers 와 거래소 능력치 목록으로 시트를 그린다.
// 라이브(거래소 로그인 세션)에 못 붙을 때 타락·스킬 부여 띠 같은 화면 짜임을 눈으로 확인하는 자리다.
//
// 열기: npx vite --config vite.harness.config.js → http://localhost:5199/affix.html?class=Amulet
//   거래소 능력치 목록은 vite 프록시(/trade2-api → poe.kakaogames.com/api)로 받는다.
import contentMainSource from '../src/content/content-main.js?raw'
import { affixListFor } from '../src/lib/affixList.js'
import { buildStatMap } from '../src/lib/statMap.js'
import { openAffixPopover } from '../src/content/affix-picker.js'
import affixes from '../src/lib/statAffixes.poe2.json'
import table from '../src/lib/statTiers.poe2.json'
import uniques from '../src/lib/uniqueMods.poe2.json'

// 시트의 CSS 는 content-main.js 의 pobEnsureStyle 안에 있다 — 그 문자열을 그대로 꺼내 쓴다(복제하면 어긋난다).
const css = contentMainSource.split('st.textContent = `')[1]?.split('\n  `')[0]
const style = document.createElement('style')
style.textContent = css ?? ''
document.head.appendChild(style)

const params = new URLSearchParams(location.search)
const cls = params.get('class') || 'Amulet'
// ?mode=unique 로 고유 모드로 연다
const startMode = params.get('mode') === 'unique' ? 'unique' : 'normal'
const log = document.getElementById('log')
const stats = await fetch('/trade2-api/trade2/data/stats').then((r) => r.json())
const statMap = buildStatMap(stats)
const list = affixListFor({ table, affixes, itemClass: cls, statMap })
log.textContent = `${cls}: 접두 ${list.prefix.length} · 접미 ${list.suffix.length} · 타락 ${list.corrupted.length} · 메커니즘 ${list.mechanics.map((m) => `${m.label}(${(m.items ?? []).length + m.prefix.length + m.suffix.length})`).join(', ')}`
const btn = document.getElementById('open')
const open = () => openAffixPopover({
  anchor: btn, title: '그룹 1 · 능력치 필터', subtitle: '아이템 레벨 상한 없음', list, currentClass: cls,
  onAdd: (picks, meta) => { log.textContent += '\n넣기: ' + JSON.stringify({ picks, meta }) },
  uniques, startMode,
  onAddUnique: ({ unique, items }) => { log.textContent += '\n넣기(고유): ' + JSON.stringify({ unique: unique.n, items }) },
})
btn.addEventListener('click', open)
open()
window.__ready = true
