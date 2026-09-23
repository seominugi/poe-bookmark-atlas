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
//          k?: 'r'(무작위 풀 자리표시) }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { normalizeTradeText, modTextKeys } from '../src/lib/statTextNorm.js'
import { classFromBaseName } from '../src/lib/itemClass.js'
import { loadStats, LOCAL_MARK } from './build-tier-table.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const CACHE = join(here, '.cache')
const EXPLICIT_GROUP = '비고정'
const IMPLICIT_GROUP = '고정'
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

/** 거래소 능력치 목록 → 그룹 이름 → (비교 키 → id 목록). */
export function tradeIndexes(stats) {
  const out = {}
  for (const g of stats?.result ?? []) {
    const map = (out[g.label] ??= new Map())
    for (const e of g.entries ?? []) {
      const k = normalizeTradeText(e.text)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(e.id)
    }
  }
  return out
}

// 화면에 보이지 않는 줄 — poe2db 가 내부 스탯을 그대로 적은 것(`visual use power charges … [1]`, `Has 5 Augment Sockets (Hidden)`)
const HIDDEN = /^[a-z]|\(Hidden\)$|\[\d+\]$/
// 무작위 풀 자리표시 — `[3 Random Socket Modifiers]`, 줄 중간의 `[Random Curse]`, `Random 1 Keystone Passive Skill [1,33]`
const RANDOM_SLOT = /^\[[^\]]+\]$|\[Random [^\]]*\]|^Random \d/
// 극성 짝 — 거래소가 한쪽 문구 하나로 받는 것. 티어 표 빌드와 함께 쓰는 polarityFlipped(감소→증가)는 그대로 두고
// 이 표에서만 넓힌다(감폭·감속 — 전호의 보관자·화살 비·기우 기도 실측).
const POLARITY = [['감소', '증가'], ['감폭', '증폭'], ['감속', '가속']]
const flipped = (text) => {
  const t = String(text)
  const hit = POLARITY.filter(([neg]) => t.includes(neg))
  return hit.length ? hit.reduce((s, [neg, pos]) => s.replaceAll(neg, pos), t) : null
}
const VALUE = '([+\\-]?\\(\\s*[+\\-]?\\d+(?:\\.\\d+)?\\s*-\\s*[+\\-]?\\d+(?:\\.\\d+)?\\s*\\)|[+\\-]?\\d+(?:\\.\\d+)?)'

/**
 * 붙은 거래소 문구(비교 키)를 틀로 삼아 줄에서 값을 읽는다. 키의 `#` 자리마다 [최소, 최대].
 * 읽지 못하면 null — 값 없이 넣게 된다(틀린 값보다 빈칸이 낫다).
 */
export function valuesByKey(text, key, flip) {
  const plain = key.endsWith(LOCAL_MARK) ? key.slice(0, -LOCAL_MARK.length) : key
  if (!plain.includes('#')) return null
  const pattern = plain.split('#').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')).join(VALUE)
  const src = flip ? flipped(text) : text
  const m = new RegExp(`^\\s*${pattern}\\s*$`).exec(src)
  if (!m) return null
  return m.slice(1).map((raw) => {
    const neg = raw.startsWith('-(')
    const r = raw.match(/\(\s*([+\-]?\d+(?:\.\d+)?)\s*-\s*([+\-]?\d+(?:\.\d+)?)\s*\)/)
    let [a, b] = r ? [Number(r[1]), Number(r[2])] : [Number(raw), Number(raw)]
    if (neg) [a, b] = [-b, -a]
    // 극성 치환(`공격 속도 20% 감소` → 거래소 `공격 속도 #% 증가`)이면 거래소 값은 음수다
    return flip ? [-b, -a] : [a, b]
  })
}

/**
 * 줄 하나 → 거래소 조건. 문구 규칙은 티어 표 빌드와 같다(statTextNorm).
 * - 로컬 능력치는 거래소가 `(특정)` 을 붙인 별도 조건이다. 둘 다 있으면 **그 유형의 일반 속성 목록**에 있는 쪽을 고른다
 *   (로컬 여부는 능력치의 성질이라 비고유에서 잰 목록으로 가려도 된다).
 * - 문구가 **완전히 같은** 조건이 둘 이상이면 고르지 않는다. 비고유로 잰 `trade-twins` 규칙은 고유에서 틀린다
 *   (무기 「모든 능력치 #」: 비고유 0건인 id 가 고유 포함 10000건 — 2026-09-16 실측). 후보(alt)로 남겨 매물로 확정한다.
 * - 못 붙고 `감소`·`감폭`·`감속` 이 있으면 극성을 뒤집어 한 번 더 본다(티어 표와 같은 추론 — 거래소는 `증가` 쪽 한 조건으로 받는다).
 * @returns {{ids:string[], keys:string[], flip:boolean}} keys — 붙은 거래소 비교 키(값을 읽는 틀)
 */
export function matchLine(text, index, pool, flip = false) {
  const src = flip ? flipped(text) : text
  const filled = (src.match(/\([^)]*\d[^)]*\)/g) || []).length
  const byKey = new Map()
  for (let n = filled; n <= filled + 2; n++) {
    for (const k of modTextKeys(src, n)) {
      for (const key of [k, k + LOCAL_MARK]) if (index?.has(key) && !byKey.has(key)) byKey.set(key, index.get(key))
    }
  }
  let keys = [...byKey.keys()]
  // 같은 문구의 로컬·전역 짝 — 유형 목록으로 가른다
  if (keys.length === 2 && keys[0] + LOCAL_MARK === keys[1] && pool) {
    const [g, l] = keys
    const inG = byKey.get(g).some((id) => pool.has(id))
    const inL = byKey.get(l).some((id) => pool.has(id))
    if (inG !== inL) keys = [inL ? l : g]
  }
  if (!keys.length) {
    if (!flip && flipped(text)) return matchLine(text, index, pool, true)
    return { ids: [], keys: [], flip }
  }
  const ids = [...new Set(keys.flatMap((k) => byKey.get(k)))]
  return { ids, keys, flip }
}

/** 줄 → 산출물 줄. */
function lineOut(text, index, pool) {
  if (RANDOM_SLOT.test(text)) return { t: text, k: 'r' }
  const { ids, keys, flip } = matchLine(text, index, pool)
  const out = { t: text }
  if (ids.length === 1) out.id = ids[0]
  else if (ids.length > 1) out.alt = ids
  // 후보 키가 여럿이어도(로컬·전역 짝, 문구가 같은 조건) 값 자리는 같은 문구에서 나온다 — 처음 읽히는 틀을 쓴다
  for (const key of keys) {
    const v = valuesByKey(text, key, flip)
    if (v) { out.v = v; break }
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
  return out
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
  const indexes = tradeIndexes(await loadStats('poe2', arg('--stats', null)))
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
