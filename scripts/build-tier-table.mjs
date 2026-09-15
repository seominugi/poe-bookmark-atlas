// 티어 표 생성 — poe-game-data 의 모드 데이터와 거래소 능력치 목록을 문구로 잇는다.
//
// 실행: node scripts/build-tier-table.mjs [--game poe2] [--stats <경로>] [--min-match 95]
//   거래소 응답은 기본으로 받아오고, --stats 로 저장해둔 파일을 쓸 수도 있다.
//   (한국 IP 에서 /api/trade2/data/stats 는 인증 없이 200 을 준다 — HTML 경로만 로그인으로 리다이렉트된다)
//
// 게임 데이터의 `tier` 필드는 티어가 아니라 **필요 아이템 레벨**이다. 높은 쪽부터 T1 을 매긴다.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { resolveLockedGameDataRoot } from './poe-game-data-lock.mjs'
import { normalizeTradeText, modTextKeys, polarityFlipped } from '../src/lib/statTextNorm.js'
import { MOD_FILE_BY_POB_CLASS } from '../src/lib/itemClass.js'
import { affixCategoryOf } from '../src/lib/affixCategory.js'

const here = dirname(fileURLToPath(import.meta.url))
const EXPLICIT_GROUP = '비고정' // 거래소 능력치 목록에서 일반 옵션 그룹
const ENCHANT_GROUP = '인챈트' // 타락 속성이 거래소에서 걸리는 그룹 — 실측 380개 중 356개가 이 그룹 문구와 이어진다(2026-09-15)
const SKIP_FILES = new Set(['Map.json'])

// 게임 데이터가 표시 배율을 적용하지 않은 스탯 — 값이 100배(흡수·치명타)·60배(재생)로 들어 있다.
// 배율을 넣어 되살릴 수는 있으나 게임으로 검증하지 못해 v1 에서는 제외한다(설계 문서 §7).
const UNSCALED_STAT = /(_permyriad|_per_minute)$|^local_critical_strike_chance$/

/**
 * 대응표가 양쪽 실물과 맞는지 본다. 문제 목록을 돌려주고, 비어 있으면 통과다.
 * @param {Record<string,string>} bridge PoB 클래스 → modifiers 파일명
 * @param {Set<string>} modFiles 실재하는 modifiers 파일명
 * @param {Set<string>} pobClasses pobBaseMap 에 실재하는 PoB 클래스명
 * @returns {string[]}
 */
export function verifyClassBridge(bridge, modFiles, pobClasses) {
  const problems = []
  for (const [pobClass, modFile] of Object.entries(bridge)) {
    if (!modFiles.has(modFile)) problems.push(`대응표가 없는 modifiers 파일을 지목: ${pobClass} → ${modFile}`)
    if (!pobClasses.has(pobClass)) problems.push(`pobBaseMap 에 없는 클래스를 지목: ${pobClass}`)
  }
  return problems
}

/**
 * 거래소 능력치 목록 → `{ index, valueless }`.
 * - `index`: 정규화 문구 → stat id 목록
 * - `valueless`: 문구에 값 자리(`#`)가 없는 stat id — 거래소에 넣을 수치가 없으므로
 *   **티어 사다리가 의미 없다**(`즉시 회복`·`반경이 대형으로 업그레이드` 류). 매칭 판정에는
 *   그대로 쓰되 표에는 싣지 않는다. 실측(2026-09-13) 5건.
 */
function buildTradeIndex(stats, label = EXPLICIT_GROUP) {
  const index = new Map()
  const valueless = new Set()
  for (const group of stats.result ?? []) {
    if (group.label !== label) continue
    for (const entry of group.entries ?? []) {
      const key = normalizeTradeText(entry.text)
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(entry.id)
      if (!key.includes('#')) valueless.add(entry.id)
    }
  }
  return { index, valueless }
}

/**
 * 모드의 값 슬롯을 **문장 단위로 잘라낸다.**
 *
 * `mod.valueRanges` 는 모든 문장의 슬롯이 하나로 이어붙은 배열이다. 한 모드가 두 문장을 갖는
 * 하이브리드(예: 활의 `시야 반경 15% 증가` + `정확도 41~60`)에서 이걸 통째로 쓰면, 한 문장짜리
 * 능력치에 옆 문장의 값이 따라붙어 표가 조용히 오염된다(2026-09-04 검수에서 25건 발견).
 * @returns {number[][][]} 문장별 [min,max] 배열
 */
