// PoB 영문 stat 맵 생성 — trade2 data/stats(EN+KR)를 stat id로 위치 페어링 → src/lib/pobStatMap.json
//   { "explicit.stat_XXX": "EN #-패턴" }                              // 단일 변형
//   { "explicit.stat_YYY": [{ en, ko }, ...] }                        // 다중 변형(Area/Map 등) — 아이템 KR 설명으로 택1
//
// 입력 raw JSON은 **비-KR 환경(VPN 등)**에서 curl로 1회 받아둔다 (EN=pathofexile.com은 KR IP geo-block):
//   curl -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" https://www.pathofexile.com/api/trade2/data/stats -o en-stats.json
//   curl -A "Mozilla/5.0"                                https://poe.kakaogames.com/api/trade2/data/stats  -o kr-stats.json
// (Node fetch는 Cloudflare 봇차단에 걸려 curl 사용.) KR·EN 모두 그룹·순서 동일(8202개)해 인덱스로 페어링.
//
// 실행: node scripts/build-pob-statmap.mjs <en-stats.json> <kr-stats.json> [출력파일명=pobStatMap.json]
//   poe1: node scripts/build-pob-statmap.mjs en-stats1.json kr-stats1.json pobStatMap.poe1.json
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const [, , enPath, krPath, outName = 'pobStatMap.json'] = process.argv
if (!enPath || !krPath) { console.error('사용법: node scripts/build-pob-statmap.mjs <en-stats.json> <kr-stats.json> [출력파일명]'); process.exit(1) }
const SKIP_TYPES = new Set(['pseudo']) // 검색 집계용 — 실제 아이템 mod 아님
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', outName)

const en = JSON.parse(await readFile(enPath, 'utf8'))
const kr = JSON.parse(await readFile(krPath, 'utf8'))

// 그룹 내 "같은 id의 k번째 등장"끼리 페어링 — 단순 인덱스 페어링은 EN/KR 엔트리 수가 1개라도 어긋나면
// (예: poe1 enchant EN 1465 vs KR 1464) 그 지점부터 전부 오염되므로 id 시퀀스 기준으로 맞춘다.
const byId = new Map() // 전체 id → [{en, ko}] (같은 id의 변형 순서 보존)
let unpaired = 0
for (const g of en.result) {
  if (SKIP_TYPES.has(g.id)) continue
  const krG = (kr.result || []).find((x) => x.id === g.id)
  const krSeq = new Map() // id → 그룹 내 등장 순서 배열
  for (const e of krG?.entries || []) { if (!krSeq.has(e.id)) krSeq.set(e.id, []); krSeq.get(e.id).push(e) }
  const seen = new Map()
  for (const e of g.entries) {
    const k = seen.get(e.id) || 0; seen.set(e.id, k + 1)
    const krE = krSeq.get(e.id)?.[k]
    if (!krE) unpaired++
    if (!byId.has(e.id)) byId.set(e.id, [])
    byId.get(e.id).push({ en: e.text, ko: krE?.text ?? null })
  }
}

const map = {}
for (const [id, variants] of byId) {
  const uniqEn = [...new Set(variants.map((v) => v.en))]
  map[id] = uniqEn.length === 1 ? uniqEn[0] : variants // 단일 → 문자열, 다중 → [{en,ko}]
}

await writeFile(out, JSON.stringify(map), 'utf8')
const multi = Object.values(map).filter(Array.isArray).length
console.log(`${outName} 생성: ${Object.keys(map).length} ids (다중변형 ${multi}, KR 미페어링 ${unpaired}) → ${out}`)
