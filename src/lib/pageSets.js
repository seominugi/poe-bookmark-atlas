// src/lib/pageSets.js
// 거래소 화면에 얹는 '조건 묶음' 칩 줄 — 능력치 필터 그룹 **바깥, 바로 위**.
//
// 왜 그룹 안이 아니라 밖인가 (2026-08-13 제보로 옮김):
//   처음엔 .filter-group-body 맨 앞(= 첫 능력치 필터 위)에 넣었다. 그러면 "능력치 필터" 제목
//   바로 밑에 들어가서 **그 그룹에 속한 필터처럼 보인다**. 조건 묶음은 능력치 필터의 일부가
//   아니라 그 위에 얹는 별개 도구이므로, 그룹의 형제로 앞에 둔다.
//
// 왜 패널 말고 여기에도 두나:
//   같은 칩이 패널에도 있다. 그런데 조건을 만지는 동안 시선은 거래소 필터에 머무르고 패널은
//   화면 가장자리라, "눈에 띄지 않아 사용성이 아쉽다"는 제보가 왔다. 조건을 실제로 넣는 자리
//   바로 위에 같은 줄을 하나 더 둔다. 패널 쪽은 그대로 남긴다(패널만 열어 쓰는 흐름도 있다).
//
// 이 파일만 거래소 마크업(.filter-group / .filter-group-body)에 기댄다:
//   거래소가 마크업을 바꾸면 앵커를 못 찾는다. 그때는 던지지도, 아무 데나 붙이지도 않고
//   **조용히 아무것도 하지 않는다**. 패널 칩이 그대로라 기능은 사라지지 않고 화면만 예전으로
//   돌아간다 — 사용자가 받아들인 유지보수 계약이 이것이다. 앵커가 깨지면 이 파일만 고친다.

import { conditionSetTip } from './conditionSet.js'

export const SETS_BAR_ID = 'ba-page-sets'

// '능력치 필터' 그룹 식별 — 카카오(한국어)와 pathofexile(영어) 양쪽.
const STAT_RE = /능력치\s*필터|stat\s*filters?/i

/** 능력치 필터 그룹(.filter-group) 자체. 우리 줄은 이것의 **앞 형제**로 들어간다. 못 찾으면 null. */
export function findStatFilterGroup(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return null
  // ① '+ 능력치 필터 추가' 입력칸에서 거슬러 올라간다 — 이 placeholder 는 능력치 그룹에만 있다.
  for (const inp of root.querySelectorAll('.filter-group input[placeholder]')) {
    if (STAT_RE.test(inp.placeholder || '')) return inp.closest('.filter-group')
  }
  // ② 폴백 — 그룹 제목으로 찾는다(placeholder 문구만 바뀐 경우에도 살아남게).
  for (const g of root.querySelectorAll('.filter-group')) {
    const t = g.querySelector('.filter-title')
    if (t && STAT_RE.test(t.textContent || '')) return g
  }
  return null
}

// 그룹 안 요소는 그룹 좌측에서 들여쓰여 있다 — 제목 "능력치 필터"도, 각 필터 행의 내용도 42px
// (실측 2026-08-13: 그룹 961 / 제목 1003). 칩 줄을 그룹 왼쪽 끝에 붙이면 그 리듬에서 혼자 튀어나온다.
// 그룹 제목과 같은 선에 맞춘다 — 우리 줄이 그룹 **위**로 올라간 뒤로는 제목이 기준선이다.
// 값은 **재서** 쓴다. 거래소가 여백을 바꿔도 따라가고, 못 재면(레이아웃 전·이상값) 실측 기본값.
const TITLE_INSET = 42
function titleIndent(group) {
  const title = group.querySelector('.filter-title')
  if (!title) return TITLE_INSET
  const d = Math.round(title.getBoundingClientRect().left - group.getBoundingClientRect().left)
  return d > 0 && d < 200 ? d : TITLE_INSET
}
function applyIndent(group, bar) {
  const indent = titleIndent(group)
  bar.style.marginLeft = indent + 'px'
  bar.style.maxWidth = `calc(100% - ${indent * 2}px)`
}

/** 지금 그려진 내용과 같은지 비교하는 지문. 이름에 무슨 문자가 들어가도 안 섞이게 JSON 으로 만든다. */
export const setsSignature = (sets) => JSON.stringify(sets.map((s) => [s.id, s.name]))

/**
 * 칩 줄을 능력치 필터 그룹 바로 위(그룹의 앞 형제)에 그린다.
 *
 * 같은 내용이면 다시 그리지 않는다 — 주입 감시가 body 전역 MutationObserver 라서,
 * 매번 새로 그리면 우리 삽입이 다시 감시를 깨우는 무한 루프가 된다.
 *
 * @param {Document} doc
 * @param {Array} sets 그릴 묶음(빈 배열이면 줄을 지운다)
 * @param {(set:object, bar:Element)=>void} onPick 칩 클릭
 * @param {(el:Element)=>void} [bindTip] data-tip 을 커스텀 툴팁에 물리는 함수(content-main 의 bindPageTip)
 * @returns {Element|null} 그려진 줄. 앵커가 없거나 묶음이 없으면 null.
 */
export function renderSetsBar(doc, sets, onPick, bindTip) {
  const old = doc.getElementById(SETS_BAR_ID)
  const group = findStatFilterGroup(doc)
  if (!group || !group.parentElement || !sets.length) { if (old) old.remove(); return null }

  const sig = setsSignature(sets)
  if (old && old.dataset.sig === sig) {
    // 내용이 같아도 **자리**는 다시 확인한다. 거래소는 필터를 Vue 로 다시 그리므로 우리 줄과 그룹
    // 사이에 무언가 끼어들거나 그룹이 통째로 교체될 수 있는데, 그때 그냥 반환하면 밀린 자리에
    // 영영 남는다("능력치 필터 바로 위" 요구 위반).
    if (old.nextElementSibling !== group) group.parentElement.insertBefore(old, group)
    applyIndent(group, old)
    return old
  }
  if (old) old.remove()

  const bar = doc.createElement('div')
  bar.id = SETS_BAR_ID
  bar.className = 'ba-page-sets'
  bar.dataset.sig = sig

  const lbl = doc.createElement('span')
  lbl.className = 'ba-page-sets-lbl'
  lbl.textContent = '조건 묶음'
  bar.appendChild(lbl)

  for (const s of sets) {
    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'ba-page-set'
    btn.dataset.id = s.id
    // textContent — 묶음 이름은 사용자가 입력한 값이라 innerHTML 로 넣지 않는다.
    btn.textContent = `+ ${s.name}`
    // 이름만으로는 무슨 조건이 담겼는지 알 수 없다(제보). 호버 시 조건 목록을 그대로 보여준다.
    // 네이티브 title 대신 커스텀 툴팁(#ba-page-tip) — PoB 버튼·환산 칩과 같은 관례.
    btn.setAttribute('data-tip', `${conditionSetTip(s)}\n────────\n《클릭 → 지금 검색에 이 조건 더하기》`)
    if (bindTip) bindTip(btn)
    btn.addEventListener('click', () => onPick(s, bar))
    bar.appendChild(btn)
  }

  group.parentElement.insertBefore(bar, group)
  applyIndent(group, bar)
  return bar
}