export function rangesByLine(mod, lines) {
  const all = mod.valueRanges ?? []
  const out = []
  let offset = 0
  for (const line of lines) {
    const slots = (line.stats ?? []).length
    out.push(all.slice(offset, offset + slots))
    offset += slots
  }
  return out
}

/**
 * 모드의 각 문장이 어떤 거래소 stat id 후보들과 맞는지. 하나라도 못 찾으면 null.
 *
 * 문장마다 키 후보를 여러 개 받아(`modTextKeys`) **거래소에 실재하는 것**을 고른다.
 * 어느 숫자가 값인지는 거래소 목록을 가진 이쪽만 판정할 수 있다.
 * @param {string[]} ambiguous 후보 둘 이상이 동시에 붙은 문장을 여기 담는다(호출부가 보고·제외)
 */
function candidatesForMod(mod, tradeIndex, ambiguous) {
  const lines = (mod.stats ?? []).filter((s) => s?.text?.kr)
  if (!lines.length) return null
  const keys = []
  let inferred = false
  for (const line of lines) {
    const slots = (line.stats ?? []).length
    let hits = lineTextVariants(mod, line.text.kr)
      .flatMap((text) => modTextKeys(text, slots))
      .filter((k, i, all) => tradeIndex.has(k) && all.indexOf(k) === i)
    // 둘 이상 붙으면 어느 숫자가 값인지 판정할 수 없다. 임의로 고르면 '못 붙음'이 아니라
    // **틀린 티어 값이 조용히 실린다** — 그래서 고르지 않고 버린다.
    if (hits.length > 1) { ambiguous.push(`${line.text.kr} → ${hits.join(' | ')}`); return null }
    if (!hits.length && allNegative(line)) {
      // 거래소가 부호 있는 항목 하나로 통합하고 `증가` 문구만 갖는 경우(statTextNorm
      // polarityFlipped 주석). **값이 음수일 때만** 시도한다 — 그게 이 추론의 근거다.
      const flipped = polarityFlipped(line.text.kr)
      const flipHits = flipped ? modTextKeys(flipped, slots).filter((k) => tradeIndex.has(k)) : []
      if (flipHits.length > 1) { ambiguous.push(`${line.text.kr} (극성 치환) → ${flipHits.join(' | ')}`); return null }
      if (flipHits.length === 1) { hits = flipHits; inferred = true }
    }
    if (!hits.length) return null
    keys.push(hits[0])
  }
  return { keys, cands: keys.map((k) => tradeIndex.get(k)), lines, inferred }
}

/**
 * 문장을 거래소 문구로 이을 때 시도할 글자들.
 *
 * 반경 주얼 모드(`JewelRadius*`)는 게임 데이터의 문구에 **「반경 내 … 패시브 스킬이 …도 부여」 틀이 빠져 있다**
 * (`JewelRadiusAccuracy` = `일반 정확도 (1-2)% 증가`). 그대로 이으면 일반판(`JewelAccuracy` 5~10)과 같은 거래소 id 에
 * 붙어 같은 요구 레벨에 값이 둘이 되고, 값 충돌로 **주얼 161계열 중 152계열이 표에서 통째로 빠졌다**(2026-09-15 실측).
 * 거래소에는 반경판이 따로 있다: `반경 내 소형 패시브 스킬이 일반 정확도 #% 증가도 부여`.
 *
 * 소형·주요 중 어느 틀인지는 데이터에 없다. 둘 다 시도해 **거래소에 실재하는 쪽 하나**를 쓴다 — 실측 161개 중
 * 소형 75 · 주요 79 · 둘 다 0 · 못 붙음 7. 둘 다 붙으면 호출부의 모호 판정이 버린다.
 * 문구가 이미 `반경 내` 로 시작하면(`반경 내 주요 패시브 스킬 효과`) 틀을 씌우지 않고 원문도 함께 시도한다.
 * @param {{id?:string}} mod
 * @param {string} text
 * @returns {string[]}
 */
export function lineTextVariants(mod, text) {
  if (!/^JewelRadius/.test(mod?.id ?? '')) return [text]
  if (text.startsWith('반경 내')) return [text]
  return ['소형', '주요'].map((size) => `반경 내 ${size} 패시브 스킬이 ${text}도 부여`)
}

