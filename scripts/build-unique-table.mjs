// 고유 아이템 속성 표 생성 — 고유 아이템마다 붙는 속성(고정·기본·바알 함양)과 거래소 조건 id 를 잇는다.
//
// 실행: node scripts/build-unique-table.mjs [--fetch-pages] [--list <html>] [--stats <json>] [--items <json>] [--min-match 85]
//
// 왜 poe2db 인가: 게임 파일(GGPK)에는 고유 전용 속성의 정의(문구·범위)는 있지만 **어느 고유에 붙는지 잇는 정보가 없다**
// (2026-09-23 전수 확인 — Mods 를 가리키는 PoE2 표 68개·컬럼 103개, 스키마 밖 표 15개, Mods 행 폭 693바이트 일치,
// 고유별 태그 없음). poe2db 고유 목록 페이지는 그 묶음을 고유 445개 + 바알 함양 고유 48개 분량으로 보여 준다.
//
// 사용 범위(사용자 결정 2026-09-23): **개발 단계에서만** 쓴다. 목록 페이지는 사용자가 브라우저로 저장한 HTML 을 읽는다
// (기본 경로 scripts/.cache/poe2db/ — git 제외). 산출물에는 게임 문구와 거래소 조건 id 만 싣는다. 확장은 poe2db 에 요청하지 않는다.
// 무작위 풀(우물의 심장 「속성 부여 /73」)은 고유 **개별 페이지**에만 있다 — `--fetch-pages` 로 없는 페이지만 천천히 받아
// scripts/.cache/poe2db/pages/ 에 둔다(사용자 결정 2026-09-25 전수 점검). 새 고유는 화면에서 거래소 매물로 보충한다.
//
// 산출물 src/lib/uniqueMods.poe2.json
//   { u: [{ n: 이름, b: 베이스, c: modifiers 파일명|null, x?: 1(타락 고유), i?: [줄], f?: [줄], m?: [줄], mf?: [줄] }] }
//   i = 기본 속성(거래소 「고정」) · f = 고정 속성(「비고정」) · m = 바알 함양 속성(「비고정」 + 기타 필터 mutated)
//   mf = 함양 카드에 적힌 고정 속성 — **f 와 다를 때만** 싣는다(48개 중 17개). 함양 매물의 고정 속성은 f 가 아니라
//        mf 쪽일 수 있다(어느 쪽이 맞는지는 매물로 확인 전). 소비처는 함양 줄을 고를 때 f ∪ m 으로 합치지 말 것.
//   줄 = { t: 문구, id?: 거래소 조건 id, alt?: [후보 id — 문구가 같은 조건이 둘 이상], v?: [[최소,최대], …] 값 자리별,
//          k?: 'r'(무작위 풀 자리표시), p?: [{t, id?, alt?, all?, v?}] 무작위 풀(개별 페이지 표, 없으면 거래소 문구 규칙 —
//          all = 두 줄짜리 속성의 조건 둘), r?: 무작위로 붙는 개수 }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { classFromBaseName } from '../src/lib/itemClass.js'
import { loadStats } from './build-tier-table.mjs'
import { lineCondition, tradeIndexes } from '../src/lib/modLineMatch.js'
import { normalizeTradeText } from '../src/lib/statTextNorm.js'
// 테스트가 이 파일에서 가져가던 이름 — 정본은 src/lib/modLineMatch.js
export { matchLine, valuesByKey, tradeIndexes } from '../src/lib/modLineMatch.js'

const here = dirname(fileURLToPath(import.meta.url))
const CACHE = join(here, '.cache')
const EXPLICIT_GROUP = '비고정'
const IMPLICIT_GROUP = '고정'
const SKILL_GROUP = '스킬'
const DESECRATED_GROUP = '훼손된'
const CULTIVATED_HEAD = '<h5 class="card-header">Cultivated Uniques'

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/**
 * 속성 칸 하나의 HTML → 줄 목록. 범위의 대시(`<span class="ndash">—</span>`)는 게임 데이터와 같은 `-` 로 바꾼다
 * (statTextNorm 이 `(30-35)` 모양을 값 자리로 읽는다).
 */
