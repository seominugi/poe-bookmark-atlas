// 작업3 — 영문 PoB(Path of Building) import 텍스트 조립 핵심 로직.
// KR 거래소 아이템의 mod(stat id + KR 설명)를 번들 EN 맵(pobStatMap.json)으로 영문화한다.
//   1) stat id로 EN 템플릿(#-패턴) 조회 — 다중변형(Area/Map 등)은 KR 설명을 숫자 정규화해 택1
//   2) KR 설명에서 실제 값 추출 → 템플릿의 #를 순서대로 치환
// 한계(MVP): 필터 텍스트에 #가 없는 mod(예 "an additional Chest")는 값 손실 — 주로 비-gear(지도/서판)라 PoB 무관.
//   KR/EN 값 순서가 다른 하이브리드 mod는 순서 그대로 치환(대부분 동일). 미매핑 id는 en=null.

// [Key|표시텍스트] / [텍스트] 게임 마크업 제거 → 표시 텍스트만
export function stripTags(s) {
  return String(s).replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1')
}

// 숫자(음수·소수 포함)를 #로 — 다중변형 매칭 시 값 차이를 무시하기 위함
export function digitsToHash(s) {
  return String(s).replace(/-?\d+(?:\.\d+)?/g, '#')
}

// 값 추출(등장 순서 유지)
export function extractValues(s) {
  return String(s).match(/-?\d+(?:\.\d+)?/g) || []
}

