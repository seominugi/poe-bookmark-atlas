// PoB 영문 stat 맵 생성 — trade2 data/stats(EN+KR)를 stat id로 위치 페어링 → src/lib/pobStatMap.json
//   { "explicit.stat_XXX": "EN #-패턴" }                              // 단일 변형
//   { "explicit.stat_YYY": [{ en, ko }, ...] }                        // 다중 변형(Area/Map 등) — 아이템 KR 설명으로 택1
//
// 입력 raw JSON은 **비-KR 환경(VPN 등)**에서 curl로 1회 받아둔다 (EN=pathofexile.com은 KR IP geo-block):
//   curl -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" https://www.pathofexile.com/api/trade2/data/stats -o en-stats.json
//   curl -A "Mozilla/5.0"                                https://poe.kakaogames.com/api/trade2/data/stats  -o kr-stats.json
// (Node fetch는 Cloudflare 봇차단에 걸려 curl 사용.) KR·EN 모두 그룹·순서 동일(8202개)해 인덱스로 페어링.
//
// 실행: node scripts/build-pob-statmap.mjs <en-stats.json> <kr-stats.json>
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const [, , enPath, krPath] = process.argv
if (!enPath || !krPath) { console.error('사용법: node scripts/build-pob-statmap.mjs <en-stats.json> <kr-stats.json>'); process.exit(1) }
const SKIP_TYPES = new Set(['pseudo']) // 검색 집계용 — 실제 아이템 mod 아님
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'pobStatMap.json')

const en = JSON.parse(await readFile(enPath, 'utf8'))
const kr = JSON.parse(await readFile(krPath, 'utf8'))

// KR: type#index → entry (EN과 동일 순서라 인덱스로 매칭)
const krAt = new Map()
for (const g of kr.result) g.entries.forEach((e, i) => krAt.set(g.id + '#' + i, e))

// id(전체, 예 "explicit.stat_689816330") → [{en, ko}] (같은 id의 변형 모두 수집)
const byId = new Map()
for (const g of en.result) {
  if (SKIP_TYPES.has(g.id)) continue
  g.entries.forEach((e, i) => {
    if (!byId.has(e.id)) byId.set(e.id, [])
    byId.get(e.id).push({ en: e.text, ko: krAt.get(g.id + '#' + i)?.text ?? null })
  })
}

const map = {}
for (const [id, variants] of byId) {
  const uniqEn = [...new Set(variants.map((v) => v.en))]
  map[id] = uniqEn.length === 1 ? uniqEn[0] : variants // 단일 → 문자열, 다중 → [{en,ko}]
}

await writeFile(out, JSON.stringify(map), 'utf8')
const multi = Object.values(map).filter(Array.isArray).length
console.log(`pobStatMap.json 생성: ${Object.keys(map).length} ids (다중변형 ${multi}) → ${out}`)
