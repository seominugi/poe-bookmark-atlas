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

// mod(stat id + KR 설명) → { en, ko }. en=null이면 미매핑 또는 미완성 변환(조립기가 폴백·집계).
export function translateMod(id, koDesc, map) {
  const tpl = pickTemplate(id, koDesc, map)?.replace(TRADE_ONLY_SUFFIX, '')
  if (tpl == null) return { en: null, ko: koDesc }
  const en = fillValues(tpl, extractValues(stripTags(koDesc)))
  // 클러스터 주얼류 "Allocates #" 같은 텍스트형(특성 이름) 옵션은 #가 숫자가 아니라 extractValues가 못 채운다.
  // 미치환 "#"가 그대로 남으면 PoB가 그 줄을 통째로 못 읽으므로 실패로 취급(en=null → 조립기가 KR로 폴백·집계).
  return { en: en.includes('#') ? null : en, ko: koDesc }
}

/**
 * 아이템 전체 → PoB import 텍스트(인게임 Ctrl+C 포맷).
 * 섹션: [Item Class/Rarity/이름/base EN] / Item Level / implicit (implicit) / explicit / Corrupted — '--------' 구분.
 * 미매핑 base·mod는 KR 그대로 두고 missing[]에 기록(UI가 부분 변환 경고용).
 * 이름: 유니크는 uniqueMap으로 EN 번역(PoB가 유니크를 EN 이름으로 매칭 — 기능 필수).
 *       희귀는 절차 생성 이름(Words 조합)인데 KR↔EN 공개 데이터가 없고 PoB 폰트에 한글도 없어(□) —
 *       ASCII 플레이스홀더 `seominugi-bookmark-item-<classId 슬러그>`로 치환(PoB는 이름을 파싱 안 함 — 표시용).
 * @returns {{ text: string, missing: string[] }}
 */
export function buildPobText(item, statMap, baseMap, uniqueMap = {}) {
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
      const t = id ? translateMod(id, ko, statMap) : { en: null }
      if (t.en == null) missing.push(kind + ':' + (id || '?'))
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
