// 작업3 — 영문 PoB(Path of Building) import 텍스트 조립 핵심 로직.
//
// 입력 경로는 둘인데, 실제로 쓰는 건 사실상 하나다.
//   ① 영문 원본 (기본) — 같은 매물 id 를 pathofexile.com API 에서 받아 그대로 조립한다.
//      호출부가 `{ en: true }` 로 부른다. 번역이 개입하지 않으니 값이 틀릴 수가 없다.
//   ② 최소 폴백 — ①이 실패했을 때(권한 없음·네트워크·레이트) `{ verbatim: true }` 로 부른다.
//      KR 설명을 **번역하지 않고 그대로** 낸다. 베이스 이름(pobBaseMap)만 영문이라 PoB 가
//      아이템 종류는 알아본다. 한글이라 사용자가 "영문 복사가 됐다"고 오해하지 않는다.
//
// 아래 번역 계층(translateMod/pickTemplateInfo/valuesByKoTemplate…)은 ②의 옛 구현이다.
// 2026-08-23 실측에서 이 경로가 **쓰이면 틀린다**는 게 확인돼(3줄 mod 첫 줄 유실, `+-16%`
// 부호 겹침, `Radius: 변수`) 호출부에서 뺐다. 맵 3종(2.2MB) 삭제는 별도 작업으로 남아 있다.

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

// 거래소 필터 표시용 접미 — KR "(특정)"·"(전역)"은 인게임 문구에 없어 아이템 설명과 템플릿이 어긋난다.
const KO_TRADE_ONLY_SUFFIX = /\s*\((?:특정|전역)\)\s*$/
const RE_META = /[.*+?^${}()|[\]\\]/g

/**
 * **KR 템플릿의 # 자리에서만** 값을 뽑는다. 없으면 null(호출부가 기존 방식으로 폴백).
 *
 * 왜 필요한가 (제보 2026-08-17 "생명력 재생 등 일부 항목이 잘못 복사됨"):
 *   기존 extractValues 는 설명의 **모든 숫자**를 순서대로 걷는다. 그런데 KR 문구에는 값이 아닌
 *   숫자가 박혀 있는 경우가 많다 — "**1**초마다 생명력 26.8 재생", "**3**초마다 …", "사용 **1**회당 …".
 *   그러면 # 하나짜리 템플릿에 26.8 대신 1 이 들어가 PoB 계산이 통째로 틀어진다.
 *   라이브 KR 템플릿("1초마다 생명력 # 재생")과 대조하면 어느 숫자가 값인지 정확히 안다.
 *   실측(2026-08-17): 템플릿에 숫자가 박힌 KR stat 이 **1,239개** — 드문 예외가 아니다.
 *
 * @param {string} koTemplate 라이브 KR stat 텍스트(# 포함)
 * @param {string} koText 아이템의 실제 KR 설명
 */
export function valuesByKoTemplate(koTemplate, koText) {
  if (!koTemplate || !koText) return null
  const tpl = stripTags(koTemplate).replace(KO_TRADE_ONLY_SUFFIX, '').trim()
  if (!tpl.includes('#')) return null
  const src = stripTags(koText).replace(KO_TRADE_ONLY_SUFFIX, '').trim()
  // 템플릿을 정규식으로: 리터럴은 그대로 두고 # 자리만 숫자 캡처. 공백 차이는 흡수한다.
  const pattern = tpl.split('#').map((p) => p.replace(RE_META, '\\$&').replace(/\s+/g, '\\s*')).join('(-?\\d+(?:\\.\\d+)?)')
  const m = new RegExp('^' + pattern + '$').exec(src)
  return m ? m.slice(1) : null
}

