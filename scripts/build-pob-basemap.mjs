// PoB base 맵 생성 — poe-game-data 의 name.{kr,en}을 KR 키로 평탄화.
//   {game}/json/**/*_base_types.json → src/lib/pobBaseMap.json  { "<kr>": ["<en>", "<classId>"] }
// (PoB import는 base 이름이 EN이어야 파싱되고, classId는 "Item Class:" 라인용)
//
// 2026-08-23: 소스를 poe-i18n-json-data-generator-dev(은퇴) → poe-game-data(GGPK 1차 추출)로 옮겼다.
// 2026-08-24: 유니크 이름 맵(pobUniqueMap) 생성을 뺐다 — PoB 복사가 영문 원본을 받아오게 되면서
//   유니크 이름 번역이 필요 없어졌다(폴백에서는 한글 이름을 그대로 둔다). 자세한 배경은 src/lib/pobExport.js 머리말.
//
// 실행: node scripts/build-pob-basemap.mjs [game] [출력명]
//   poe2(기본): node scripts/build-pob-basemap.mjs
//   poe1:       node scripts/build-pob-basemap.mjs poe1 pobBaseMap.poe1.json
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveLockedGameDataRoot } from './poe-game-data-lock.mjs'

const game = process.argv[2] || 'poe2'
const baseOut = process.argv[3] || 'pobBaseMap.json'
const here = dirname(fileURLToPath(import.meta.url))
const libDir = join(here, '..', 'src', 'lib')

// 이웃 저장소 또는 POE_GAME_DATA_ROOT를 허용하되, 루트 lock과 동일한 snapshot만 읽는다.
const dataRoot = resolveLockedGameDataRoot({ startDir: join(here, '..') })
const root = join(dataRoot, game, 'json')

const baseFiles = []
;(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/base_types.*\.json$/.test(f)) baseFiles.push(p) } })(root)

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