/** 이 문장의 값이 전부 음수인가 — 극성 치환을 허용할 근거. */
function allNegative(line) {
  const ranges = (line.stats ?? []).map((x) => x.valueRange).filter(Boolean)
  return ranges.length > 0 && ranges.every((r) => r.every((v) => v < 0))
}

/**
 * 같은 거래소 id 에 계열이 여럿 걸릴 때 새 사다리로 바꿀지.
 *
 * 극성 치환을 넣으면 `증가` 계열과 `감소` 계열이 한 id 로 몰린다 — 실측 2건(생명력·마나
 * 플라스크의 `회복량 #% 증가` 에 양수 `회복량 (41-45)% 증가` 와 음수 `회복량 -50% 감소`).
 * **추론은 직접 매칭을 덮지 않는다**: 직접 매칭된 계열이 사용자가 실제로 찾는 쪽이고,
 * 치환은 우리가 끼워 넣은 판단이라 확신도가 낮다.
 *
 * 길이가 같으면 먼저 온 것을 지킨다 — 파일 순회 순서에 따라 표가 달라지면 재현이 깨진다.
 * @returns {boolean} 바꿔야 하면 true
 */
export function preferLadder(prev, prevInferred, next, nextInferred) {
  if (!prev) return true
  if (prevInferred !== nextInferred) return prevInferred && !nextInferred
  return prev.length < next.length
}

/** 표시 배율이 적용되지 않아 값을 그대로 쓸 수 없는 모드인가. */
function isUnscaled(mod) {
  return (mod.stats ?? []).some((s) => (s.stats ?? []).some((x) => UNSCALED_STAT.test(x.stat ?? '')))
}

/** 같은 요구 레벨에 값이 둘 이상이면 티어 순서를 정할 수 없다. */
export function hasValueConflict(rows) {
  const seen = new Map()
  for (const row of rows) {
    const sig = JSON.stringify(row.byLine)
    if (seen.has(row.ilvl) && seen.get(row.ilvl) !== sig) return true
    seen.set(row.ilvl, sig)
  }
  return false
}

async function loadStats(game, statsPath) {
  if (statsPath) return JSON.parse(readFileSync(statsPath, 'utf8'))
  const cacheDir = join(here, '.cache')
  const cache = join(cacheDir, `${game}-stats.json`)
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const path = game === 'poe2' ? 'trade2' : 'trade'
  const url = `https://poe.kakaogames.com/api/${path}/data/stats`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`거래소 능력치 목록을 받지 못했습니다: ${res.status} ${url}`)
  const json = await res.json()
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(cache, JSON.stringify(json), 'utf8')
  return json
}