// EN 템플릿의 #를 값으로 순서대로 치환(값이 모자라면 #를 남김)
export function fillValues(template, values) {
  let i = 0
  return String(template).replace(/#/g, () => (i < values.length ? values[i++] : '#'))
}

// stat id → { en, guessed }. 다중변형이면 KR 설명(숫자 정규화)으로 ko를 매칭해 택1.
// **불일치 시 첫 변형을 쓰되 guessed로 표시한다** — 예전엔 조용히 e[0]을 썼다.
// 잘못 고르면 (Local)/글로벌처럼 의미가 다른 영문이 나가 PoB 계산이 통째로 달라지는데
// missing[]에 안 남아 드러나지 않았다(다중변형 poe1 233 / poe2 80건).
function pickTemplateInfo(id, koDesc, map) {
  const e = map[id]
  if (e == null) return null
  if (typeof e === 'string') return { en: e, guessed: false }
  const key = digitsToHash(stripTags(koDesc)).trim()
  const hit = e.find((v) => v.ko && digitsToHash(v.ko).trim() === key)
  return { en: (hit || e[0]).en, guessed: !hit }
}
export function pickTemplate(id, koDesc, map) {
  const info = pickTemplateInfo(id, koDesc, map)
  return info ? info.en : null
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

// 값이 템플릿 #보다 많으면 fillValues가 초과분을 조용히 버린다 → 틀린 수치가 PoB로 갈 수 있다.
// **단, EN이 고정 문구(#=0)인 경우는 유실이 아니다** — 한국어 어법상의 1("추가 1명" → "an additional")이라
// EN 쪽이 온전하다. 번들 데이터 실측: 초과 122건 중 120건이 이 부류였다. 그래서 #가 1개 이상일 때만 본다.
// 실패로 처리하지 않고 경고만 남긴다 — 실측상 진짜 유실은 0건이라, 실패로 만들면 정상 번역이 한글로 떨어진다.
function valueOverflow(tpl, en, koText) {
  const hashes = (String(tpl).match(/#/g) || []).length
  if (!hashes) return null
  const covered = nonEmptyLines(koText).slice(0, nonEmptyLines(en).length).join('\n')
  const n = extractValues(covered).length
  return n > hashes ? { hashes, values: n } : null
}

export function translateMod(id, koDesc, map, modMap = {}, koMap = {}) {
  const koText = stripTags(koDesc)
  // KR 템플릿이 있으면 그 # 자리에서만 값을 뽑는다 — 문구에 박힌 숫자("1초마다")를 값으로 오인하지 않게.
  // 템플릿이 없거나(신규 stat) 문구가 어긋나면 예전처럼 모든 숫자를 순서대로 쓴다.
  const values = valuesByKoTemplate(koMap && koMap[id], koDesc) || extractValues(koText)
  const info = pickTemplateInfo(id, koDesc, map)
  const tpl = info ? info.en.replace(TRADE_ONLY_SUFFIX, '') : null
  // 클러스터 주얼류 "Allocates #" 같은 텍스트형(특성 이름) 옵션은 #가 숫자가 아니라 extractValues가 못 채운다.
  // 미치환 "#"가 그대로 남으면 PoB가 그 줄을 통째로 못 읽으므로 실패로 취급한다.
  const en = tpl == null ? null : fillValues(tpl, values)
  if (en != null && !en.includes('#')) {
    const r = withTrailingLines(en, koText, modMap, koDesc)
    const warn = []
    if (info.guessed) warn.push('변형 추정(KR 문구가 어느 변형과도 일치하지 않음)')
    const ov = valueOverflow(tpl, en, koText)
    if (ov) warn.push(`값 초과(EN #${ov.hashes}개 < KR 값 ${ov.values}개 — 초과분 유실)`)
    return warn.length ? { ...r, warnings: warn } : r
  }
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
// ⚠ KR 값은 **실측한 것만** 넣는다.
// 처음엔 대형/중형/소형으로 추측해 넣었는데 실제 값이 '작게'라서 번역이 안 됐다(사용자 제보 2026-08-06).
// 거래소 국지화는 어형이 일관되지 않다 — 같은 '적용 반경' 속성에 '작게'(부사형)와 '대형'(명사형)이 섞여 쓰인다.
// 거래소 `data/filters`·`data/stats` 어디에도 이 값의 열거가 없어(2026-08-06 확인) **실아이템 표본이 유일한 출처**다.
// 그래서 모르는 값은 **추측해 채우지 않는다** — 원문 그대로 내보내고 missing 에 `radius:<원문>` 으로 남긴다.
// 제보가 오면 그 값을 여기 추가하면 된다.
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
  const en = RADIUS_EN[key]
  return { line: 'Radius: ' + (en || key), known: en != null, raw: key }
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
 * 섹션: [Item Class/Rarity/이름/base EN] / Item Level / implicit (implicit) / explicit / Corrupted — '--------' 구분.
 * 미매핑 base·mod는 KR 그대로 두고 missing[]에 기록(UI가 부분 변환 경고용).
 * 이름: 유니크는 uniqueMap으로 EN 번역(PoB가 유니크를 EN 이름으로 매칭 — 기능 필수).
 *       희귀는 절차 생성 이름(Words 조합)인데 KR↔EN 공개 데이터가 없고 PoB 폰트에 한글도 없어(□) —
 *       ASCII 플레이스홀더 `seominugi-bookmark-item-<classId 슬러그>`로 치환(PoB는 이름을 파싱 안 함 — 표시용).
 * modMap: 유니크 mod 폴백 사전(KR 원문 → EN 템플릿) — stat id 경로가 실패한 줄에만 쓰인다.
 * @returns {{ text: string, missing: string[] }}
 */
/**
 * @param {object} opts
 * @param {boolean} [opts.en] item 이 **이미 영문**이다(영문 거래소에서 같은 매물 id 로 받아온 것).
 *   번역을 건너뛰고 설명을 그대로 쓴다 — 번역이 없으니 미변환·의심 항목도 없다.
 * @param {string|null} [opts.itemClass] 영문 경로에서 넘겨받는 Item Class.
 *   영문 아이템 JSON 에는 이 필드가 없어서(2026-08-17 실측) KR 아이템의 baseMap 으로 구한다.
 * @param {boolean} [opts.verbatim] **최소 폴백** — 영문 조회가 실패했을 때 쓴다.
 *   KR mod 를 번역하지 않고 그대로 낸다. 베이스 타입·Item Class 는 baseMap 으로 영문화한다
 *   (그게 없으면 PoB 가 아이템을 식별조차 못 한다).
 *
 *   왜 번역을 버렸나 (2026-08-23 제보 아이템 실물 검증): 번역 경로는 값을 맞히려다 **틀린 영문**을
 *   만들어냈다 — `Radius: 변수`, 3줄 mod 첫 줄 유실, `+-16%` 부호 겹침. PoB 가 읽을 수 없는 텍스트다.
 *   틀린 영문보다 **한글 원문이 정직하다** — 사용자가 "PoB 가 이상하다"가 아니라
 *   "영문 조회가 안 됐구나"로 읽는다.
 */
export function buildPobText(item, statMap, baseMap, uniqueMap = {}, modMap = {}, koMap = {}, opts = {}) {
  const en = !!opts.en
  const verbatim = en || !!opts.verbatim // 설명을 있는 그대로 쓰는가 (번역하지 않는가)
  const missing = []
  const warnings = [] // 번역은 됐지만 의심스러운 것 — '미변환' 배지에는 안 세고 제보 텍스트에만 담는다
  const base = en ? null : baseMap[item.baseType]
  if (!en && !base) missing.push('base:' + item.baseType)

  const itemClass = en ? (opts.itemClass || null) : (base && base[1])
  let name = item.name
  if (name && item.rarity === 'Unique') {
    // 영문 경로에서는 유니크 이름이 이미 영문이다(실측: '종말의 발' → 'Apocalypse Span') — 사전이 필요 없다.
    // 최소 폴백에서는 사전을 안 쓴다(uniqueMap 이 비어 온다) — 한글 이름 그대로 두고 미변환으로 세지 않는다.
    if (en || opts.verbatim) { /* 그대로 */ }
    else if (uniqueMap[name]) name = uniqueMap[name]
    else missing.push('unique:' + name)
  } else if (name) {
    const slug = (itemClass || 'item').toLowerCase().replace(/\s+/g, '-')
    name = 'seominugi-bookmark-item-' + slug
  }

  const head = []
  if (itemClass) head.push('Item Class: ' + itemClass)
  head.push('Rarity: ' + (item.rarity || 'Rare'))
  if (name) head.push(name)
  head.push(en ? (item.baseType || '') : (base ? base[0] : (item.baseType || '')))

  // 한 mod가 여러 줄(\n)일 수 있음(예: 서판 implicit) → 줄 단위로 펼치고 implicit 접미 부착
  const modLines = (list, hashAt, kind, suffix) => {
    const outLines = []
    ;(list || []).forEach((m, i) => {
      const ko = typeof m === 'string' ? m : m.description
      // 있는 그대로 경로(영문 원본 / 최소 폴백): 번역을 건너뛰고 게임 마크업([Block|막기])만 벗긴다.
      if (verbatim) {
        stripTags(ko).split('\n').forEach((l) => { const s = l.trim(); if (s) outLines.push(s + suffix) })
        return
      }
      const id = typeof m === 'object' && m.hash ? m.hash.replace(/^stat\./, '') : hashAt(i) // explicitMods[].hash는 "stat." 접두
      const t = translateMod(id, ko, statMap, modMap, koMap) // id가 없어도 KR 원문 폴백은 시도한다
      // KR 원문까지 남긴다 — stat id가 실제 문구와 어긋나는 부류(유니크 전용 mod)에선 id만으론
      // 무엇을 고쳐야 할지 알 수 없고, 폴백 사전(pobUniqueModMap)의 키가 KR 원문 기준이라 그렇다.
      if (t.en == null) missing.push(`${kind}:${id || '?'} — ${stripTags(ko).replace(/\s*\n\s*/g, ' / ')}`)
      // 템플릿이 덮지 못한 뒷줄 — 줄 단위로 보고한다(mod 전체가 아니라 그 줄만 사전에 넣으면 되므로)
      else if (t.missingLines) t.missingLines.forEach((l) => missing.push(`${kind}:${id || '?'} — ${l}`))
      // 번역은 성공했지만 조용히 틀렸을 수 있는 것 — 실패가 아니라 경고로 분리한다
      if (t.warnings) t.warnings.forEach((w) => warnings.push(`${kind}:${id || '?'} — ${w} — ${stripTags(ko).replace(/\s*\n\s*/g, ' / ')}`))
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
  // 인게임 Ctrl+C 순서: 헤더 → 속성(품질·반경) → 소켓 → Item Level → mod → 영향력 → Corrupted
  const props = []
  const qual = qualityLine(item)
  if (qual) props.push(qual)
  const rad = radiusLine(item)
  if (rad) {
    // 영문 경로에서는 반경 표기가 이미 영문이라 RADIUS_EN(KR→EN) 에 없는 게 정상 — 미변환으로 세지 않는다.
    // 최소 폴백도 마찬가지: 번역을 포기한 경로라 '미변환'을 셀 이유가 없다(제보해도 고칠 대상이 없다).
    if (!verbatim && !rad.known) missing.push('radius:' + rad.raw) // 모르는 표기는 그대로 내보내되 제보에 남긴다
    props.push(rad.line)
  }
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
  return { text: sections.map((s) => s.join('\n')).join('\n--------\n'), missing, warnings }
}

// 미변환 mod 수동 제보용 텍스트 — 웹훅 없이 사용자가 직접 Discord에 붙여넣는 방식(클라이언트에 웹훅 시크릿을 두지 않기 위함).
// missing·warnings 둘 다 없으면 null(제보할 게 없음 — 조립기가 버튼 동작 결정).
// warnings는 '번역은 됐지만 조용히 틀렸을 수 있는 것'이라 미변환과 절을 나눠 담는다.
export function buildReportText(item, missing, game, warnings = []) {
  const miss = missing || []
  const warn = warnings || []
  if (!miss.length && !warn.length) return null
  const out = [
    '[POE 북마크 아틀라스] PoB 번역 미변환 제보',
    `아이템: ${item.name || '(이름 없음)'} / 베이스: ${item.baseType || '(알 수 없음)'}`,
    `게임: ${game}`,
  ]
  if (miss.length) out.push('미변환 항목:', ...miss.map((m) => '- ' + m))
  if (warn.length) out.push('의심 항목(번역은 됐으나 확인 필요):', ...warn.map((w) => '- ' + w))
  return out.join('\n')
}
