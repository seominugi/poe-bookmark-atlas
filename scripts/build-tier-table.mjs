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
import { normalizeTradeText, normalizeModText } from '../src/lib/statTextNorm.js'
import { MOD_FILE_BY_POB_CLASS } from '../src/lib/itemClass.js'

const here = dirname(fileURLToPath(import.meta.url))
const EXPLICIT_GROUP = '비고정' // 거래소 능력치 목록에서 일반 옵션 그룹
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

/** 거래소 능력치 목록 → 정규화 문구 → stat id 목록 */
function buildTradeIndex(stats) {
  const index = new Map()
  for (const group of stats.result ?? []) {
    if (group.label !== EXPLICIT_GROUP) continue
    for (const entry of group.entries ?? []) {
      const key = normalizeTradeText(entry.text)
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(entry.id)
    }
  }
  return index
}

/** 모드의 각 문장이 어떤 거래소 stat id 후보들과 맞는지. 하나라도 못 찾으면 null. */
function candidatesForMod(mod, tradeIndex) {
  const lines = (mod.stats ?? []).filter((s) => s?.text?.kr)
  if (!lines.length) return null
  const keys = lines.map((s) => normalizeModText(s.text.kr, (s.stats ?? []).length))
  const cands = keys.map((k) => tradeIndex.get(k))
  return cands.some((c) => !c) ? null : { keys, cands }
}

/** 표시 배율이 적용되지 않아 값을 그대로 쓸 수 없는 모드인가. */
function isUnscaled(mod) {
  return (mod.stats ?? []).some((s) => (s.stats ?? []).some((x) => UNSCALED_STAT.test(x.stat ?? '')))
}

/** 같은 요구 레벨에 값이 둘 이상이면 티어 순서를 정할 수 없다. */
function hasValueConflict(rows) {
  const seen = new Map()
  for (const row of rows) {
    const sig = JSON.stringify(row.ranges)
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
  const minMatch = Number(arg('--min-match', '90'))

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

  const tradeIndex = buildTradeIndex(await loadStats(game, arg('--stats', null)))
  const table = {}
  let total = 0, matched = 0, unscaled = 0, conflicts = 0

  for (const file of files) {
    const cls = file.replace('.json', '')
    const data = JSON.parse(readFileSync(join(modDir, file), 'utf8'))
    const families = new Map()
    for (const affix of ['prefix', 'suffix']) {
      for (const mod of data.buckets?.normal?.[affix] ?? []) {
        if (!(mod.stats ?? []).some((s) => s?.text?.kr)) continue
        total++
        if (isUnscaled(mod)) { unscaled++; continue }
        const found = candidatesForMod(mod, tradeIndex)
        if (!found) continue
        matched++
        const key = found.keys.join('\n') + '|' + affix
        if (!families.has(key)) families.set(key, { cands: found.cands, rows: [] })
        families.get(key).rows.push({ ilvl: mod.tier, ranges: mod.valueRanges })
      }
    }
    const byStat = {}
    for (const { cands, rows } of families.values()) {
      if (hasValueConflict(rows)) { conflicts++; continue }
      rows.sort((a, b) => b.ilvl - a.ilvl) // 필요 아이템 레벨이 높은 쪽이 T1
      const tiers = rows.map((row, i) => ({ t: i + 1, l: row.ilvl, v: row.ranges }))
      // 후보 id 전부에 같은 사다리를 단다. 같은 stat 이 여러 계열에 걸리면 티어가 더 많은 쪽을 남긴다.
      for (const ids of cands) {
        for (const id of ids) {
          if (!byStat[id] || byStat[id].length < tiers.length) byStat[id] = tiers
        }
      }
    }
    if (Object.keys(byStat).length) table[cls] = byStat
  }

  const rate = (100 * matched) / total
  const out = join(here, '..', 'src', 'lib', `statTiers.${game}.json`)
  const json = JSON.stringify(table)
  writeFileSync(out, json, 'utf8')

  const statCount = Object.values(table).reduce((a, c) => a + Object.keys(c).length, 0)
  console.log(`${game}: 모드 ${total}`)
  console.log(`  표시 배율 미적용으로 제외 : ${unscaled}`)
  console.log(`  문구 매칭                : ${matched} (${rate.toFixed(1)}%)`)
  console.log(`  값 충돌로 버린 계열       : ${conflicts}`)
  console.log(`${Object.keys(table).length} 부위 · ${statCount} 능력치 · gzip ${(gzipSync(json).length / 1024).toFixed(1)}KB → ${out}`)
  if (rate < minMatch) {
    console.error(`매칭률이 임계치(${minMatch}%) 아래입니다 — 거래소 문구가 바뀌었을 수 있습니다.`)
    process.exit(1)
  }
}

// 테스트가 verifyClassBridge 만 가져올 수 있도록, 직접 실행할 때만 main 을 돈다.
if (process.argv[1] && process.argv[1].endsWith('build-tier-table.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
