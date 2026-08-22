// PoB base·유니크 이름 맵 생성 — poe-game-data 의 name.{kr,en}을 KR 키로 평탄화.
//   {game}/json/**/*_base_types.json → src/lib/pobBaseMap.json    { "<kr>": ["<en>", "<classId>"] }
//   {game}/uniques/json/uniques.json → src/lib/pobUniqueMap.json  { "<kr>": "<en>" }
// (PoB import는 base 이름이 EN이어야 파싱되고, 유니크는 EN 이름으로 매칭됨. classId는 "Item Class:" 라인용)
//
// 2026-08-23: 소스를 poe-i18n-json-data-generator-dev(은퇴) → poe-game-data(GGPK 1차 추출)로 옮겼다.
// 유니크는 클래스별 *_unique_items.json 이 아니라 단일 uniques.json 이라 별도로 읽는다.
//
// 실행: node scripts/build-pob-basemap.mjs [game] [base출력명] [unique출력명]
//   poe2(기본): node scripts/build-pob-basemap.mjs
//   poe1:       node scripts/build-pob-basemap.mjs poe1 pobBaseMap.poe1.json pobUniqueMap.poe1.json
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const game = process.argv[2] || 'poe2'
const baseOut = process.argv[3] || 'pobBaseMap.json'
const uniqueOut = process.argv[4] || 'pobUniqueMap.json'
const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, '..', 'src', 'lib')

// poe-game-data 는 이웃 저장소다 — repo 루트부터 위로 훑어 찾는다(dev·prod 동일 해석).
// 하드코딩 기본값으로 떨어지지 않는다: 못 찾으면 멈추고 사용법을 알린다.
function siblingDir(name) {
  let d = join(here, '..')
  for (;;) {
    const p = join(d, name)
    try { if (statSync(p).isDirectory()) return p } catch { /* 없으면 계속 위로 */ }
    const parent = dirname(d)
    if (parent === d) return null
    d = parent
  }
}
const dataRoot = siblingDir('poe-game-data')
if (!dataRoot) {
  console.error('[pob-basemap] poe-game-data 를 찾지 못했습니다 — 이웃 저장소로 클론되어 있어야 합니다.')
  process.exit(1)
}
const root = join(dataRoot, game, 'json')
const uniquesPath = join(dataRoot, game, 'uniques', 'json', 'uniques.json')

const baseFiles = [], uniqueFiles = []
;(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/base_types.*\.json$/.test(f)) baseFiles.push(p) } })(root)
try { if (statSync(uniquesPath).isFile()) uniqueFiles.push(uniquesPath) } catch { /* 유니크 없으면 base 만 만든다 */ }

const map = {}
let total = 0, dup = 0
for (const f of baseFiles) {
  const arr = JSON.parse(readFileSync(f, 'utf8'))
  if (!Array.isArray(arr)) continue
  for (const it of arr) {
    const kr = it?.name?.kr, en = it?.name?.en
    if (!kr || !en) continue
    total++
    if (map[kr]) { if (map[kr][0] !== en) dup++; continue } // 같은 KR 다른 EN 충돌은 첫 항목 유지(카운트만)
    // className.en(복수형 "Spears"·"Tablet")을 쓴다 — PoB 의 "Item Class:" 줄이 그 이름을 기대한다.
    // poe-game-data 의 classId 는 단수·내부명("Spear"·"TowerAugmentation")이라 PoB 가 못 알아본다.
    map[kr] = [en, it?.className?.en || it.classId || '']
  }
}
writeFileSync(join(libDir, baseOut), JSON.stringify(map), 'utf8')
console.log(`${baseOut} 생성: ${Object.keys(map).length} bases (입력 ${total}, EN 충돌 ${dup})`)

const uniq = {}
let utotal = 0
for (const f of uniqueFiles) {
  const arr = JSON.parse(readFileSync(f, 'utf8'))
  if (!Array.isArray(arr)) continue
  for (const it of arr) {
    const kr = it?.name?.kr, en = it?.name?.en
    if (!kr || !en) continue
    utotal++
    if (!uniq[kr]) uniq[kr] = en
  }
}
writeFileSync(join(libDir, uniqueOut), JSON.stringify(uniq), 'utf8')
console.log(`${uniqueOut} 생성: ${Object.keys(uniq).length} uniques (입력 ${utotal})`)
