// PoB base·유니크 이름 맵 생성 — poe-i18n 생성기 데이터의 name.{kr,en}을 KR 키로 평탄화.
//   *_base_types.json   → src/lib/pobBaseMap.json    { "<kr>": ["<en>", "<classId>"] }
//   *_unique_items.json → src/lib/pobUniqueMap.json  { "<kr>": "<en>" }
// (PoB import는 base 이름이 EN이어야 파싱되고, 유니크는 EN 이름으로 매칭됨. classId는 "Item Class:" 라인용)
//
// 실행: node scripts/build-pob-basemap.mjs [poe-i18n json 루트] [base출력명] [unique출력명]
//   poe2(기본): node scripts/build-pob-basemap.mjs
//   poe1:       node scripts/build-pob-basemap.mjs .../assets/data/poe1/json pobBaseMap.poe1.json pobUniqueMap.poe1.json
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = process.argv[2] || 'D:/github/poe-i18n-json-data-generator-dev/assets/data/poe2/json'
const baseOut = process.argv[3] || 'pobBaseMap.json'
const uniqueOut = process.argv[4] || 'pobUniqueMap.json'
const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib')

const baseFiles = [], uniqueFiles = []
;(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/base_types.*\.json$/.test(f)) baseFiles.push(p); else if (/unique_items.*\.json$/.test(f)) uniqueFiles.push(p) } })(root)

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
    map[kr] = [en, it.classId || '']
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