export function htmlLines(inner) {
  return String(inner)
    .replace(/<span class="ndash">[^<]*<\/span>/g, '-')
    .split(/<br\s*\/?>/i)
    // poe2db 가 풀지 못한 키워드 표기 `[HitDamage|명중]` → 게임 문구 「명중」
    .map((s) => s.replace(/<[^>]+>/g, '').replace(/\[[^\]|]+\|([^\]]+)\]/g, '$1').replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * 저장한 고유 목록 페이지 → 고유 카드와 바알 함양 줄.
 * @returns {{ cards: Array<{name:string, base:string, corrupted:boolean, implicit:string[][], explicit:string[][]}>,
 *            mutated: Map<string,{explicit:string[][], mutated:string[][]}> }}
 *   속성은 칸(div) 단위의 줄 묶음이다 — 한 칸이 여러 줄이면 한 속성이 줄바꿈된 것일 수도, 속성 둘일 수도 있다.
 *   함양 카드의 고정 속성은 본 목록과 다를 수 있어(48개 중 17개 — 영혼의 외투 「정신력 +75」 대신 「토템 생명력 감소」)
 *   따로 돌려준다. 어느 쪽이 실제 함양 매물과 맞는지는 매물로 확인할 일이다.
 */
export function parseUniquePage(html) {
  const cut = html.indexOf(CULTIVATED_HEAD)
  const main = cut >= 0 ? html.slice(0, cut) : html
  const cards = []
  const cardRe = /<span class="uniqueName">([^<]+)<\/span>\s*<span class="uniqueTypeLine">([^<]+)<\/span><\/a>([\s\S]*?)(?=<div class="col">|$)/g
  const blocks = (body, cls) => [...body.matchAll(new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`, 'g'))].map((m) => htmlLines(m[1]))
  for (const m of main.matchAll(cardRe)) {
    cards.push({ name: m[1].trim(), base: m[2].trim(), corrupted: m[3].includes('<div class="corrupted">'), implicit: blocks(m[3], 'implicitMod'), explicit: blocks(m[3], 'explicitMod') })
  }
  const mutated = new Map()
  if (cut >= 0) {
    const sec = html.slice(cut)
    for (const m of sec.matchAll(/<a class="UniqueItems UniqueItem"[^>]*>([^<]+)<\/a>([\s\S]*?)(?=<div class="col">|$)/g)) {
      mutated.set(m[1].trim(), {
        explicit: blocks(m[2], 'explicitMod'),
        mutated: [...m[2].matchAll(/<div class="poe2 mutatedMod"><div>([\s\S]*?)<\/div><\/div>/g)].map((x) => htmlLines(x[1])),
      })
    }
  }
  return { cards, mutated }
}

// 화면에 보이지 않는 줄 — poe2db 가 내부 스탯을 그대로 적은 것(`visual use power charges … [1]`, `Has 5 Augment Sockets (Hidden)`)
const HIDDEN = /^[a-z]|\(Hidden\)$|\[\d+\]$/
// 무작위 풀 자리표시 — `[3 Random Socket Modifiers]`, 줄 중간의 `[Random Curse]`, `Random 1 Keystone Passive Skill [1,33]`,
// 마법사의 피의 `Mages Legacy의 유산`(poe2db 가 무작위 유산 이름을 풀지 못한 자리),
// 통과의례의 `… [Azmeri Spirit] …`(영문 대괄호 자리 — 개별 페이지 표에 혼백 10가지)
// 살점 도가니의 `(20-10)% less [random stat]`(소문자 — 개별 페이지 표에 ○○ 감폭 6가지)
const RANDOM_SLOT = /^\[[^\]]+\]$|\[Random [^\]]*\]|^Random \d|^Mages Legacy의 유산$|\[[A-Z][A-Za-z' ]+\]|^할당 Passive Skill$|^모든 Specific Skill |\[random stat\]/

/**
 * 무작위 자리 → 거래소 조건 풀 — **개별 페이지에 「속성 부여」 표가 없을 때만** 쓰는 대체 규칙. 거래소 능력치 목록에서 문구로
 * 가려낼 수 있는 것만 싣는다(마법사의 피는 페이지에 표 대신 「Ref」 만 있다 — 선택형 조건 `explicit.stat_264262054|1~14`).
 * 모리오르 인빅투스는 페이지 표(10개, 범위 포함)가 이 규칙(14개 — 다른 고유의 「채운 홈 하나당」까지)보다 정확해 표가 이긴다.
 * 둘 다 못 정하는 자리는 고를 수 없게 둔다.
 *   title — 풀 제목. 자리표시 문구가 영문·깨진 표기라 게임 문구(거래소 문구)에서 온 이름을 쓴다(전역 §30).
 */
const RANDOM_POOLS = [
  { slot: /^\[(\d+) Random Socket Modifiers\]$/, title: '채운 홈 하나당 속성', entry: (e) => e.id.startsWith('explicit.') && e.text.startsWith('채운 홈 하나당 ') },
  { slot: /^Mages Legacy의 유산$/, title: '마법사의 유산', entry: (e) => /^explicit\.stat_264262054\|\d+$/.test(e.id) },
  // 과대망상 — 「할당 Passive Skill」 3줄(poe2db 가 무작위 패시브 이름을 풀지 못한 자리). 거래소는 「할당 ○○」 선택형 조건
  { slot: /^할당 Passive Skill$/, title: '할당하는 패시브 스킬', entry: (e) => /^explicit\.stat_2954116742\|\d+$/.test(e.id) },
  // 믿음의 분광기 — 「모든 Specific Skill 스킬 레벨 +(1-3)」. 거래소는 「모든 ○○ 스킬 레벨 +#」 선택형 조건(값 = 레벨)
  { slot: /^모든 Specific Skill 스킬 레벨 \+\((\d+)-(\d+)\)$/, title: '스킬 레벨', entry: (e) => /^explicit\.stat_448592698\|\d+$/.test(e.id), valued: true },
]

// 자리표시 → 풀 제목(우리 화면 말). 「훼손된」은 거래소 그룹 이름(게임 표기) 그대로.
const SLOT_TITLES = [
  [/Desecrated prefix/i, '훼손된 접두어'],
  [/Desecrated suffix/i, '훼손된 접미어'],
  [/Socket Modifiers/i, '채운 홈 하나당 속성'],
]
const slotTitle = (text) => SLOT_TITLES.find(([re]) => re.test(text))?.[1] ?? '무작위 속성'
const slotSide = (text) => (/prefix/i.test(text) ? 'p' : /suffix/i.test(text) ? 's' : null)

/**
 * 풀 문구 하나 → 거래소 조건. 훼손 자리는 「훼손된」 그룹**만**, 아니면 비고정 그룹**만** 본다 — 다른 그룹으로 넘어가면
 * 매물의 줄과 조건 그룹이 어긋나 결과가 비거나 엉뚱해진다(독립 검토 2026-09-25: 우물의 심장 「처치 시 마나의 (1-2)% 회복」이
 * 비고정 조건으로 이어졌다). 거래소는 주얼 조건에 「(주얼)」을 붙이므로 못 찾으면 한 번 더 본다. 스킬 부여는 「스킬」 그룹.
 */
function poolCondition(t, { desecrated, indexes, explicitIndex, pool }) {
  const index = desecrated ? indexes?.[DESECRATED_GROUP] : explicitIndex
  if (index) {
    for (const text of [t, `${t}(주얼)`]) {
      const { ids, v } = lineCondition(text, index, desecrated ? null : pool)
      if (ids.length) return { ids, v }
    }
  }
  const skill = skillLine(t, indexes?.[SKILL_GROUP])
  return skill ? { ids: [skill.id], v: skill.v ?? null } : { ids: [], v: null }
}

/** 페이지 표의 줄들 → 풀 줄 `{t, id?|alt?|all?, v?}`. 두 줄짜리 속성은 줄마다 조건 하나일 때만 둘 다(`all`, 값 없음). */
function poolRows(rows, ctx) {
  return rows.map((r) => {
    const line = { t: r.t }
    const whole = poolCondition(r.t, ctx)
    if (r.t.includes('\n') && !whole.ids.length) {
      const parts = r.t.split('\n').map((t) => poolCondition(t, ctx))
      if (parts.every((p) => p.ids.length === 1)) line.all = parts.map((p) => p.ids[0])
      return line
    }
    if (whole.ids.length === 1) line.id = whole.ids[0]
    else if (whole.ids.length > 1) line.alt = whole.ids
    if (whole.v) line.v = whole.v
    return line
  })
}

/**
 * 무작위 자리에 쓰이지 않은 페이지 표 → 고유 항목에 반영.
 * - 표의 줄이 **여러 줄짜리 순열 변형**이고 모든 줄이 고정 속성에 이어지면(태양분열자 — 화염·냉기·번개 스킬 레벨
 *   +1/+2/+3 의 순열 6가지) 고정 줄의 값 범위를 변형 전체의 최소~최대로 넓힌다. 목록 페이지는 변형 하나만 적는다.
 * - 그 밖(한 줄짜리 표)은 **싣지 않는다** — 2026-09-25 전수 점검에서 옛 패치의 범위(검은 심장 「(0-30)%」)·옛 문구·
 *   실제 무작위 풀이 한 표에 섞여 있어 가를 수 없었다. 빌드 보고와 scripts/.cache/unique-page-extra.txt 에만 남긴다.
 * @returns {'variant'|'skip'|null}
 */
export function applyUnusedPage(entry, page, ctx) {
  if (!page?.length || !entry.f?.length) return null
  const fixed = new Map(entry.f.filter((l) => l.id).map((l) => [l.id, l]))
  const parsed = page.map((r) => r.t.split('\n').map((t) => ({ t, ...poolCondition(t, ctx) })))
  const variant = parsed.length >= 2 && parsed.every((lines) => lines.length >= 2 && lines.every((l) => l.ids.length === 1 && fixed.has(l.ids[0]) && l.v?.length === 1))
  if (variant) {
    const span = new Map()
    for (const lines of parsed) for (const l of lines) {
      const [a, b] = l.v[0]
      const cur = span.get(l.ids[0]) ?? [a, b]
      span.set(l.ids[0], [Math.min(cur[0], a), Math.max(cur[1], b)])
    }
    for (const [id, [a, b]] of span) {
      const line = fixed.get(id)
      if (line.v?.length !== 1 || a === b) continue
      line.v = [[a, b]]
      // 문구의 수도 범위로 — 목록 페이지가 적은 변형 하나(+1)가 이 고유의 값처럼 보이지 않게. 수가 하나인 문구만.
      const nums = line.t.match(/[+-]?\d+(?:\.\d+)?/g) ?? []
      if (nums.length === 1) line.t = line.t.replace(/([+-]?)\d+(?:\.\d+)?/, (_, sign) => `${sign}(${Math.abs(a)}-${Math.abs(b)})`)
    }
    return 'variant'
  }
  return 'skip'
}

/**
 * 무작위 자리 줄 — 풀을 정할 수 있으면 `p: [{t, id?, alt?, v?}]`, 개수가 적혀 있으면 `r`.
 * 1) 고유 개별 페이지의 「속성 부여」 표(page) — 접두·접미 자리는 그 칸만. 문구는 게임 문구(범위 포함)라 값 범위도 읽는다.
 *    훼손 자리는 거래소 「훼손된」 그룹(`desecrated.stat_*`)으로 잇는다(2026-09-25 매물 실측 — 우물의 심장 매물의 줄 hash 가
 *    모두 `stat.desecrated.stat_*`).
 * 2) 페이지에 표가 없으면 거래소 문구 규칙(RANDOM_POOLS).
 * @param {{payload?:object, page?:Array<{t:string,s?:string}>|null, indexes?:Record<string,Map<string,string[]>>, explicitIndex?:Map, pool?:Set<string>|null}} ctx
 */
export function randomLine(text, ctx = {}) {
  const out = { t: text, k: 'r' }
  const n = Number((text.match(/(\d+)\s+(?:Random|Unique|Keystone)/i) ?? text.match(/Random (\d+)/i))?.[1])
  if (Number.isInteger(n) && n > 0) out.r = n
  const side = slotSide(text)
  const page = ctx.page ?? []
  const sided = page.some((r) => r.s)
  // 표에 접두·접미 칸이 없으면(태어나지 않은 리치) 그 고유 전용 풀이다 — 일반 훼손 자리(「Custom」 = 사용자가 훼손한 자리)와
  // 키스톤 자리(살점 도가니 — 키스톤은 페이지의 다른 탭 「Passive /33」, 「속성 부여」 표는 「less [random stat]」 줄의 풀)에는 붙이지 않는다
  const rows = sided ? page.filter((r) => !side || r.s === side) : /Custom|Keystone/i.test(text) ? [] : page
  if (rows.length) {
    const desecrated = /Desecrated/i.test(text)
    if (ctx.used) ctx.used.page = true
    // 접두·접미 칸이 없는 풀은 자리 구분 없이 「훼손된 속성」 한 줄로 접는다(리치 접두 1 + 접미 2 = 3개)
    out.t = !sided && desecrated ? '훼손된 속성' : slotTitle(text)
    out.p = poolRows(rows, { ...ctx, desecrated })
    return out
  }
  const rule = RANDOM_POOLS.find((r) => r.slot.test(text))
  if (!rule) return out
  const entries = (ctx.payload?.result ?? []).flatMap((g) => g.entries ?? []).filter((e) => typeof e?.id === 'string' && typeof e.text === 'string' && rule.entry(e))
  if (!entries.length) return out
  out.t = rule.title
  // 값 자리가 있는 규칙(스킬 레벨 +(1-3))은 자리표시의 범위를 풀 줄마다 싣는다
  const m = rule.valued ? rule.slot.exec(text) : null
  const v = m ? [[Number(m[1]), Number(m[2])]] : null
  out.p = entries.map((e) => (v ? { t: e.text.replace('#', `(${v[0][0]}-${v[0][1]})`), id: e.id, v } : { t: e.text, id: e.id }))
  return out
}

// 스킬 부여 — poe2db 「스킬 부여: 레벨 11 녹아내린 소나기」 ↔ 거래소 「스킬」 그룹 「스킬 부여: #레벨 녹아내린 소나기」.
// 레벨이 없는 줄(「스킬 부여: 창 투척」)은 거래소에 같은 이름이 있을 때만 붙고 값은 비운다.
const SKILL_GRANT = /^스킬 부여: (?:레벨 (\d+) )?(.+)$/
export function skillLine(text, skillIndex) {
  const m = SKILL_GRANT.exec(text)
  if (!m || !skillIndex) return null
  const ids = skillIndex.get(normalizeTradeText(`스킬 부여: #레벨 ${m[2]}`))
  if (!ids || ids.length !== 1) return null
  const out = { t: text, id: ids[0] }
  if (m[1]) out.v = [[Number(m[1]), Number(m[1])]]
  return out
}

let STATS = null // 무작위 풀·스킬 부여용 — main 이 채운다
let PAGE = null // 지금 만드는 고유의 개별 페이지 풀 — main 이 고유마다 바꾼다
const PAGE_USED = { page: false } // 무작위 자리가 페이지 표를 썼나 — 안 썼으면 main 이 applyUnusedPage
/** 줄 → 산출물 줄. */
function lineOut(text, index, pool) {
  if (RANDOM_SLOT.test(text)) return randomLine(text, { payload: STATS?.payload, page: PAGE, indexes: STATS?.indexes, explicitIndex: index, pool, used: PAGE_USED })
  const { ids, v } = lineCondition(text, index, pool)
  const out = { t: text }
  if (ids.length === 1) out.id = ids[0]
  else if (ids.length > 1) out.alt = ids
  if (v) out.v = v
  if (!ids.length) return skillLine(text, STATS?.skill) ?? out
  return out
}

/** 같은 무작위 풀 자리가 줄지어 있으면(마법사의 피 유산 4줄) 한 줄로 — 개수는 `r`. */
function foldRandom(lines) {
  const out = []
  for (const l of lines) {
    const prev = out[out.length - 1]
    if (l.k === 'r' && l.p && prev?.k === 'r' && prev.p && prev.t === l.t) { prev.r = (prev.r ?? 1) + (l.r ?? 1); continue }
    out.push(l.k === 'r' && l.p ? { ...l } : l)
  }
  return out
}

/**
 * 칸 묶음 → 줄. 칸 하나가 여러 줄이면 **먼저 통째로** 잇는다(한 속성이 줄바꿈된 경우 — 거래소 문구도 한 조건).
 * 안 붙으면 줄마다, 그래도 못 붙은 이웃 줄은 둘씩 붙여 본다.
 */
export function linesOf(blocks, index, pool, counts) {
  const flat = []
  for (const block of blocks) {
    const shown = block.filter((t) => {
      if (HIDDEN.test(t)) { counts.hidden++; return false }
      return true
    })
    if (!shown.length) continue
    if (shown.length > 1) {
      const whole = lineOut(shown.join('\n'), index, pool)
      if (whole.id || whole.alt) { flat.push(whole); continue }
    }
    flat.push(...shown.map((t) => lineOut(t, index, pool)))
  }
  // poe2db 는 한 속성을 칸 여러 개로 쪼개기도 한다(「혈장벽」 두 칸, 「전호의 보관자」 세 칸) — 못 붙은 이웃을 3줄·2줄로 이어 본다
  const loose = (l) => l && !l.id && !l.alt && l.k !== 'r'
  const out = []
  for (let i = 0; i < flat.length; i++) {
    let joined = null
    for (const size of [3, 2]) {
      const win = flat.slice(i, i + size)
      if (win.length < size || !win.every(loose)) continue
      const tried = lineOut(win.map((l) => l.t).join('\n'), index, pool)
      if (tried.id || tried.alt) { joined = { line: tried, size }; break }
    }
    if (joined) { out.push(joined.line); i += joined.size - 1 } else out.push(flat[i])
  }
  return foldRandom(out)
}

/**
 * 베이스 이름 → 유형. PoB 베이스 대응표에 없는 유물·서판은 속성 표가 들고 있는 베이스 목록(`b`)으로 찾는다.
 * @returns {string|null} modifiers 파일명
 */
export function classOfBase(base, baseMap, affixes) {
  const c = classFromBaseName(base, baseMap)
  if (c) return c
  for (const [cls, v] of Object.entries(affixes ?? {})) if (Array.isArray(v?.b) && v.b.some((b) => b?.n === base)) return cls
  return null
}

// 유형 → 속성을 잇는 거래소 그룹. 유물 속성은 「성역」 그룹이다(티어 표 빌드의 GROUP_BY_CLASS 와 같은 근거).
const GROUP_OF_CLASS = { Relic: '성역' }

/** 유형의 일반 속성 id 집합 — `(특정)` 판정용. */
function poolOf(affixes, cls) {
  const a = cls ? affixes[cls] : null
  return a ? new Set([...(a.p ?? []), ...(a.s ?? [])]) : null
}

/**
 * 고유 개별 페이지의 「<이름> 속성 부여 /N」 표 → 무작위로 붙을 수 있는 속성 목록.
 * 우물의 심장은 `Prefix|Suffix` 칸이 있고, 모리오르 인빅투스는 설명 칸만 있다. 설명 뒤의 태그 배지(원소·화염…)는 뺀다.
 * @returns {Array<{t:string, s?:'p'|'s'}>|null} 표가 없으면 null
 */
export function parsePagePool(html, name) {
  const heads = [...String(html).matchAll(/<h5 class="card-header"[^>]*>([\s\S]*?)<\/h5>/g)]
  // 「<이름> 속성 부여 /N」 — **제목이 이 고유의 이름으로 시작하는 표만**. 다른 고유의 표가 같은 페이지에 실리기도 한다
  // (쿨레막의 손아귀 페이지에 「지식의 매듭 Modifiers /27」, 2026-09-25 전수 점검)
  const at = heads.findIndex((h) => {
    const title = h[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    return (!name || title.startsWith(name)) && /(?:속성 부여|Modifiers)\s*\/\s*\d+/.test(title)
  })
  if (at < 0) return null
  const body = html.slice(heads[at].index, heads[at + 1]?.index ?? html.length)
  const rows = []
  for (const r of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1])
    if (!cells.length) continue
    const desc = cells[cells.length - 1].replace(/<span class="badge[^"]*"[^>]*>[\s\S]*?<\/span>/g, '')
    // 내부 스탯 줄(`use unique blackflame ignite effect [0]`)은 목록 카드처럼 뺀다 — 남기면 두 줄 매칭이 실패한다
    const t = htmlLines(desc).filter((l) => !HIDDEN.test(l)).join('\n')
    if (!t) continue
    const kind = cells.length > 1 ? htmlLines(cells[0]).join('') : ''
    rows.push(/^prefix$/i.test(kind) ? { t, s: 'p' } : /^suffix$/i.test(kind) ? { t, s: 's' } : { t })
  }
  return rows
}

/** 목록 페이지의 고유 카드 → poe2db 개별 페이지 주소 조각(`Morior_Invictus`). */
export function uniqueSlugs(html) {
  const cut = html.indexOf(CULTIVATED_HEAD)
  const main = cut >= 0 ? html.slice(0, cut) : html
  const out = new Map()
  const re = /<a class="UniqueItem"[^>]*href="\/kr\/([^"]+)"><span class="uniqueName">([^<]+)<\/span>\s*<span class="uniqueTypeLine">([^<]+)<\/span>/g
  for (const m of main.matchAll(re)) out.set(`${m[2].trim()}\u0000${m[3].trim()}`, m[1])
  return out
}

