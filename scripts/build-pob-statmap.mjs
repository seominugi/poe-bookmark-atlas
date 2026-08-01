// PoB 영문 stat 맵 생성 — trade2 data/stats(EN+KR)를 stat id로 위치 페어링 → src/lib/pobStatMap.json
//   { "explicit.stat_XXX": "EN #-패턴" }                              // 단일 변형
//   { "explicit.stat_YYY": [{ en, ko }, ...] }                        // 다중 변형(Area/Map 등) — 아이템 KR 설명으로 택1
//
// 입력 raw JSON은 curl로 1회 받아둔다. **EN도 KR IP에서 그대로 받힌다**(2026-08-02 확인 — geo-redirect는
// 거래소 *사이트*이지 data API가 아니다. 예전 주석의 "VPN 필요"는 낡은 정보):
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

// 기존 맵 병합 — stats API는 '지금 검색 가능한' mod만 준다. 삭제된 리그 mod를 단 레거시 아이템은 계속
// 거래되므로, 새 데이터에 없는 기존 항목은 남긴다(사전은 누적, 같은 id는 항상 새 데이터가 승).
// 단 옵션형(id|N)으로 쪼개진 구 통합 id는 버린다 — 그 템플릿의 #는 숫자가 아니라 옵션 텍스트 자리라
// (예: "Added Small Passive Skills grant: #") 값 치환이 엉뚱한 숫자를 밀어 넣는다.
let prev = {}
try { prev = JSON.parse(await readFile(out, 'utf8')) } catch { /* 최초 생성 */ }
const optBase = new Set(Object.keys(map).filter((k) => k.includes('|')).map((k) => k.split('|')[0]))
let kept = 0
for (const [id, v] of Object.entries(prev)) {
  if (id in map || optBase.has(id)) continue
  map[id] = v
  kept++
}

await writeFile(out, JSON.stringify(map), 'utf8')
const multi = Object.values(map).filter(Array.isArray).length
console.log(`${outName} 생성: ${Object.keys(map).length} ids (다중변형 ${multi}, KR 미페어링 ${unpaired}, 레거시 유지 ${kept}) → ${out}`)