// EN 템플릿의 #를 값으로 순서대로 치환(값이 모자라면 #를 남김)
export function fillValues(template, values) {
  let i = 0
  return String(template).replace(/#/g, () => (i < values.length ? values[i++] : '#'))
}

// stat id → EN 템플릿. 다중변형이면 KR 설명(숫자 정규화)으로 ko를 매칭해 택1(불일치 시 첫 변형).
export function pickTemplate(id, koDesc, map) {
  const e = map[id]
  if (e == null) return null
  if (typeof e === 'string') return e
  const key = digitsToHash(stripTags(koDesc)).trim()
  const hit = e.find((v) => v.ko && digitsToHash(v.ko).trim() === key)
  return (hit || e[0]).en
}

// 거래소 필터 목록이 로컬/글로벌 동명 mod를 구분하려고 붙인 표시(EN "(Local)"/KR "(특정)" 등) — 실제
// 인게임 아이템 텍스트엔 없다. PoB는 인게임 텍스트만 인식하므로 남아 있으면 그 mod를 통째로 못 읽는다.
const TRADE_ONLY_SUFFIX = /\s*\((?:Local|Global)\)\s*$/

// 유니크 mod 폴백용 KR 키 정규화 — 태그 제거 → 값(범위 "(80 — 120)" 포함)을 #로 → 공백 제거.
// 굴린 값이 달라도, 사전 쪽 범위 표기·공백 관례가 달라도 같은 mod면 같은 키가 되게 한다.
const KO_VALUE_RANGE = /\(\s*-?\d+(?:\.\d+)?\s*[—–~]\s*-?\d+(?:\.\d+)?\s*\)/g
export function normKo(s) {
  return stripTags(s).replace(KO_VALUE_RANGE, '#').replace(/-?\d+(?:\.\d+)?/g, '#').replace(/\s+/g, '')
}

// mod(stat id + KR 설명) → { en, ko }. en=null이면 미매핑 또는 미완성 변환(조립기가 폴백·집계).
// modMap: KR 원문 기준 유니크 mod 폴백 사전(pobUniqueModMap) — stat id 경로가 실패했을 때만 본다.
const nonEmptyLines = (s) => String(s).split('\n').map((l) => l.trim()).filter(Boolean)

// 거래소 stat 템플릿이 mod의 '검색 가능한 앞부분'만 덮는 경우가 있다 — 군단 주얼이 대표적이다.
// 아이템 mod는 두 줄인데(주화 수 + 정복자) 검색 stat(pseudo_timeless_jewel_*)은 첫 줄뿐이라,
// 채울 #가 없다는 이유로 그대로 성공 처리하면 둘째 줄이 출력에서 **조용히 사라진다**
// (missing[]에도 안 남아 Shift+클릭 제보로도 영영 안 드러난다 — 사용자 제보로 발견).
// 남은 KR 줄을 각각 폴백 사전으로 한 번 더 번역하고, 그래도 안 되면 KR을 남기고 missingLines로 보고한다.
// 템플릿이 '앞줄부터' 덮는다고 가정한다 — 검색 stat은 mod 선두 문구에서 만들어지기 때문이다.
function withTrailingLines(en, koText, modMap, koDesc) {
  const koLines = nonEmptyLines(koText)
  const enLines = nonEmptyLines(en)
  if (koLines.length <= enLines.length) return { en, ko: koDesc }
  const missingLines = []
  const rest = koLines.slice(enLines.length).map((l) => {
    const alt = modMap[normKo(l)]
    const filled = alt != null ? fillValues(alt, extractValues(l)) : null
    if (filled != null && !filled.includes('#')) return filled
    missingLines.push(l) // 줄을 버리지 않고 KR로 남긴다 — 사라지는 것보다 눈에 띄는 편이 낫다
    return l
  })
  return { en: [...enLines, ...rest].join('\n'), ko: koDesc, missingLines }
}

export function translateMod(id, koDesc, map, modMap = {}) {
  const koText = stripTags(koDesc)
  const values = extractValues(koText)
  const tpl = pickTemplate(id, koDesc, map)?.replace(TRADE_ONLY_SUFFIX, '')
  // 클러스터 주얼류 "Allocates #" 같은 텍스트형(특성 이름) 옵션은 #가 숫자가 아니라 extractValues가 못 채운다.
  // 미치환 "#"가 그대로 남으면 PoB가 그 줄을 통째로 못 읽으므로 실패로 취급한다.
  const en = tpl == null ? null : fillValues(tpl, values)
  if (en != null && !en.includes('#')) return withTrailingLines(en, koText, modMap, koDesc)
  // stat id 경로 실패 — 거래소가 유니크 전용 문구에 별도 stat을 안 주고 다른 stat에 얹어두는 경우가 있다
  // (예: "물리 피해 없음"의 id가 "물리 피해 #% 증가"라 채울 값이 없어 #가 남는다). KR 원문으로 한 번 더 찾는다.
  const alt = modMap[normKo(koDesc)]
  if (alt != null) {
    const filled = fillValues(alt, values)
    if (!filled.includes('#')) return { en: filled, ko: koDesc }
  }
  return { en: null, ko: koDesc }
}

// 주얼 반경 — PoB가 '반경 내' 효과 계산에 실제로 쓴다. 거래소는 properties에 담아 보내는데
// buildPobText가 properties를 통째로 안 읽고 있었다(사용자 제보 — 군단 주얼에 Radius가 빠짐).
const RADIUS_EN = { 대형: 'Large', 중형: 'Medium', 소형: 'Small' }
export function radiusLine(item) {
  const p = ((item && item.properties) || []).find((x) => /반경|Radius/.test(String((x && x.name) || '')))
  const raw = p && p.values && p.values[0] && p.values[0][0]
  if (!raw) return null
  const key = stripTags(String(raw)).trim()
  const en = RADIUS_EN[key]
  return { line: 'Radius: ' + (en || key), known: en != null, raw: key }
}

/**
 * 아이템 전체 → PoB import 텍스트(인게임 Ctrl+C 포맷).
 * 섹션: [Item Class/Rarity/이름/base EN] / Item Level / implicit (implicit) / explicit / Corrupted — '--------' 구분.
 * 미매핑 base·mod는 KR 그대로 두고 missing[]에 기록(UI가 부분 변환 경고용).
 * 이름: 유니크는 uniqueMap으로 EN 번역(PoB가 유니크를 EN 이름으로 매칭 — 기능 필수).
 *       희귀는 절차 생성 이름(Words 조합)인데 KR↔EN 공개 데이터가 없고 PoB 폰트에 한글도 없어(□) —
 *       ASCII 플레이스홀더 `seominugi-bookmark-item-<classId 슬러그>`로 치환(PoB는 이름을 파싱 안 함 — 표시용).
 * modMap: 유니크 mod 폴백 사전(KR 원문 → EN 템플릿) — stat id 경로가 실패한 줄에만 쓰인다.
 * @returns {{ text: string, missing: string[] }}
 */
export function buildPobText(item, statMap, baseMap, uniqueMap = {}, modMap = {}) {
  const missing = []
  const base = baseMap[item.baseType]
  if (!base) missing.push('base:' + item.baseType)

  let name = item.name
  if (name && item.rarity === 'Unique') {
    if (uniqueMap[name]) name = uniqueMap[name]
    else missing.push('unique:' + name)
  } else if (name) {
    const slug = ((base && base[1]) || 'item').toLowerCase().replace(/\s+/g, '-')
    name = 'seominugi-bookmark-item-' + slug
  }

  const head = []
  if (base && base[1]) head.push('Item Class: ' + base[1])
  head.push('Rarity: ' + (item.rarity || 'Rare'))
  if (name) head.push(name)
  head.push(base ? base[0] : (item.baseType || ''))

  // 한 mod가 여러 줄(\n)일 수 있음(예: 서판 implicit) → 줄 단위로 펼치고 implicit 접미 부착
  const modLines = (list, hashAt, kind, suffix) => {
    const outLines = []
    ;(list || []).forEach((m, i) => {
      const ko = typeof m === 'string' ? m : m.description
      const id = typeof m === 'object' && m.hash ? m.hash.replace(/^stat\./, '') : hashAt(i) // explicitMods[].hash는 "stat." 접두
      const t = translateMod(id, ko, statMap, modMap) // id가 없어도 KR 원문 폴백은 시도한다
      // KR 원문까지 남긴다 — stat id가 실제 문구와 어긋나는 부류(유니크 전용 mod)에선 id만으론
      // 무엇을 고쳐야 할지 알 수 없고, 폴백 사전(pobUniqueModMap)의 키가 KR 원문 기준이라 그렇다.
      if (t.en == null) missing.push(`${kind}:${id || '?'} — ${stripTags(ko).replace(/\s*\n\s*/g, ' / ')}`)
      // 템플릿이 덮지 못한 뒷줄 — 줄 단위로 보고한다(mod 전체가 아니라 그 줄만 사전에 넣으면 되므로)
      else if (t.missingLines) t.missingLines.forEach((l) => missing.push(`${kind}:${id || '?'} — ${l}`))
      const txt = t.en != null ? t.en : stripTags(ko)
      txt.split('\n').forEach((l) => { const s = l.trim(); if (s) outLines.push(s + suffix) })
    })
    return outLines
  }
  const hashes = item.extended?.hashes || {}
  const hashAt = (kind) => (i) => hashes[kind]?.[i]?.[0] ?? null
  const ench = modLines(item.enchantMods, hashAt('enchant'), 'enchant', ' (enchant)')
  const impl = modLines(item.implicitMods, hashAt('implicit'), 'implicit', ' (implicit)')
  // 인게임 표기 순서: fractured → explicit → crafted (한 섹션). PoB는 접미로 구분
  const expl = [
    ...modLines(item.fracturedMods, hashAt('fractured'), 'fractured', ' (fractured)'),
    ...modLines(item.explicitMods, () => null, 'explicit', ''),
    ...modLines(item.craftedMods, hashAt('crafted'), 'crafted', ' (crafted)'),
  ]

  const sections = [head]
  // 인게임 Ctrl+C 순서: 헤더 → 속성(반경 등) → Item Level → mod
  const rad = radiusLine(item)
  if (rad) {
    if (!rad.known) missing.push('radius:' + rad.raw) // 모르는 표기는 그대로 내보내되 제보에 남긴다
    sections.push([rad.line])
  }
  if (item.ilvl != null) sections.push(['Item Level: ' + item.ilvl])
  if (ench.length) sections.push(ench)
  if (impl.length) sections.push(impl)
  if (expl.length) sections.push(expl)
  if (item.corrupted) sections.push(['Corrupted'])
  return { text: sections.map((s) => s.join('\n')).join('\n--------\n'), missing }
}

// 미변환 mod 수동 제보용 텍스트 — 웹훅 없이 사용자가 직접 Discord에 붙여넣는 방식(클라이언트에 웹훅 시크릿을 두지 않기 위함).
// missing 없으면 null(제보할 게 없음 — 조립기가 버튼 동작 결정).
export function buildReportText(item, missing, game) {
  if (!missing || !missing.length) return null
  return [
    '[POE 북마크 아틀라스] PoB 번역 미변환 제보',
    `아이템: ${item.name || '(이름 없음)'} / 베이스: ${item.baseType || '(알 수 없음)'}`,
    `게임: ${game}`,
    '미변환 항목:',
    ...missing.map((m) => '- ' + m),
  ].join('\n')
}
