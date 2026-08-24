// 영문 PoB(Path of Building) import 텍스트 조립.
//
// 입력 경로가 둘이고, 둘 다 **번역하지 않는다**.
//   ① 영문 원본 (기본) — 같은 매물 id 를 pathofexile.com API 에서 받아 그대로 조립한다.
//      호출부가 `{ en: true }` 로 부른다. 설명이 이미 영문이라 손댈 게 없다.
//   ② 최소 폴백 — ①이 실패했을 때(권한 없음·네트워크·레이트) 기본값으로 부른다.
//      KR 설명을 그대로 내고, 베이스 이름과 Item Class 만 baseMap 으로 영문화한다.
//      그것만 있으면 PoB 가 아이템 종류는 알아본다.
//
// 번역 계층은 2026-08-23 에 걷어냈다. 제보 아이템(희망의 실타래) 실물로 두 경로를 나란히
// 돌려 보니 번역은 품질이 낮은 게 아니라 **틀렸다** — `Radius: 변수`, 3줄 mod 첫 줄 유실,
// `+-16%` 부호 겹침. PoB 가 읽을 수 없는 텍스트를 만들어내느니 한글이 낫다.
// 사용자가 "PoB 가 이상하다"가 아니라 "영문 조회가 안 됐구나"로 읽기 때문이다.
// 함께 지운 것: pobStatMap·pobUniqueMap·pobUniqueModMap(2.2MB)과 그 조회·값치환 로직.

// [Key|표시텍스트] / [텍스트] 게임 마크업 제거 → 표시 텍스트만
export function stripTags(s) {
  return String(s).replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1')
}

// 주얼 반경 — PoB가 '반경 내' 효과 계산에 실제로 쓴다. 거래소는 properties에 담아 보낸다.
// ⚠ KR 값은 **실측한 것만** 넣는다.
// 처음엔 대형/중형/소형으로 추측해 넣었는데 실제 값이 '작게'라서 번역이 안 됐다(사용자 제보 2026-08-06).
// 거래소 국지화는 어형이 일관되지 않다 — 같은 '적용 반경' 속성에 '작게'(부사형)와 '대형'(명사형)이 섞여 쓰인다.
// 거래소 `data/filters`·`data/stats` 어디에도 이 값의 열거가 없어(2026-08-06 확인) **실아이템 표본이 유일한 출처**다.
// 그래서 모르는 값은 **추측해 채우지 않는다** — 원문 그대로 내보낸다.
// 실측 출처: 작게 = '불가능한 탈출'(진청록색 주얼) / 대형 = '완력 해결' 등(코발트색 주얼)
// 변수 = '희망의 실타래'(진홍색 주얼) — 같은 매물 id 를 두 호스트에서 받아 KR '변수' ↔ EN 'Variable' 로 대조했다(2026-08-23).
const RADIUS_EN = { 작게: 'Small', 대형: 'Large', 변수: 'Variable' }
const propValue = (item, re) => {
  const p = ((item && item.properties) || []).find((x) => re.test(String((x && x.name) || '')))
  const raw = p && p.values && p.values[0] && p.values[0][0]
  return raw ? stripTags(String(raw)).trim() : null
}
export function radiusLine(item) {
  const key = propValue(item, /반경|Radius/)
  if (!key) return null
  // 영문 경로에서는 이미 'Variable' 같은 영문이라 표에 없는 게 정상 — 그대로 통과시킨다.
  return 'Radius: ' + (RADIUS_EN[key] || key)
}

// 품질 — PoB가 로컬 mod 계산에 실제로 쓴다(20% 품질 무기와 0%는 DPS가 크게 다르다).
export function qualityLine(item) {
  const raw = propValue(item, /품질|Quality/)
  const m = raw && raw.match(/-?\d+/)
  return m ? 'Quality: +' + m[0] + '%' : null
}

// 소켓·링크 — 같은 group끼리 '-'로 잇고 그룹 사이는 공백(인게임 Ctrl+C 포맷).
export function socketsLine(item) {
  const list = (item && item.sockets) || []
  if (!list.length) return null
  const groups = []
  for (const s of list) {
    const g = Number(s && s.group) || 0
    if (!groups[g]) groups[g] = []
    groups[g].push((s && s.sColour) || 'W') // 색 미상은 화이트로 — 링크 구조가 더 중요하다
  }
  return 'Sockets: ' + groups.filter(Boolean).map((g) => g.join('-')).join(' ')
}

// 영향력(Shaper/Elder/…) — PoB가 "Shaper Item" 같은 줄로 인식한다.
const INFLUENCE_EN = { shaper: 'Shaper', elder: 'Elder', crusader: 'Crusader', redeemer: 'Redeemer', hunter: 'Hunter', warlord: 'Warlord' }
export function influenceLines(item) {
  const inf = (item && item.influences) || {}
  return Object.keys(INFLUENCE_EN).filter((k) => inf[k]).map((k) => INFLUENCE_EN[k] + ' Item')
}