const PAGES = join(CACHE, 'poe2db', 'pages')
/**
 * 고유 개별 페이지를 받아 캐시한다(사용자 결정 2026-09-25 — 전수 점검). **개발 빌드 때만**, 없는 것만, 천천히 받는다.
 * 확장은 poe2db 에 요청하지 않는다.
 */
async function fetchPages(slugs, { delayMs = 1500 } = {}) {
  mkdirSync(PAGES, { recursive: true })
  const todo = [...new Set(slugs.values())].filter((s) => !existsSync(join(PAGES, `${s}.html`)))
  console.log(`poe2db 개별 페이지: 받을 것 ${todo.length}개 (캐시 ${slugs.size - todo.length}개)`)
  for (const [i, slug] of todo.entries()) {
    // 목록의 href 는 이미 퍼센트 인코딩돼 있다(`Mj%C3%B6lner`) — 다시 인코딩하면 404
    const res = await fetch(`https://poe2db.tw/kr/${slug.includes('%') ? slug : encodeURIComponent(slug)}`, { headers: { 'User-Agent': 'Mozilla/5.0 (poe-bookmark-atlas dev build)' } })
    if (!res.ok) { console.log(`  ⚠ ${slug}: ${res.status}`); if (res.status === 429) break; continue }
    writeFileSync(join(PAGES, `${slug}.html`), await res.text(), 'utf8')
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${todo.length}`)
    await new Promise((r) => setTimeout(r, delayMs))
  }
}

async function loadItems(itemsPath) {
  if (itemsPath) return JSON.parse(readFileSync(itemsPath, 'utf8'))
  const cache = join(CACHE, 'poe2-items.json')
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const url = 'https://poe.kakaogames.com/api/trade2/data/items'
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`거래소 아이템 목록을 받지 못했습니다: ${res.status} ${url}`)
  const json = await res.json()
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(cache, JSON.stringify(json), 'utf8')
  return json
}

async function main() {
  const argv = process.argv.slice(2)
  const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback }
  const listPath = arg('--list', join(CACHE, 'poe2db', 'unique-item.kr.html'))
  const minMatch = Number(arg('--min-match', '85'))
  if (!Number.isFinite(minMatch)) { console.error(`--min-match 값이 숫자가 아닙니다: ${arg('--min-match', '')}`); process.exit(1) }
  if (!existsSync(listPath)) {
    console.error(`고유 목록 HTML 이 없습니다: ${listPath}\n  poe2db 「Unique_item」(kr) 페이지를 브라우저로 저장해 이 경로에 두세요.`)
    process.exit(1)
  }

  const listHtml = readFileSync(listPath, 'utf8')
  const { cards, mutated } = parseUniquePage(listHtml)
  const slugs = uniqueSlugs(listHtml)
  if (argv.includes('--fetch-pages')) await fetchPages(slugs)
  const statsPayload = await loadStats('poe2', arg('--stats', null))
  const indexes = tradeIndexes(statsPayload)
  STATS = { payload: statsPayload, skill: indexes[SKILL_GROUP], indexes }
  const items = await loadItems(arg('--items', null))
  const affixes = JSON.parse(readFileSync(join(here, '..', 'src', 'lib', 'statAffixes.poe2.json'), 'utf8'))
  const baseMap = JSON.parse(readFileSync(join(here, '..', 'src', 'lib', 'pobBaseMap.json'), 'utf8'))
  const tradeUniques = new Set()
  for (const g of items.result ?? []) for (const e of g.entries ?? []) if (e.flags?.unique && e.name) tradeUniques.add(`${e.name}\u0000${e.type}`)

  const counts = { hidden: 0 }
  const u = []
  const noClass = new Set()
  const notInTrade = []
  const mfDiffers = []
  const pagePools = [] // 개별 페이지에 「속성 부여」 표가 있던 고유
  const pageExtra = [] // 자리에도 변형에도 안 쓴 표 — 사람이 볼 목록
  for (const card of cards) {
    const c = classOfBase(card.base, baseMap, affixes)
    if (!c) noClass.add(card.base)
    if (!tradeUniques.has(`${card.name}\u0000${card.base}`)) notInTrade.push(`${card.name} (${card.base})`)
    const pool = poolOf(affixes, c)
    const entry = { n: card.name, b: card.base, c: c ?? null }
    if (card.corrupted) entry.x = 1
    const explicitIndex = indexes[GROUP_OF_CLASS[c] ?? EXPLICIT_GROUP]
    const cult = mutated.get(card.name)
    const slug = slugs.get(`${card.name}\u0000${card.base}`)
    const pagePath = slug ? join(PAGES, `${slug}.html`) : null
    PAGE = pagePath && existsSync(pagePath) ? parsePagePool(readFileSync(pagePath, 'utf8'), card.name) : null
    PAGE_USED.page = false
    const i = linesOf(card.implicit, indexes[IMPLICIT_GROUP], pool, counts)
    const f = linesOf(card.explicit, explicitIndex, pool, counts)
    const m = linesOf(cult?.mutated ?? [], explicitIndex, pool, counts)
    if (i.length) entry.i = i
    if (f.length) entry.f = f
    if (m.length) entry.m = m
    if (cult) {
      const mf = linesOf(cult.explicit, explicitIndex, pool, { hidden: 0 })
      const same = mf.length === f.length && mf.every((l) => f.some((x) => x.t === l.t))
      if (!same) { entry.mf = mf; mfDiffers.push(card.name) }
    }
    if (PAGE?.length) {
      const how = PAGE_USED.page ? 'slot' : applyUnusedPage(entry, PAGE, { indexes, explicitIndex, pool, desecrated: false })
      pagePools.push(`${card.name} ${PAGE.length}(${how ?? '안 씀'})`)
      if (how === 'skip') pageExtra.push(`== ${card.name} (${card.base})\n${PAGE.map((r) => `   ${r.t.replace(/\n/g, ' / ')}`).join('\n')}`)
    }
    u.push(entry)
  }
  const orphanMutated = [...mutated.keys()].filter((n) => !cards.some((c) => c.name === n))

  const stat = (key) => {
    const lines = u.flatMap((e) => e[key] ?? []).filter((l) => l.k !== 'r')
    const one = lines.filter((l) => l.id).length
    const alt = lines.filter((l) => l.alt).length
    const withValue = lines.filter((l) => (l.id || l.alt) && l.v).length
    return { lines: lines.length, one, alt, none: lines.length - one - alt, withValue, rate: lines.length ? (one + alt) / lines.length * 100 : 100 }
  }
  const sf = stat('f'), sm = stat('m'), si = stat('i')
  const out = join(here, '..', 'src', 'lib', 'uniqueMods.poe2.json')
  const body = JSON.stringify({ u })
  writeFileSync(out, body + '\n', 'utf8')

  const unmatched = u.flatMap((e) => ['i', 'f', 'm'].flatMap((k) => (e[k] ?? []).filter((l) => !l.id && !l.alt && l.k !== 'r').map((l) => `[${k}] ${e.n}: ${l.t.replace(/\n/g, ' / ')}`)))
  writeFileSync(join(CACHE, 'unique-unmatched.txt'), unmatched.join('\n') + '\n', 'utf8')

  const fmt = (s) => `${s.lines}줄 → 조건 하나 ${s.one} · 후보 여럿 ${s.alt} · 못 이음 ${s.none} (${s.rate.toFixed(1)}%) · 값 읽음 ${s.withValue}`
  console.log(`고유 ${u.length}개 (바알 함양 ${mutated.size}개)`)
  console.log(`  고정 속성 : ${fmt(sf)}`)
  console.log(`  함양 속성 : ${fmt(sm)}`)
  console.log(`  기본 속성 : ${fmt(si)}`)
  const randomLines = u.flatMap((e) => ['f', 'm', 'mf'].flatMap((k) => (e[k] ?? []).filter((l) => l.k === 'r').map((l) => ({ e, l }))))
  const poolRows = randomLines.flatMap(({ l }) => l.p ?? [])
  console.log(`  무작위 풀 자리 : ${u.filter((e) => (e.f ?? []).some((l) => l.k === 'r')).length}개 고유 · 자리 ${randomLines.length}줄 중 풀 있음 ${randomLines.filter(({ l }) => l.p?.length).length}` +
    ` · 풀 속성 ${poolRows.length}개 중 조건 이음 ${poolRows.filter((p) => p.id || p.alt || p.all).length}`)
  const noPool = randomLines.filter(({ l }) => !l.p?.length).map(({ e, l }) => `${e.n}: ${l.t}`)
  if (noPool.length) console.log(`  ⚠ 풀을 못 정한 자리: ${noPool.join(' · ')}`)
  console.log(`  개별 페이지 「속성 부여」 표: ${pagePools.length}개 고유 (${pagePools.join(', ')})`)
  writeFileSync(join(CACHE, 'unique-page-extra.txt'), pageExtra.join('\n') + '\n', 'utf8')
  if (pageExtra.length) console.log(`  싣지 않은 표 ${pageExtra.length}개: scripts/.cache/unique-page-extra.txt`)
  writeFileSync(join(CACHE, 'unique-pool-unmatched.txt'), randomLines.flatMap(({ e, l }) => (l.p ?? []).filter((p) => !p.id && !p.alt && !p.all).map((p) => `${e.n} [${l.t}] ${p.t.replace(/\n/g, ' / ')}`)).join('\n') + '\n', 'utf8')
  console.log(`  숨은 줄(뺌) : ${counts.hidden}`)
  if (noClass.size) console.log(`  ⚠ 유형을 정하지 못한 베이스 ${noClass.size}개: ${[...noClass].join(', ')}`)
  if (notInTrade.length) console.log(`  ⚠ 거래소 고유 목록에 없는 이름·베이스 ${notInTrade.length}개: ${notInTrade.join(', ')}`)
  if (orphanMutated.length) console.log(`  ⚠ 본 목록에 없는 바알 함양 고유: ${orphanMutated.join(', ')}`)
  if (mfDiffers.length) console.log(`  함양 카드의 고정 속성이 본 목록과 다른 고유 ${mfDiffers.length}개(mf 로 따로 실음): ${mfDiffers.join(', ')}`)
  console.log(`  타락 고유 : ${u.filter((e) => e.x).length}개`)
  console.log(`  못 이은 줄 목록: scripts/.cache/unique-unmatched.txt`)
  console.log(`→ ${out} (${(body.length / 1024).toFixed(0)}KB, gzip ${(gzipSync(body).length / 1024).toFixed(0)}KB)`)
  if (sf.rate < minMatch) {
    console.error(`고정 속성 매칭률 ${sf.rate.toFixed(1)}% 가 기준 ${minMatch}% 보다 낮습니다 — 거래소 문구나 poe2db 구조가 바뀌었을 수 있습니다.`)
    process.exit(1)
  }
}

if (process.argv[1] && process.argv[1].endsWith('build-unique-table.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
