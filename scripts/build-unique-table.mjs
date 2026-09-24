// 고유 아이템 속성 표 생성 — 고유 아이템마다 붙는 속성(고정·기본·바알 함양)과 거래소 조건 id 를 잇는다.
//
// 실행: node scripts/build-unique-table.mjs [--list <html>] [--stats <json>] [--items <json>] [--min-match 85]
//
// 왜 poe2db 인가: 게임 파일(GGPK)에는 고유 전용 속성의 정의(문구·범위)는 있지만 **어느 고유에 붙는지 잇는 정보가 없다**
// (2026-09-23 전수 확인 — Mods 를 가리키는 PoE2 표 68개·컬럼 103개, 스키마 밖 표 15개, Mods 행 폭 693바이트 일치,
// 고유별 태그 없음). poe2db 고유 목록 페이지는 그 묶음을 고유 445개 + 바알 함양 고유 48개 분량으로 보여 준다.
//
// 사용 범위(사용자 결정 2026-09-23): **개발 단계에서만** 쓴다. 이 스크립트는 poe2db 에 요청하지 않고, 사용자가 브라우저로
// 저장한 HTML 을 읽는다(기본 경로 scripts/.cache/poe2db/ — git 제외). 산출물에는 게임 문구와 거래소 조건 id 만 싣는다.
// 무작위 풀(「[3 Random Socket Modifiers]」)·새 고유는 poe2db 에도 없어서 화면에서 거래소 매물로 보충한다.
//
// 산출물 src/lib/uniqueMods.poe2.json
//   { u: [{ n: 이름, b: 베이스, c: modifiers 파일명|null, x?: 1(타락 고유), i?: [줄], f?: [줄], m?: [줄], mf?: [줄] }] }
//   i = 기본 속성(거래소 「고정」) · f = 고정 속성(「비고정」) · m = 바알 함양 속성(「비고정」 + 기타 필터 mutated)
//   mf = 함양 카드에 적힌 고정 속성 — **f 와 다를 때만** 싣는다(48개 중 17개). 함양 매물의 고정 속성은 f 가 아니라
//        mf 쪽일 수 있다(어느 쪽이 맞는지는 매물로 확인 전). 소비처는 함양 줄을 고를 때 f ∪ m 으로 합치지 말 것.
//   줄 = { t: 문구, id?: 거래소 조건 id, alt?: [후보 id — 문구가 같은 조건이 둘 이상], v?: [[최소,최대], …] 값 자리별,
//          k?: 'r'(무작위 풀 자리표시), p?: [{t, id}] 무작위 풀(거래소 문구로 가려낸 것), r?: 무작위로 붙는 개수 }
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
// 마법사의 피의 `Mages Legacy의 유산`(poe2db 가 무작위 유산 이름을 풀지 못한 자리)
const RANDOM_SLOT = /^\[[^\]]+\]$|\[Random [^\]]*\]|^Random \d|^Mages Legacy의 유산$/

/**
 * 무작위 자리 → 거래소 조건 풀. poe2db 는 풀을 적지 않지만 거래소 능력치 목록에서 문구로 가려낼 수 있는 것만 싣는다
 * (2026-09-24 매물 실측 — 모리오르 인빅투스 매물의 무작위 줄은 모두 「채운 홈 하나당 …」, 마법사의 피는 선택형 조건
 * `explicit.stat_264262054|1~14` 「○○의 유산」). 풀을 못 정하는 자리는 고를 수 없게 둔다 — 훼손 접두·접미(우물의 심장)는
 * 「매물에서 속성 더 찾기」도 훼손 줄을 빼서 채워지지 않는다.
 *   title — 풀 제목. 자리표시 문구가 영문·깨진 표기라 게임 문구(거래소 문구)에서 온 이름을 쓴다(전역 §30).
 */
const RANDOM_POOLS = [
  { slot: /^\[(\d+) Random Socket Modifiers\]$/, title: '채운 홈 하나당 속성', entry: (e) => e.id.startsWith('explicit.') && e.text.startsWith('채운 홈 하나당 ') },
  { slot: /^Mages Legacy의 유산$/, title: '마법사의 유산', entry: (e) => /^explicit\.stat_264262054\|\d+$/.test(e.id) },
]

/** 무작위 자리 줄 — 풀을 정할 수 있으면 `p: [{t, id}]`, 개수가 적혀 있으면 `r`. */
export function randomLine(text, statsPayload) {
  const out = { t: text, k: 'r' }
  const rule = RANDOM_POOLS.find((r) => r.slot.test(text))
  if (!rule) return out
  const entries = (statsPayload?.result ?? []).flatMap((g) => g.entries ?? []).filter((e) => typeof e?.id === 'string' && typeof e.text === 'string' && rule.entry(e))
  if (!entries.length) return out
  out.t = rule.title
  const n = Number(text.match(rule.slot)?.[1])
  if (Number.isInteger(n) && n > 0) out.r = n
  out.p = entries.map((e) => ({ t: e.text, id: e.id }))
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
/** 줄 → 산출물 줄. */
function lineOut(text, index, pool) {
  if (RANDOM_SLOT.test(text)) return randomLine(text, STATS?.payload)
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

  const { cards, mutated } = parseUniquePage(readFileSync(listPath, 'utf8'))
  const statsPayload = await loadStats('poe2', arg('--stats', null))
  const indexes = tradeIndexes(statsPayload)
  STATS = { payload: statsPayload, skill: indexes[SKILL_GROUP] }
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
  for (const card of cards) {
    const c = classOfBase(card.base, baseMap, affixes)
    if (!c) noClass.add(card.base)
    if (!tradeUniques.has(`${card.name}\u0000${card.base}`)) notInTrade.push(`${card.name} (${card.base})`)
    const pool = poolOf(affixes, c)
    const entry = { n: card.name, b: card.base, c: c ?? null }
    if (card.corrupted) entry.x = 1
    const explicitIndex = indexes[GROUP_OF_CLASS[c] ?? EXPLICIT_GROUP]
    const cult = mutated.get(card.name)
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
  console.log(`  무작위 풀 자리 : ${u.filter((e) => (e.f ?? []).some((l) => l.k === 'r')).length}개 고유`)
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