/**
 * 아이템 전체 → PoB import 텍스트(인게임 Ctrl+C 포맷).
 * 섹션: [Item Class/Rarity/이름/base] / 속성(품질·반경) / 소켓 / Item Level / mod / 영향력 / Corrupted
 *       — '--------' 로 구분.
 *
 * 이름 규칙:
 *   유니크는 **그대로 둔다**. 영문 경로에서는 이미 영문이고(실측: '종말의 발' → 'Apocalypse Span'),
 *   폴백에서는 한글로 남는다 — 번역 사전을 지웠기 때문이다. PoB 가 유니크를 못 알아보는 대신
 *   베이스 이름으로는 알아본다.
 *   희귀는 절차 생성 이름(Words 조합)이라 KR↔EN 공개 데이터가 없고 PoB 폰트에 한글도 없다(□) →
 *   ASCII 플레이스홀더 `seominugi-bookmark-item-<classId 슬러그>`로 치환(PoB는 이름을 파싱 안 함 — 표시용).
 *
 * @param {object} item 거래소 아이템 JSON
 * @param {Record<string, [string, string]>} [baseMap] KR 베이스명 → [EN 베이스명, classId]. 영문 경로에선 안 쓴다.
 * @param {object} [opts]
 * @param {boolean} [opts.en] item 이 **이미 영문**이다(영문 거래소에서 같은 매물 id 로 받아온 것).
 * @param {string|null} [opts.itemClass] 영문 경로에서 넘겨받는 Item Class.
 *   영문 아이템 JSON 에는 이 필드가 없어서(2026-08-17 실측) KR 아이템의 baseMap 으로 구한다.
 * @returns {{ text: string, missing: string[] }} missing 은 baseMap 에 없는 베이스만 담는다
 *   (`base:<KR 베이스명>`). 그 경우 PoB 가 아이템을 식별하지 못하므로 제보 텍스트에 남을 값이다.
 */
export function buildPobText(item, baseMap = {}, opts = {}) {
  const en = !!opts.en
  const missing = []
  const base = en ? null : baseMap[item.baseType]
  if (!en && !base) missing.push('base:' + item.baseType)

  const itemClass = en ? (opts.itemClass || null) : (base && base[1])
  let name = item.name
  if (name && item.rarity !== 'Unique') {
    const slug = (itemClass || 'item').toLowerCase().replace(/\s+/g, '-')
    name = 'seominugi-bookmark-item-' + slug
  }

  const head = []
  if (itemClass) head.push('Item Class: ' + itemClass)
  head.push('Rarity: ' + (item.rarity || 'Rare'))
  if (name) head.push(name)
  head.push(en ? (item.baseType || '') : (base ? base[0] : (item.baseType || '')))

  // 한 mod가 여러 줄(\n)일 수 있음(예: 서판 implicit, 군단 주얼) → 줄 단위로 펼치고 접미 부착.
  // 게임 마크업([Block|막기])만 벗기고 내용은 손대지 않는다.
  const modLines = (list, suffix) => {
    const out = []
    ;(list || []).forEach((m) => {
      const raw = typeof m === 'string' ? m : m.description
      stripTags(raw).split('\n').forEach((l) => { const s = l.trim(); if (s) out.push(s + suffix) })
    })
    return out
  }
  const ench = modLines(item.enchantMods, ' (enchant)')
  const impl = modLines(item.implicitMods, ' (implicit)')
  // 인게임 표기 순서: fractured → explicit → crafted (한 섹션). PoB는 접미로 구분
  const expl = [
    ...modLines(item.fracturedMods, ' (fractured)'),
    ...modLines(item.explicitMods, ''),
    ...modLines(item.craftedMods, ' (crafted)'),
  ]

  const sections = [head]
  // 인게임 Ctrl+C 순서: 헤더 → 속성(품질·반경) → 소켓 → Item Level → mod → 영향력 → Corrupted
  const props = []
  const qual = qualityLine(item)
  if (qual) props.push(qual)
  const rad = radiusLine(item)
  if (rad) props.push(rad)
  if (props.length) sections.push(props)
  const sock = socketsLine(item)
  if (sock) sections.push([sock])
  if (item.ilvl != null) sections.push(['Item Level: ' + item.ilvl])
  if (ench.length) sections.push(ench)
  if (impl.length) sections.push(impl)
  if (expl.length) sections.push(expl)
  const infl = influenceLines(item)
  if (infl.length) sections.push(infl)
  if (item.corrupted) sections.push(['Corrupted'])
  return { text: sections.map((s) => s.join('\n')).join('\n--------\n'), missing }
}