async function main() {
  const argv = process.argv.slice(2)
  const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback }
  const game = arg('--game', 'poe2')
  // NaN 이면 아래 `rate < minMatch` 가 항상 거짓이 되어 임계치 검사가 통째로 무력해진다.
  // 이 검사는 "거래소 문구가 바뀌었다"를 알려주는 유일한 경보라 오타 하나로 잃으면 안 된다.
  const minMatch = Number(arg('--min-match', '90'))
  if (!Number.isFinite(minMatch)) {
    console.error(`--min-match 값이 숫자가 아닙니다: ${arg('--min-match', '')}`)
    process.exit(1)
  }

  const dataRoot = resolveLockedGameDataRoot({ startDir: join(here, '..') })
  const modDir = join(dataRoot, game, 'modifiers', 'json')
  const files = readdirSync(modDir).filter((f) => f.endsWith('.json') && !SKIP_FILES.has(f))

  const baseMap = JSON.parse(readFileSync(join(here, '..', 'src', 'lib', 'pobBaseMap.json'), 'utf8'))
  const problems = verifyClassBridge(
    MOD_FILE_BY_POB_CLASS,
    new Set(files.map((f) => f.replace('.json', ''))),
    new Set(Object.values(baseMap).map((v) => v[1]).filter(Boolean))
  )
  if (problems.length) {
    console.error('부위 대응표 검증 실패:'); problems.forEach((p) => console.error('  ' + p))
    process.exit(1)
  }

  const statsPayload = await loadStats(game, arg('--stats', null))
  const { index: tradeIndex, valueless } = buildTradeIndex(statsPayload)
  // 타락으로 붙는 속성은 거래소에서 「인챈트」 로 거른다(PoE2). 문구 매칭 규칙은 일반 모드와 같다.
  const { index: enchantIndex, valueless: enchantValueless } = buildTradeIndex(statsPayload, ENCHANT_GROUP)
  const table = {}
  const affixes = {}
  let corruptedTotal = 0, corruptedMatched = 0
  let total = 0, matched = 0, unscaled = 0, conflicts = 0, skippedValueless = 0
  const ambiguous = []

  for (const file of files) {
    const cls = file.replace('.json', '')
    const data = JSON.parse(readFileSync(join(modDir, file), 'utf8'))
    const families = new Map()
    for (const affix of ['prefix', 'suffix']) {
      for (const mod of data.buckets?.normal?.[affix] ?? []) {
        if (!(mod.stats ?? []).some((s) => s?.text?.kr)) continue
        total++
        if (isUnscaled(mod)) { unscaled++; continue }
        const found = candidatesForMod(mod, tradeIndex, ambiguous)
        if (!found) continue
        matched++
        // 극성 치환으로 얻은 계열은 **별도 family** 다. 치환하면 키가 직접 매칭 계열과
        // 같아지므로(`회복량 -50% 감소` → `회복량 #% 증가`) 그냥 두면 양수 계열과 음수 계열이
        // 한 사다리로 합쳐진다 — 요구 레벨이 다르면 hasValueConflict 도 못 잡고 +45 와 -50 이
        // 같은 사다리에 섞인다.
        const key = found.keys.join('\n') + '|' + affix + (found.inferred ? '|flip' : '')
        if (!families.has(key)) {
          // 문장마다 첫 내부 능력치 이름 — 속성 목록의 종류 묶음(affixCategory) 판정에 쓴다
          const statNames = found.lines.map((line) => line.stats?.[0]?.stat ?? '')
          families.set(key, { cands: found.cands, rows: [], inferred: found.inferred, affix, statNames })
        }
        families.get(key).rows.push({ ilvl: mod.tier, byLine: rangesByLine(mod, found.lines) })
      }
    }
    const byStat = {}
    const inferredById = {}
    const affixById = {}
    const categoryById = {}
    for (const { cands, rows, inferred, affix, statNames } of families.values()) {
      if (hasValueConflict(rows)) { conflicts++; continue }
      rows.sort((a, b) => b.ilvl - a.ilvl) // 필요 아이템 레벨이 높은 쪽이 T1
      // **문장마다 따로** 사다리를 만든다 — 한 모드가 두 문장을 가지면 값 슬롯도 문장별로 갈린다.
      // 통째로 쓰면 한 문장짜리 능력치에 옆 문장 값이 따라붙는다.
      cands.forEach((ids, lineIndex) => {
        const tiers = rows.map((row, i) => ({ t: i + 1, l: row.ilvl, v: row.byLine[lineIndex] }))
        // 후보 id 전부에 같은 사다리를 단다. 여러 계열이 한 id 에 걸릴 때의 우선순위는 preferLadder.
        for (const id of ids) {
          if (valueless.has(id)) { skippedValueless++; continue } // 넣을 칸이 없는 능력치
          if (preferLadder(byStat[id], inferredById[id], tiers, inferred)) {
            byStat[id] = tiers
            inferredById[id] = inferred
            affixById[id] = affix // 표에 실린 사다리의 접두·접미를 따른다
            categoryById[id] = affixCategoryOf(statNames[lineIndex])
          }
        }
      })
    }
    const corrupted = corruptedAffixesOf(data, enchantIndex, enchantValueless, ambiguous)
    corruptedTotal += corrupted.total
    corruptedMatched += Object.keys(corrupted.x).length
    if (Object.keys(byStat).length) {
      table[cls] = byStat
      affixes[cls] = { ...affixListsOf(Object.keys(byStat), affixById), c: categoryById, x: corrupted.x }
    }
  }

  const rate = (100 * matched) / total
  const out = join(here, '..', 'src', 'lib', `statTiers.${game}.json`)
  const json = JSON.stringify(table)
  const statCount = Object.values(table).reduce((a, c) => a + Object.keys(c).length, 0)

  console.log(`${game}: 모드 ${total}`)
  console.log(`  표시 배율 미적용으로 제외 : ${unscaled}`)
  console.log(`  문구 매칭                : ${matched} (${rate.toFixed(1)}%)`)
  console.log(`  값 충돌로 버린 계열       : ${conflicts}`)
  console.log(`  후보 모호로 버린 모드     : ${ambiguous.length}`)
  console.log(`  값 칸이 없어 표에서 뺀 것 : ${skippedValueless}`)
  console.log(`  타락(인챈트) 속성          : 모드 ${corruptedTotal} → 능력치 ${corruptedMatched}`)
  // 버린 것을 조용히 넘기지 않는다 — 이 목록이 곧 '정규화 규칙을 손봐야 하는 자리'다.
  for (const line of [...new Set(ambiguous)]) console.log(`      ${line}`)
  console.log(`${Object.keys(table).length} 부위 · ${statCount} 능력치 · gzip ${(gzipSync(json).length / 1024).toFixed(1)}KB`)

  // 임계치를 넘은 뒤에만 쓴다 — 실패해 놓고 파일을 남기면, 종료 코드를 놓친 사람이
  // 깨진 표를 그대로 커밋한다. 대응표 검증 실패도 쓰기 전에 끝내므로 두 실패 경로가 일관된다.
  if (rate < minMatch) {
    console.error(`매칭률이 임계치(${minMatch}%) 아래입니다 — 거래소 문구가 바뀌었을 수 있습니다. 표를 쓰지 않았습니다.`)
    process.exit(1)
  }
  writeFileSync(out, json, 'utf8')
  console.log(`→ ${out}`)
  // 속성 목록(패널 '속성 목록')용 접두·접미 구분 — 티어 표와 같은 회차에서만 쓴다(둘이 어긋나면 안 된다).
  const affixOut = join(here, '..', 'src', 'lib', `statAffixes.${game}.json`)
  writeFileSync(affixOut, JSON.stringify(affixes), 'utf8')
  console.log(`→ ${affixOut}`)
}

