// 유니크 mod 폴백 사전 생성 — { "<KR 원문 정규화 키>": "<EN #-템플릿>" } → src/lib/pobUniqueModMap.json
//
// 왜 필요한가: 거래소 stat id가 아이템 실제 문구와 1:1이 아니다. 유니크 전용 문구는 검색 항목이 따로 없고
// 성격이 비슷한 다른 stat에 얹혀 있다 — 예) 하늘의 편린 "물리 피해 없음"의 hash는
// explicit.stat_1509134228("물리 피해 #% 증가")이라 채울 값이 없어 pobStatMap 경로가 실패한다.
// 그런 줄만 KR 원문으로 한 번 더 찾도록, poe-i18n 유니크 데이터의 EN/KR 쌍에서 사전을 만든다.
//
// ⚠ poe-i18n 유니크 데이터는 EN/KR 배열을 **위치로** 짝지어서, 어긋난 항목이 있다
//   (실측: 거래소 stats와 교차검증 시 poe1 97.4% / poe2 95.3% 일치.
//    예) the-sentry는 KR "물리 피해 없음"에 EN "Adds (25 — 32) to (40 — 50) Fire Damage"가 붙어 있다).
//   틀린 영문은 한글로 남는 것보다 나쁘므로(PoB가 그대로 읽어 빌드 수치가 바뀐다) 3중 필터를 건다:
//     ① 아이템 단위 신뢰 판정 — 거래소 기준표와 어긋나는 줄이 하나라도 있으면 그 아이템 전체 폐기
//        (정렬이 어긋나면 배열 전체가 밀리므로, 흔한 mod 한 줄만 걸려도 그 아이템이 통째로 잡힌다)
//     ② 같은 KR 키에 서로 다른 EN이 오면 양쪽 다 폐기(판별 불가)
//     ③ KR의 값 개수 ≠ EN의 # 개수면 폐기
//   그래도 교차검증이 불가능한 잔여 오류는 남는다 → 제보로 확인된 건 overrides 파일로 덮는다(항상 승).
//
// 실행: node scripts/build-pob-modmap.mjs <poe-i18n루트> <en-stats.json> <kr-stats.json> [출력명] [overrides.json]
//   poe1: node scripts/build-pob-modmap.mjs .../poe1/json en-stats1.json kr-stats1.json pobUniqueModMap.poe1.json scripts/pob-mod-overrides.poe1.json
//   poe2: node scripts/build-pob-modmap.mjs .../poe2/json en-stats2.json kr-stats2.json
// (stats 원본 받는 법은 build-pob-statmap.mjs 헤더 참조 — EN도 KR IP에서 그대로 받힌다.)
import { readFile, writeFile } from 'node:fs/promises'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripTags, normKo } from '../src/lib/pobExport.js'

const [, , i18nRoot, enPath, krPath, outName = 'pobUniqueModMap.json', ovPath = 'scripts/pob-mod-overrides.json'] = process.argv
if (!i18nRoot || !enPath || !krPath) {
  console.error('사용법: node scripts/build-pob-modmap.mjs <poe-i18n루트> <en-stats.json> <kr-stats.json> [출력명] [overrides.json]')
  process.exit(1)
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', outName)

// EN 쪽도 값 자리를 #로 — 사전 값은 fillValues가 채울 템플릿이어야 한다
const EN_VALUE_RANGE = /\(\s*-?\d+(?:\.\d+)?\s*[—–]\s*-?\d+(?:\.\d+)?\s*\)/g
const enTemplate = (s) => stripTags(s).replace(EN_VALUE_RANGE, '#').replace(/-?\d+(?:\.\d+)?/g, '#')
const squash = (s) => String(s).replace(/\s+/g, '')

// ── 거래소 기준표: KR 정규화 키 → EN 템플릿(공백 제거) ──
const en = JSON.parse(await readFile(enPath, 'utf8'))
const kr = JSON.parse(await readFile(krPath, 'utf8'))
const enById = new Map()
for (const g of en.result) for (const e of g.entries) if (!enById.has(e.id)) enById.set(e.id, e.text)
const ref = new Map()
for (const g of kr.result) {
  if (g.id === 'pseudo') continue
  for (const e of g.entries) {
    const v = enTemplate(enById.get(e.id) || '').replace(/\s*\((?:Local|Global)\)\s*$/, '')
    const k = normKo(e.text)
    if (v && k && !ref.has(k)) ref.set(k, squash(v))
  }
}

// ── poe-i18n 유니크 데이터 수집(아이템 단위) ──
const files = []
;(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.json')) files.push(p)
  }
})(join(i18nRoot, 'unique'))

const items = []
for (const p of files) {
  let arr
  try { arr = JSON.parse(await readFile(p, 'utf8')) } catch { continue }
  if (!Array.isArray(arr)) continue
  for (const it of arr) {
    const lines = []
    for (const key of ['implicits', 'explicits']) {
      const e = it[key]?.en, r = it[key]?.kr
      if (!Array.isArray(e) || !Array.isArray(r) || e.length !== r.length) continue // 길이부터 어긋나면 짝을 못 믿는다
      for (let i = 0; i < e.length; i++) { const k = normKo(r[i]); if (k) lines.push([k, enTemplate(e[i])]) }
    }
    if (lines.length) items.push({ id: it.id, lines })
  }
}

// ── ① 아이템 단위 신뢰 판정 ──
const trusted = items.filter((it) => !it.lines.some(([k, v]) => ref.has(k) && ref.get(k) !== squash(v)))

// ── ② 충돌 제거 → ③ 거래소가 이미 해결하는 키·값 개수 불일치 제거 ──
const map = {}
const collided = new Set()
for (const it of trusted) for (const [k, v] of it.lines) { if (map[k] && map[k] !== v) collided.add(k); map[k] = v }
for (const k of collided) delete map[k]
let known = 0, arity = 0
for (const k of Object.keys(map)) {
  if (ref.has(k)) { known++; delete map[k]; continue } // stat id 경로가 이미 해결 — 폴백에 둘 이유가 없다
  if ((k.match(/#/g) || []).length !== (map[k].match(/#/g) || []).length) { arity++; delete map[k] }
}

// ── overrides 병합(항상 승) — 제보로 확인된 수동 정정 ──
let ov = {}
if (existsSync(ovPath)) ov = JSON.parse(await readFile(ovPath, 'utf8'))
const ovKeys = Object.keys(ov)
Object.assign(map, ov)

await writeFile(out, JSON.stringify(map), 'utf8')
console.log(`${outName} 생성: ${Object.keys(map).length} 키 (유니크 ${items.length} → 신뢰 ${trusted.length}`
  + `, 충돌 ${collided.size} / 거래소중복 ${known} / 값개수불일치 ${arity} 제외, overrides ${ovKeys.length}) → ${out}`)