/**
 * 부위 하나의 타락 속성 — 거래소 인챈트 id → 값 범위·종류.
 * 타락 모드는 티어가 없다(모드마다 요구 레벨 1 · 값 범위 하나). 같은 id 에 범위가 둘 이상 붙으면 판단할 근거가 없어 뺀다.
 * @returns {{total:number, x:Record<string,{v:number[][], c:string}>}}
 */
export function corruptedAffixesOf(data, enchantIndex, enchantValueless, ambiguous) {
  const mods = [...(data.buckets?.corrupted?.prefix ?? []), ...(data.buckets?.corrupted?.suffix ?? [])]
  const x = {}
  const conflicted = new Set()
  let total = 0
  for (const mod of mods) {
    if (!(mod.stats ?? []).some((s) => s?.text?.kr)) continue
    total++
    if (isUnscaled(mod)) continue
    const found = candidatesForMod(mod, enchantIndex, ambiguous)
    if (!found) continue
    const byLine = rangesByLine(mod, found.lines)
    found.cands.forEach((ids, lineIndex) => {
      const v = byLine[lineIndex]
      const c = affixCategoryOf(found.lines[lineIndex].stats?.[0]?.stat ?? '')
      for (const id of ids) {
        if (enchantValueless.has(id) || conflicted.has(id)) continue
        if (x[id] && JSON.stringify(x[id].v) !== JSON.stringify(v)) { delete x[id]; conflicted.add(id); continue }
        x[id] = { v, c }
      }
    })
  }
  return { total, x }
}

/**
 * 부위 하나의 능력치 id 를 접두어·접미어로 가른다. 순서는 표에 실린 순서(게임 데이터 순서)를 지킨다.
 * @param {string[]} ids 표에 실린 stat id (삽입 순서)
 * @param {Record<string,'prefix'|'suffix'>} affixById
 * @returns {{p:string[], s:string[]}}
 */
export function affixListsOf(ids, affixById) {
  const out = { p: [], s: [] }
  for (const id of ids) (affixById[id] === 'suffix' ? out.s : out.p).push(id)
  return out
}

// 테스트가 verifyClassBridge 만 가져올 수 있도록, 직접 실행할 때만 main 을 돈다.
if (process.argv[1] && process.argv[1].endsWith('build-tier-table.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
