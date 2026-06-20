# 북마크 아틀라스 (poe-bookmark-atlas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POE 거래소(`poe.kakaogames.com`, POE1·POE2) 검색을 북마크·히스토리로 저장하고, 저장 시점 시세 스냅샷(div·ex)을 함께 보여주는 MV3 크롬 확장을 만든다.

**Architecture:** content script가 페이지의 거래 검색 네트워크 요청을 MAIN world에서 가로채 쿼리를 추출 → 순수 로직 모듈(searchParser/priceSnapshot/currencyRates)이 사람이 읽는 기록 + 시세 스냅샷을 만들고 → `chrome.storage.local`에 저장 → Shadow DOM 우측 도킹 패널이 렌더한다. 가격 산출은 백엔드 `smng-poe-pricer`의 `compute_sellable_price`(동적 하위절사 + P25)를 JS로 포팅해 economy 사이트와 값을 일치시킨다.

**Tech Stack:** Vanilla JS(ESM, JSDoc 타입) · Vite + `@crxjs/vite-plugin`(MV3 빌드) · Vitest(단위 테스트). 모두 MIT/OSS(전역 §17 충족). TypeScript 미사용(단순성), 타입은 JSDoc로 표기.

> **설계 문서**: [`docs/superpowers/specs/2026-06-20-poe-bookmark-atlas-design.md`](../specs/2026-06-20-poe-bookmark-atlas-design.md)
> **계획 검토 시 확인할 큰 결정**: ① 빌드 도구로 Vite+CRXJS 채택(대안: 무빌드 vanilla — 더 단순하나 ESM 번들·MAIN world 처리를 수동으로). ② 스탯 이름은 GGG 공식 `/api/trade(2)/data/stats`(한국 사이트라 한글 로컬라이즈됨)를 사용 — 스펙 §14의 "Naratmalssami 재사용"을 더 정확한 공식 소스로 정제.

---

## File Structure

```
poe-bookmark-atlas/
├─ manifest.json                # MV3 매니페스트 (CRXJS가 가공)
├─ package.json                 # vite, @crxjs/vite-plugin, vitest
├─ vite.config.js               # Vite + CRXJS 설정
├─ vitest.config.js             # 테스트 설정 + chrome 목 셋업
├─ test/
│  ├─ setup.js                  # globalThis.chrome 스텁
│  ├─ fixtures/
│  │  ├─ poe2-search-query.json # 실제 캡처한 trade2 검색 쿼리 payload
│  │  └─ poe2-stats.json        # /api/trade2/data/stats 응답 일부
│  ├─ formatPrice.test.js
│  ├─ priceSnapshot.test.js
│  ├─ currencyRates.test.js
│  ├─ searchParser.test.js
│  ├─ statMap.test.js
│  └─ store.test.js
├─ src/
│  ├─ lib/                      # 순수 로직 (단위 테스트 대상, chrome API 의존 없음)
│  │  ├─ types.js               # JSDoc typedef (SearchRecord 등)
│  │  ├─ formatPrice.js         # 디바인값 → "≈ X div" / "≈ N ex"
│  │  ├─ priceSnapshot.js       # listings → sellable_price (compute_sellable_price 포팅)
│  │  ├─ currencyRates.js       # exchange_rates 파싱 + toExalted/toDivine
│  │  ├─ searchParser.js        # trade 쿼리 JSON → 기록 필드(title/stats/league/game)
│  │  └─ statMap.js             # stat id → 한글 텍스트 (trade stats 데이터 기반)
│  ├─ store/
│  │  └─ store.js               # chrome.storage.local CRUD (SearchRecord[])
│  ├─ background/
│  │  └─ service-worker.js      # 외부 fetch(환율·stats) 프록시, 메시지 라우팅
│  ├─ content/
│  │  ├─ page-bridge.js         # MAIN world: fetch/XHR 가로채기 → postMessage
│  │  ├─ content-main.js        # ISOLATED: 캡처 수신→기록 생성→저장, 패널 마운트
│  │  └─ panel/
│  │     ├─ panel.js            # Shadow DOM 패널: 도킹·접기·탭·렌더·상호작용
│  │     └─ panel.css           # 패널 스타일 (?inline 임포트→shadow root 주입)
│  └─ icons/  (icon16.png, icon48.png, icon128.png)
├─ README.md  LICENSE  .gitignore   (이미 존재)
```

**경계 원칙**: `src/lib/*`는 chrome·DOM에 의존하지 않는 순수 함수(테스트 용이). chrome API 접촉은 `store`·`background`·`content`에만. 패널 UI는 Shadow DOM에 캡슐화.

---

## Phase 0 — 스캐폴드 & 빌드

### Task 1: 프로젝트 셋업 (Vite + CRXJS + Vitest)

**Files:**
- Create: `package.json`, `vite.config.js`, `vitest.config.js`, `test/setup.js`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "poe-bookmark-atlas",
  "version": "0.1.0",
  "description": "POE 거래소 검색 북마크 + 히스토리 관리 크롬 확장",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `cd D:/github/poe-bookmark-atlas && npm install`
Expected: `node_modules/` 생성, lockfile 작성, 에러 없음.

- [ ] **Step 3: vite.config.js + vitest.config.js 작성**

```js
// vite.config.js
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' assert { type: 'json' }

export default defineConfig({
  plugins: [crx({ manifest })],
  build: { target: 'esnext' },
})
```

```js
// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
  },
})
```

- [ ] **Step 4: test/setup.js — chrome 스텁**

```js
// 최소 chrome.storage.local 인메모리 목 (store 테스트용)
const mem = new Map()
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (keys == null) return Object.fromEntries(mem)
        const k = Array.isArray(keys) ? keys : [keys]
        const out = {}
        for (const key of k) if (mem.has(key)) out[key] = mem.get(key)
        return out
      },
      async set(obj) { for (const [k, v] of Object.entries(obj)) mem.set(k, v) },
      async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => mem.delete(k)) },
      async clear() { mem.clear() },
    },
  },
  runtime: { sendMessage: async () => ({}), onMessage: { addListener() {} } },
}
globalThis.__resetChromeMock = () => mem.clear()
```

- [ ] **Step 5: 빈 테스트로 하네스 확인**

Create `test/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest'
describe('harness', () => { it('runs', () => { expect(1 + 1).toBe(2) }) })
```
Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.js vitest.config.js test/setup.js test/smoke.test.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "chore: Vite+CRXJS+Vitest 스캐폴드"
```

---

### Task 2: MV3 manifest + 트레이드 페이지 주입 확인

**Files:**
- Create: `manifest.json`, `src/content/content-main.js`(임시), `src/background/service-worker.js`(임시), `src/icons/*`

- [ ] **Step 1: manifest.json 작성**

```json
{
  "manifest_version": 3,
  "name": "북마크 아틀라스",
  "version": "0.1.0",
  "description": "POE 거래소 검색 북마크 + 히스토리 관리 — 시세 스냅샷 포함",
  "icons": { "16": "src/icons/icon16.png", "48": "src/icons/icon48.png", "128": "src/icons/icon128.png" },
  "permissions": ["storage"],
  "host_permissions": [
    "https://poe.kakaogames.com/*",
    "https://seominugi.com/*"
  ],
  "background": { "service_worker": "src/background/service-worker.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["https://poe.kakaogames.com/trade/*", "https://poe.kakaogames.com/trade2/*"],
      "js": ["src/content/content-main.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: 임시 content/background 작성 (주입 확인용)**

```js
// src/content/content-main.js
console.log('[북마크 아틀라스] content script loaded on', location.href)
```
```js
// src/background/service-worker.js
console.log('[북마크 아틀라스] service worker started')
```

- [ ] **Step 3: 아이콘 자리표시 추가**

16/48/128 PNG를 `src/icons/`에 둔다(임시 단색 아이콘 가능). 없으면 manifest의 `icons`·`action` 경고가 나므로 최소 파일 필요.

- [ ] **Step 4: 빌드 후 unpacked 로드 — 수동 검증**

Run: `npm run build`
Expected: `dist/` 생성.
수동: 크롬 `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `dist/` 선택 → `poe.kakaogames.com/trade2/...` 접속 → DevTools 콘솔에 `[북마크 아틀라스] content script loaded` 출력 확인. service worker 콘솔에 시작 로그 확인.

- [ ] **Step 5: Commit**

```bash
git add manifest.json src/content/content-main.js src/background/service-worker.js src/icons
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: MV3 manifest + 트레이드 페이지 content script 주입"
```

---

## Phase 1 — 순수 로직 (TDD)

### Task 3: formatPrice (디바인값 → div·ex 표시)

**규칙(스펙 §7)**: `value ≥ 1 div` → `≈ X.X div`; `< 1 div` → `≈ N ex`(= valueDiv × exaltedPerDivine). div·ex 외 단위 없음.

**Files:** Create `src/lib/formatPrice.js`, `test/formatPrice.test.js`

- [ ] **Step 1: 실패 테스트 작성**

```js
// test/formatPrice.test.js
import { describe, it, expect } from 'vitest'
import { formatPrice } from '../src/lib/formatPrice.js'

describe('formatPrice', () => {
  it('1 div 이상은 div로 표시', () => {
    expect(formatPrice({ valueDiv: 2.34, exaltedPerDivine: 200 })).toBe('≈ 2.3 div')
  })
  it('정확히 1 div는 div', () => {
    expect(formatPrice({ valueDiv: 1, exaltedPerDivine: 200 })).toBe('≈ 1 div')
  })
  it('1 div 미만은 ex로 환산 표시', () => {
    // 0.4 div × 200 = 80 ex
    expect(formatPrice({ valueDiv: 0.4, exaltedPerDivine: 200 })).toBe('≈ 80 ex')
  })
  it('환율 폴백: 이미 단위가 정해진 경우 그대로', () => {
    expect(formatPrice({ value: 55, unit: 'exalted' })).toBe('≈ 55 ex')
    expect(formatPrice({ value: 3.2, unit: 'divine' })).toBe('≈ 3.2 div')
  })
  it('값 없으면 빈 문자열', () => {
    expect(formatPrice({})).toBe('')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/formatPrice.test.js`
Expected: FAIL (`formatPrice is not a function`).

- [ ] **Step 3: 구현**

```js
// src/lib/formatPrice.js
const UNIT_LABEL = { divine: 'div', exalted: 'ex' }

/** 소수 정리: 정수는 그대로, 아니면 1자리 반올림 후 trailing zero 제거 */
function trim(n) {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 10) / 10)
}

/**
 * @param {{valueDiv?:number, exaltedPerDivine?:number, value?:number, unit?:'divine'|'exalted'}} p
 * @returns {string} "≈ 2.3 div" | "≈ 80 ex" | ''
 */
export function formatPrice(p) {
  // 폴백 경로: 단위가 고정된 값
  if (typeof p.value === 'number' && p.unit && UNIT_LABEL[p.unit]) {
    return `≈ ${trim(p.value)} ${UNIT_LABEL[p.unit]}`
  }
  // 기본 경로: 디바인값 + 환율로 div/ex 선택
  if (typeof p.valueDiv === 'number' && p.valueDiv > 0) {
    if (p.valueDiv >= 1) return `≈ ${trim(p.valueDiv)} div`
    if (p.exaltedPerDivine > 0) return `≈ ${trim(p.valueDiv * p.exaltedPerDivine)} ex`
    return `≈ ${trim(p.valueDiv)} div`
  }
  return ''
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run test/formatPrice.test.js`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/formatPrice.js test/formatPrice.test.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: formatPrice (div·ex 표시 단위)"
```

---

### Task 4: priceSnapshot (compute_sellable_price 포팅)

**근거**: `smng-poe-pricer/src/jobs/summarize/summarize_poe2_trade_prices.py`의 `compute_sellable_price`·`_quartiles`·`_to_exalted`·`_dominant_currency`를 충실히 포팅. 입력은 listings `[{amount, currency}]`와 `exaltedPerDivine`.

**Files:** Create `src/lib/priceSnapshot.js`, `test/priceSnapshot.test.js`

- [ ] **Step 1: 실패 테스트 작성**

```js
// test/priceSnapshot.test.js
import { describe, it, expect } from 'vitest'
import { quartiles, computeSellable, priceSnapshot } from '../src/lib/priceSnapshot.js'

describe('quartiles (inclusive, _quartiles 포팅)', () => {
  it('4개 이상은 선형보간 분위', () => {
    // [1,2,3,4,5] → Q1=2, Q2=3, Q3=4
    expect(quartiles([1, 2, 3, 4, 5])).toEqual([2, 3, 4])
  })
  it('4개 미만은 (min, median, max)', () => {
    expect(quartiles([10, 20, 30])).toEqual([10, 20, 30])
    expect(quartiles([10, 20])).toEqual([10, 15, 20])
  })
})

describe('computeSellable (compute_sellable_price 포팅)', () => {
  it('4개 이상: 하위 max(1,10%) 절사 후 P25', () => {
    // n=10 → trim 1, working=[2..11], P25 of working
    const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const r = computeSellable(prices)
    expect(r.sampleN).toBe(10)
    expect(r.lowestAsk).toBe(1)
    // working=[2..10](9개), Q1=linearQuantile@0.25 → 4
    expect(r.sellable).toBe(4)
  })
  it('극단 허위 1개는 절사+P25로 방어', () => {
    const prices = [0.01, 9, 9.5, 10, 10, 10.5, 11, 11, 12, 13]
    const r = computeSellable(prices)
    expect(r.sellable).toBeGreaterThan(9) // 0.01에 안 끌려감
  })
  it('4개 미만은 절사 없이 P50', () => {
    expect(computeSellable([5, 7, 9]).sellable).toBe(7)
  })
  it('빈 입력은 0', () => {
    expect(computeSellable([]).sampleN).toBe(0)
  })
})

describe('priceSnapshot (div·ex만, exalted 피벗)', () => {
  const rates = { exaltedPerDivine: 200 }
  it('div/ex listings를 exalted로 환산 후 sellable 계산, 디바인값 반환', () => {
    // 8개 divine listings(1.0 each → 200ex) → sellable 200ex → 1.0 div
    const listings = Array.from({ length: 8 }, () => ({ amount: 1, currency: 'divine' }))
    const snap = priceSnapshot(listings, rates)
    expect(snap.unit).toBe('divine')
    expect(snap.valueDiv).toBeCloseTo(1.0, 3)
    expect(snap.sampleN).toBe(8)
  })
  it('chaos 등 div/ex 외 통화는 제외', () => {
    const listings = [
      ...Array.from({ length: 5 }, () => ({ amount: 100, currency: 'chaos' })),
      ...Array.from({ length: 5 }, () => ({ amount: 2, currency: 'divine' })),
    ]
    const snap = priceSnapshot(listings, rates)
    expect(snap.sampleN).toBe(5) // divine 5개만
  })
  it('환율 없으면(폴백) 최빈 단위 한 종류로 산출', () => {
    const listings = Array.from({ length: 6 }, () => ({ amount: 40, currency: 'exalted' }))
    const snap = priceSnapshot(listings, { exaltedPerDivine: 0 })
    expect(snap.unit).toBe('exalted')
    expect(snap.value).toBe(40) // 동일값 P25=40
  })
  it('표본 0이면 null', () => {
    expect(priceSnapshot([{ amount: 5, currency: 'chaos' }], rates)).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/priceSnapshot.test.js`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현**

```js
// src/lib/priceSnapshot.js
const round4 = (n) => Math.round(n * 1e4) / 1e4

/** _linear_quantile (inclusive) */
function linearQuantile(sorted, q) {
  if (sorted.length === 1) return sorted[0]
  if (q <= 0) return sorted[0]
  if (q >= 1) return sorted[sorted.length - 1]
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** _quartiles 포팅: 정렬된 입력 가정 X — 내부 정렬 */
export function quartiles(values) {
  const s = [...values].sort((a, b) => a - b)
  if (s.length >= 4) return [linearQuantile(s, 0.25), linearQuantile(s, 0.5), linearQuantile(s, 0.75)]
  const mid = Math.floor(s.length / 2)
  const p50 = s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
  return [s[0], p50, s[s.length - 1]]
}

/** compute_sellable_price 포팅. @returns {{lowestAsk,sellable,p25,p50,p75,trimmedMean,sampleN}} */
export function computeSellable(prices) {
  const valid = prices.filter((p) => p > 0 && Number.isFinite(p)).sort((a, b) => a - b)
  if (valid.length === 0) return { lowestAsk: 0, sellable: 0, p25: 0, p50: 0, p75: 0, trimmedMean: 0, sampleN: 0 }
  let working = valid
  if (valid.length >= 4) working = valid.slice(Math.max(1, Math.floor(valid.length * 0.1)))
  if (working.length === 0) working = valid
  const [p25, p50, p75] = quartiles(working)
  const sellable = valid.length >= 4 ? p25 : p50
  const trimmedMean = working.reduce((a, b) => a + b, 0) / working.length
  return { lowestAsk: round4(valid[0]), sellable: round4(sellable), p25: round4(p25), p50: round4(p50), p75: round4(p75), trimmedMean: round4(trimmedMean), sampleN: valid.length }
}

/** _to_exalted 포팅: exalted/divine만 지원 */
function toExalted(amount, currency, exaltedPerDivine) {
  if (!(amount > 0)) return null
  const c = String(currency || '').toLowerCase()
  if (c === 'exalted') return amount
  if (c === 'divine' && exaltedPerDivine > 0) return amount * exaltedPerDivine
  return null
}

/** _dominant_currency 포팅 (ex 우선) */
function dominantUnit(listings) {
  const counts = { exalted: 0, divine: 0 }
  for (const l of listings) {
    const c = String(l.currency || '').toLowerCase()
    if (c === 'exalted' || c === 'divine') counts[c] += 1
  }
  if (counts.exalted === 0 && counts.divine === 0) return null
  if (counts.exalted >= counts.divine) return 'exalted'
  return 'divine'
}

/**
 * listings → 시세 스냅샷. div·ex만 사용.
 * @param {{amount:number,currency:string}[]} listings
 * @param {{exaltedPerDivine:number}} rates
 * @returns {null | {value:number, unit:'divine'|'exalted', valueDiv?:number, lowestAsk:number, sampleN:number, method:string, capturedAt:number}}
 */
export function priceSnapshot(listings, rates) {
  const epd = rates?.exaltedPerDivine || 0
  const now = Date.now()

  if (epd > 0) {
    // 정상 경로: 전부 exalted로 환산 → sellable(exalted) → 디바인 값
    const exalted = listings.map((l) => toExalted(l.amount, l.currency, epd)).filter((v) => v != null)
    if (exalted.length === 0) return null
    const r = computeSellable(exalted)
    const valueDiv = round4(r.sellable / epd)
    return {
      valueDiv,
      value: valueDiv,
      unit: 'divine', // 표시 단위는 formatPrice가 valueDiv 크기로 div/ex 결정
      lowestAsk: round4(r.lowestAsk / epd),
      sampleN: r.sampleN,
      method: 'sellable_p25',
      capturedAt: now,
    }
  }

  // 폴백: 환율 없음 → div/ex 중 최빈 한 단위만, 그 단위 그대로
  const unit = dominantUnit(listings)
  if (!unit) return null
  const same = listings.filter((l) => String(l.currency || '').toLowerCase() === unit).map((l) => l.amount)
  const r = computeSellable(same)
  if (r.sampleN === 0) return null
  return { value: r.sellable, unit, lowestAsk: r.lowestAsk, sampleN: r.sampleN, method: 'sellable_p25_fallback', capturedAt: now }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run test/priceSnapshot.test.js`
Expected: PASS.

> 주: `priceSnapshot` 정상 경로는 `unit:'divine'` + `valueDiv`를 돌려주고, 실제 div/ex 선택은 `formatPrice`가 크기로 판단(스펙 §7-5). 폴백 경로만 단위를 직접 고정한다.

- [ ] **Step 5: Commit**

```bash
git add src/lib/priceSnapshot.js test/priceSnapshot.test.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: priceSnapshot (compute_sellable_price 포팅, 동적절사+P25)"
```

---

### Task 5: currencyRates (환율 파싱·캐시)

**소스(스펙 §8)**: `GET /api/{poe1|poe2}/currency-exchange?realmName=<리그>` 응답의 `exchange_rates.exalted_per_divine.price`. 실제 호출은 service worker(Task 9)가 하고, 이 모듈은 **파싱·캐시 순수 로직**만 담당.

**Files:** Create `src/lib/currencyRates.js`, `test/currencyRates.test.js`

- [ ] **Step 1: 실패 테스트**

```js
// test/currencyRates.test.js
import { describe, it, expect } from 'vitest'
import { parseExaltedPerDivine, RatesCache } from '../src/lib/currencyRates.js'

describe('parseExaltedPerDivine', () => {
  it('exchange_rates에서 가격 추출', () => {
    const payload = { exchange_rates: { exalted_per_divine: { price: 215 } } }
    expect(parseExaltedPerDivine(payload)).toBe(215)
  })
  it('없으면 null', () => {
    expect(parseExaltedPerDivine({})).toBeNull()
    expect(parseExaltedPerDivine({ exchange_rates: {} })).toBeNull()
  })
})

describe('RatesCache (리그별, TTL)', () => {
  it('TTL 내 동일 리그는 캐시 반환', () => {
    let now = 1000
    const cache = new RatesCache(5000, () => now)
    cache.set('poe2:Standard', 200)
    now = 4000
    expect(cache.get('poe2:Standard')).toBe(200)
    now = 7000
    expect(cache.get('poe2:Standard')).toBeNull() // 만료
  })
  it('리그가 다르면 분리', () => {
    const cache = new RatesCache(5000, () => 0)
    cache.set('poe2:Standard', 200)
    expect(cache.get('poe2:Hardcore')).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/currencyRates.test.js` → FAIL.

- [ ] **Step 3: 구현**

```js
// src/lib/currencyRates.js
/** @param {any} payload @returns {number|null} */
export function parseExaltedPerDivine(payload) {
  const price = payload?.exchange_rates?.exalted_per_divine?.price
  return typeof price === 'number' && price > 0 ? price : null
}

/** 리그별 환율 캐시 (TTL ms). now() 주입으로 테스트 가능. */
export class RatesCache {
  constructor(ttlMs = 5 * 60 * 1000, now = () => Date.now()) {
    this.ttl = ttlMs
    this.now = now
    this.map = new Map() // key -> {value, at}
  }
  set(key, value) { this.map.set(key, { value, at: this.now() }) }
  get(key) {
    const e = this.map.get(key)
    if (!e) return null
    if (this.now() - e.at > this.ttl) { this.map.delete(key); return null }
    return e.value
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run test/currencyRates.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/currencyRates.js test/currencyRates.test.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: currencyRates 파싱·리그별 캐시"
```

---

### Task 6: searchParser (쿼리 JSON → 기록 필드)

**입력**: 캡처한 trade 검색 요청 바디(JSON). POE trade2 쿼리 형태:
```json
{ "query": { "status": {"option":"online"}, "type": "...", "name": "...",
  "stats": [{"type":"and","filters":[{"id":"explicit.stat_3299347043","value":{"min":80}}]}],
  "filters": {"trade_filters":{"filters":{"price":{"min":null,"max":3,"option":"divine"}}}} },
  "sort": {"price":"asc"} }
```
**출력**: `{ title, itemType, name, stats: string[], priceFilter, sortIsPriceAsc }`. stat id→텍스트는 `statMap`(Task 7) 주입.

**Files:** Create `src/lib/searchParser.js`, `test/searchParser.test.js`, `test/fixtures/poe2-search-query.json`

- [ ] **Step 1: 픽스처 준비**

`test/fixtures/poe2-search-query.json`에 위 형태의 실제 캡처 payload를 저장(구현 중 실제 사이트에서 1건 캡처해 교체). 최소 형태:
```json
{ "query": { "status": { "option": "online" }, "type": "Body Armour", "name": null,
  "stats": [ { "type": "and", "filters": [ { "id": "explicit.stat_life", "value": { "min": 80 } }, { "id": "explicit.stat_fire_res", "value": { "min": 30 } } ] } ],
  "filters": { "trade_filters": { "filters": { "price": { "min": null, "max": 3, "option": "divine" } } } } },
  "sort": { "price": "asc" } }
```

- [ ] **Step 2: 실패 테스트**

```js
// test/searchParser.test.js
import { describe, it, expect } from 'vitest'
import { parseSearchQuery } from '../src/lib/searchParser.js'
import fixture from './fixtures/poe2-search-query.json'

const statMap = { 'explicit.stat_life': '최대 생명', 'explicit.stat_fire_res': '화염 저항' }

describe('parseSearchQuery', () => {
  it('타입/이름으로 제목 구성', () => {
    const r = parseSearchQuery(fixture, statMap)
    expect(r.title).toBe('Body Armour')
  })
  it('스탯 id를 한글 텍스트로', () => {
    const r = parseSearchQuery(fixture, statMap)
    expect(r.stats).toEqual(['최대 생명', '화염 저항'])
  })
  it('매핑 없는 stat은 id 일부로 폴백', () => {
    const r = parseSearchQuery(fixture, {})
    expect(r.stats[0]).toContain('stat_life')
  })
  it('가격 필터 추출', () => {
    const r = parseSearchQuery(fixture, statMap)
    expect(r.priceFilter).toEqual({ min: null, max: 3, currency: 'divine' })
  })
  it('정렬이 가격 오름차순인지', () => {
    expect(parseSearchQuery(fixture, statMap).sortIsPriceAsc).toBe(true)
  })
  it('name이 있으면 제목 우선', () => {
    const q = { query: { name: 'Astramentis', type: 'Amulet', stats: [] } }
    expect(parseSearchQuery(q, statMap).title).toBe('Astramentis')
  })
})
```

- [ ] **Step 3: 실패 확인** → `npx vitest run test/searchParser.test.js` → FAIL.

- [ ] **Step 4: 구현**

```js
// src/lib/searchParser.js
/**
 * @param {any} payload 캡처한 검색 요청 바디
 * @param {Record<string,string>} statMap stat id → 텍스트
 */
export function parseSearchQuery(payload, statMap = {}) {
  const q = payload?.query ?? {}
  const name = q.name || null
  const itemType = q.type || null
  const title = name || itemType || '검색'

  const stats = []
  for (const group of q.stats ?? []) {
    for (const f of group.filters ?? []) {
      if (!f?.id) continue
      stats.push(statMap[f.id] || f.id.replace(/^explicit\./, ''))
    }
  }

  const priceRaw = q.filters?.trade_filters?.filters?.price
  const priceFilter = priceRaw
    ? { min: priceRaw.min ?? null, max: priceRaw.max ?? null, currency: priceRaw.option ?? null }
    : null

  const sortIsPriceAsc = payload?.sort?.price === 'asc'

  return { title, itemType, name, stats, priceFilter, sortIsPriceAsc }
}
```

- [ ] **Step 5: 통과 확인** → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/searchParser.js test/searchParser.test.js test/fixtures/poe2-search-query.json
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: searchParser (쿼리 JSON → 기록 필드)"
```

---

### Task 7: statMap (stat id → 한글 텍스트)

**소스 정제(스펙 §14)**: 한국 사이트의 공식 `GET /api/trade2/data/stats`(POE1은 `/api/trade/data/stats`)는 stat id→**한글 텍스트**를 이미 제공. 이 모듈은 그 응답을 `{id: text}` 맵으로 변환(순수). 실제 fetch는 service worker(Task 9).

**Files:** Create `src/lib/statMap.js`, `test/statMap.test.js`, `test/fixtures/poe2-stats.json`

- [ ] **Step 1: 픽스처** — `/api/trade2/data/stats` 응답 형태:
```json
{ "result": [ { "label": "Pseudo", "entries": [ { "id": "explicit.stat_life", "text": "최대 생명 +#" } ] },
  { "label": "Explicit", "entries": [ { "id": "explicit.stat_fire_res", "text": "화염 저항 +#%" } ] } ] }
```

- [ ] **Step 2: 실패 테스트**

```js
// test/statMap.test.js
import { describe, it, expect } from 'vitest'
import { buildStatMap } from '../src/lib/statMap.js'
import fixture from './fixtures/poe2-stats.json'

describe('buildStatMap', () => {
  it('result[].entries[]를 평탄화해 id→text', () => {
    const m = buildStatMap(fixture)
    expect(m['explicit.stat_life']).toBe('최대 생명 +#')
    expect(m['explicit.stat_fire_res']).toBe('화염 저항 +#%')
  })
  it('비정상 입력은 빈 맵', () => {
    expect(buildStatMap(null)).toEqual({})
    expect(buildStatMap({ result: 'x' })).toEqual({})
  })
})
```

- [ ] **Step 3: 실패 확인** → FAIL.

- [ ] **Step 4: 구현**

```js
// src/lib/statMap.js
/** @param {any} payload /api/trade(2)/data/stats 응답 @returns {Record<string,string>} */
export function buildStatMap(payload) {
  const map = {}
  const groups = Array.isArray(payload?.result) ? payload.result : []
  for (const g of groups) {
    for (const e of g?.entries ?? []) {
      if (e?.id && typeof e.text === 'string') map[e.id] = e.text
    }
  }
  return map
}
```

- [ ] **Step 5: 통과 확인** → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/statMap.js test/statMap.test.js test/fixtures/poe2-stats.json
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: statMap (trade stats → id→텍스트)"
```

---

## Phase 2 — 저장소 (TDD)

### Task 8: store (SearchRecord CRUD + 히스토리 캡·승격)

**규칙(스펙 §6·§9·§10)**: 단일 배열 `records` in `chrome.storage.local`. 히스토리 최근 50개·동일 쿼리 중복 제거. 북마크는 무제한. `kind` 플래그. 승격 = kind 변경.

**Files:** Create `src/store/store.js`, `test/store.test.js`

- [ ] **Step 1: 실패 테스트**

```js
// test/store.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { addHistory, listByKind, promoteToBookmark, rename, remove, HISTORY_CAP } from '../src/store/store.js'

beforeEach(() => globalThis.__resetChromeMock())

const rec = (over = {}) => ({ game: 'poe2', league: 'Standard', url: 'u', title: 't', stats: [], dedupeKey: 'k1', ...over })

describe('store', () => {
  it('히스토리 추가/조회', async () => {
    await addHistory(rec())
    const h = await listByKind('history')
    expect(h).toHaveLength(1)
    expect(h[0].kind).toBe('history')
    expect(h[0].id).toBeTruthy()
  })
  it('동일 dedupeKey는 갱신(중복 제거)', async () => {
    await addHistory(rec({ title: 'A' }))
    await addHistory(rec({ title: 'B' })) // 같은 k1
    const h = await listByKind('history')
    expect(h).toHaveLength(1)
    expect(h[0].title).toBe('B')
  })
  it(`히스토리는 ${HISTORY_CAP}개 상한`, async () => {
    for (let i = 0; i < HISTORY_CAP + 5; i++) await addHistory(rec({ dedupeKey: 'k' + i }))
    expect(await listByKind('history')).toHaveLength(HISTORY_CAP)
  })
  it('승격: history→bookmark, 이름 지정', async () => {
    const r = await addHistory(rec())
    await promoteToBookmark(r.id, '내 검색')
    expect(await listByKind('history')).toHaveLength(0)
    const b = await listByKind('bookmark')
    expect(b[0].kind).toBe('bookmark')
    expect(b[0].name).toBe('내 검색')
  })
  it('북마크는 캡 적용 안 함', async () => {
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      const r = await addHistory(rec({ dedupeKey: 'b' + i }))
      await promoteToBookmark(r.id, 'n' + i)
    }
    expect((await listByKind('bookmark')).length).toBe(HISTORY_CAP + 5)
  })
  it('이름변경/삭제', async () => {
    const r = await addHistory(rec())
    await promoteToBookmark(r.id, 'x')
    await rename(r.id, 'y')
    expect((await listByKind('bookmark'))[0].name).toBe('y')
    await remove(r.id)
    expect(await listByKind('bookmark')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 실패 확인** → FAIL.

- [ ] **Step 3: 구현**

```js
// src/store/store.js
const KEY = 'records'
export const HISTORY_CAP = 50

function uid() { return 'r_' + Math.random().toString(36).slice(2) + Date.now().toString(36) }
async function readAll() { return (await chrome.storage.local.get(KEY))[KEY] ?? [] }
async function writeAll(records) { await chrome.storage.local.set({ [KEY]: records }) }

/** 히스토리 추가(동일 dedupeKey 갱신, 50개 캡). @returns {Promise<object>} 추가/갱신된 레코드 */
export async function addHistory(rec) {
  const all = await readAll()
  const now = Date.now()
  const idx = all.findIndex((r) => r.kind === 'history' && r.dedupeKey === rec.dedupeKey)
  let record
  if (idx >= 0) {
    record = { ...all[idx], ...rec, kind: 'history', updatedAt: now }
    all.splice(idx, 1)
  } else {
    record = { ...rec, id: uid(), kind: 'history', createdAt: now, updatedAt: now }
  }
  const histories = all.filter((r) => r.kind === 'history')
  const others = all.filter((r) => r.kind !== 'history')
  const trimmed = [record, ...histories].slice(0, HISTORY_CAP)
  await writeAll([...others, ...trimmed])
  return record
}

export async function listByKind(kind) {
  return (await readAll()).filter((r) => r.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function promoteToBookmark(id, name) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (!r) return
  r.kind = 'bookmark'; r.name = name ?? r.name ?? r.title; r.updatedAt = Date.now()
  await writeAll(all)
}

export async function rename(id, name) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (r) { r.name = name; r.updatedAt = Date.now(); await writeAll(all) }
}

export async function remove(id) {
  await writeAll((await readAll()).filter((r) => r.id !== id))
}

/** 명시적 북마크 저장(현재 검색 직접 저장 시) */
export async function addBookmark(rec, name) {
  const all = await readAll()
  const now = Date.now()
  const record = { ...rec, id: uid(), kind: 'bookmark', name: name ?? rec.title, createdAt: now, updatedAt: now }
  await writeAll([...all, record])
  return record
}

/** 스냅샷 갱신(수동 "가격 갱신") */
export async function updateSnapshot(id, snapshot) {
  const all = await readAll()
  const r = all.find((x) => x.id === id)
  if (r) { r.snapshot = snapshot; r.updatedAt = Date.now(); await writeAll(all) }
}
```

- [ ] **Step 4: 통과 확인** → `npx vitest run test/store.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/store.js test/store.test.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: store (SearchRecord CRUD, 히스토리 캡·승격)"
```

---

## Phase 3 — 백그라운드 (외부 fetch 프록시)

### Task 9: service-worker (환율·stats fetch 프록시)

**역할**: content script의 cross-origin fetch(환율·stats)를 host_permissions로 대행. 메시지 `{type:'fetchRates', game, league}` / `{type:'fetchStats', game}` 처리.

**Files:** Modify `src/background/service-worker.js`

- [ ] **Step 1: 구현 (메시지 라우팅 + fetch)**

```js
// src/background/service-worker.js
const BASE = 'https://seominugi.com' // 환율 API 베이스 (운영 배포 기준 — 구현 시 1줄 확인)

async function fetchRates(game, league) {
  const url = `${BASE}/api/${game}/currency-exchange?realmName=${encodeURIComponent(league)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('rates ' + res.status)
  return res.json()
}
async function fetchStats(game) {
  const path = game === 'poe2' ? 'trade2' : 'trade'
  const res = await fetch(`https://poe.kakaogames.com/api/${path}/data/stats`)
  if (!res.ok) throw new Error('stats ' + res.status)
  return res.json()
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg.type === 'fetchRates') sendResponse({ ok: true, data: await fetchRates(msg.game, msg.league) })
      else if (msg.type === 'fetchStats') sendResponse({ ok: true, data: await fetchStats(msg.game) })
      else sendResponse({ ok: false, error: 'unknown message' })
    } catch (e) {
      sendResponse({ ok: false, error: String(e) })
    }
  })()
  return true // async 응답 유지
})
```

- [ ] **Step 2: 수동 검증** — `npm run build` 후 재로드. service worker DevTools 콘솔에서:
```js
chrome.runtime.sendMessage({type:'fetchStats', game:'poe2'}, r => console.log(r.ok, Object.keys(r.data||{})))
```
Expected: `true ['result']` (stats 응답). 환율도 `fetchRates`로 확인.

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: service-worker 환율·stats fetch 프록시"
```

> **검토 메모**: `BASE` 호스트는 운영 배포 기준 확인 후 확정(스펙 §15).

---

## Phase 4 — 캡처 통합

### Task 10: page-bridge (MAIN world 네트워크 가로채기)

**역할**: 페이지의 `fetch`/`XHR`를 후킹해 `POST …/api/trade(2)/search/…` 요청 바디·응답을 `window.postMessage`로 ISOLATED content에 전달. manifest에 MAIN world content script 추가.

**Files:** Create `src/content/page-bridge.js`; Modify `manifest.json`

- [ ] **Step 1: manifest에 MAIN world 스크립트 추가**

`content_scripts` 배열에 추가:
```json
{
  "matches": ["https://poe.kakaogames.com/trade/*", "https://poe.kakaogames.com/trade2/*"],
  "js": ["src/content/page-bridge.js"],
  "run_at": "document_start",
  "world": "MAIN"
}
```

- [ ] **Step 2: page-bridge 구현**

```js
// src/content/page-bridge.js  (MAIN world)
(() => {
  const TAG = '[BA-bridge]'
  const isSearch = (url) => /\/api\/trade2?\/search\//.test(url)
  const post = (payload) => window.postMessage({ source: 'ba-bridge', ...payload }, location.origin)

  const origFetch = window.fetch
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url
    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase()
    const res = await origFetch.apply(this, arguments)
    try {
      if (url && isSearch(url) && method === 'POST') {
        let body = init?.body
        if (typeof body === 'string') { try { body = JSON.parse(body) } catch {} }
        const data = await res.clone().json().catch(() => null)
        post({ kind: 'search', url, query: body, result: data })
      }
    } catch (e) { console.warn(TAG, e) }
    return res
  }
})()
```

- [ ] **Step 3: 수동 검증** — 빌드·재로드 후 trade2에서 검색 실행 → 페이지 콘솔에서 `window.addEventListener('message', e=>e.data?.source==='ba-bridge'&&console.log(e.data))` 로 캡처 확인(쿼리·result).

- [ ] **Step 4: Commit**

```bash
git add src/content/page-bridge.js manifest.json
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: page-bridge (MAIN world 검색 요청 가로채기)"
```

---

### Task 11: content-main (캡처 → 기록 생성 → 저장)

**역할**: bridge 메시지 수신 → statMap·searchParser로 기록 구성 → priceSnapshot(렌더된 결과 가격 + 환율) → store.addHistory. statMap·rates는 service-worker로 fetch. 결과 가격은 DOM에서 수집(헬퍼).

**Files:** Modify `src/content/content-main.js`; Create `src/content/collectPrices.js`

- [ ] **Step 1: 결과 가격 DOM 수집 헬퍼**

```js
// src/content/collectPrices.js
/**
 * 렌더된 결과의 listing 가격을 수집. 사이트 DOM에 맞춰 셀렉터 보정 필요.
 * @returns {{amount:number, currency:string}[]}
 */
export function collectListingPrices(root = document) {
  const out = []
  for (const row of root.querySelectorAll('.row .price, [data-price]')) {
    const amount = parseFloat(row.getAttribute('data-price') || row.querySelector('.amount')?.textContent || row.textContent)
    const currency = (row.querySelector('[title], img')?.getAttribute('title')
      || row.getAttribute('data-currency') || '').toLowerCase()
    if (amount > 0 && currency) out.push({ amount, currency })
  }
  return out
}
```
> 셀렉터는 실제 `poe.kakaogames.com/trade2` DOM 확인 후 1차 보정(구현 시). 통화명은 `exalted`/`divine` 정규화.

- [ ] **Step 2: content-main 구현**

```js
// src/content/content-main.js  (ISOLATED world)
import { parseSearchQuery } from '../lib/searchParser.js'
import { buildStatMap } from '../lib/statMap.js'
import { priceSnapshot } from '../lib/priceSnapshot.js'
import { parseExaltedPerDivine } from '../lib/currencyRates.js'
import { addHistory } from '../store/store.js'
import { collectListingPrices } from './collectPrices.js'
import { mountPanel } from './panel/panel.js'

const game = location.pathname.startsWith('/trade2') ? 'poe2' : 'poe1'
const leagueFromUrl = () => decodeURIComponent(location.pathname.split('/search/').pop()?.split('/')[game === 'poe2' ? 1 : 0] || 'Standard')

let statMap = {}
const send = (m) => new Promise((res) => chrome.runtime.sendMessage(m, res))

async function ensureStatMap() {
  if (Object.keys(statMap).length) return statMap
  const r = await send({ type: 'fetchStats', game })
  if (r?.ok) statMap = buildStatMap(r.data)
  return statMap
}

function dedupeKey(query) { return game + '|' + JSON.stringify(query?.query ?? {}) }

window.addEventListener('message', async (e) => {
  if (e.origin !== location.origin || e.data?.source !== 'ba-bridge' || e.data.kind !== 'search') return
  await ensureStatMap()
  const league = leagueFromUrl()
  const parsed = parseSearchQuery(e.data.query, statMap)

  // 가격 스냅샷: 렌더 직후라 약간 지연 후 DOM 수집
  let snapshot = null
  try {
    await new Promise((r) => setTimeout(r, 600))
    const listings = collectListingPrices()
    const rr = await send({ type: 'fetchRates', game, league })
    const epd = rr?.ok ? parseExaltedPerDivine(rr.data) : 0
    snapshot = priceSnapshot(listings, { exaltedPerDivine: epd || 0 })
  } catch (err) { console.warn('[BA] snapshot', err) }

  await addHistory({
    game, league, url: location.href,
    title: parsed.title, itemType: parsed.itemType, name: parsed.name,
    stats: parsed.stats, priceFilter: parsed.priceFilter,
    snapshot: snapshot || undefined,
    dedupeKey: dedupeKey(e.data.query),
  })
  document.dispatchEvent(new CustomEvent('ba:records-changed'))
})

mountPanel({ game })
```

- [ ] **Step 3: 수동 검증** — 빌드·재로드 후 trade2 검색 → `chrome.storage.local.get('records', console.log)`로 히스토리 레코드(제목·stats·snapshot) 적재 확인.

- [ ] **Step 4: Commit**

```bash
git add src/content/content-main.js src/content/collectPrices.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: content-main 캡처→기록 생성→저장"
```

---

## Phase 5 — 패널 UI (Shadow DOM)

### Task 12: 패널 셸 (도킹·접기·탭)

**Files:** Create `src/content/panel/panel.js`, `src/content/panel/panel.css`

- [ ] **Step 1: panel.css 작성** (shadow root에 주입할 스타일 — 우측 도킹·접기·탭·행). 핵심:
```css
:host { all: initial; }
.ba-root { position: fixed; top: 80px; right: 0; width: 300px; max-height: 70vh;
  display: flex; flex-direction: column; font-family: system-ui, sans-serif; font-size: 12px;
  background: #15171c; color: #cbd2dc; border: 1px solid #2c2f38; border-radius: 8px 0 0 8px;
  transform: translateX(0); transition: transform .2s; z-index: 2147483000; }
.ba-root.collapsed { transform: translateX(300px); }
.ba-handle { position: absolute; left: -22px; top: 24px; width: 22px; height: 64px;
  background: #e0b341; color: #15171c; border-radius: 6px 0 0 6px; cursor: pointer;
  writing-mode: vertical-rl; text-align: center; font-weight: 700; }
.ba-tabs { display: flex; border-bottom: 1px solid #2c2f38; }
.ba-tab { flex: 1; padding: 8px; text-align: center; cursor: pointer; color: #7e8694; }
.ba-tab.active { color: #e0b341; box-shadow: inset 0 -2px 0 #e0b341; }
.ba-list { overflow-y: auto; flex: 1; }
.ba-foot { padding: 8px; border-top: 1px solid #2c2f38; }
.ba-foot a { color: #9fd0ff; text-decoration: none; }
```

- [ ] **Step 2: panel.js — Shadow DOM 마운트 + 탭/접기**

```js
// src/content/panel/panel.js
import css from './panel.css?inline'
import { renderList } from './renderList.js'

const ECON = { poe1: 'https://seominugi.com/poe1/economy/items', poe2: 'https://seominugi.com/poe2/economy/items' }

export function mountPanel({ game }) {
  if (document.getElementById('ba-panel-host')) return
  const host = document.createElement('div')
  host.id = 'ba-panel-host'
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style'); style.textContent = css; root.appendChild(style)

  root.innerHTML += `
    <div class="ba-root collapsed" id="ba-root">
      <div class="ba-handle" id="ba-handle">🔖 북마크</div>
      <div class="ba-tabs">
        <div class="ba-tab active" data-tab="bookmark">🔖 북마크</div>
        <div class="ba-tab" data-tab="history">🕘 히스토리</div>
      </div>
      <div class="ba-list" id="ba-list"></div>
      <div class="ba-foot"><a href="${ECON[game]}" target="_blank">📊 아이템 시세 자세히 → seominugi.com ↗</a></div>
    </div>`

  const elRoot = root.getElementById('ba-root')
  root.getElementById('ba-handle').onclick = () => elRoot.classList.toggle('collapsed')

  let tab = 'bookmark'
  const tabs = root.querySelectorAll('.ba-tab')
  const refresh = () => renderList(root.getElementById('ba-list'), tab, root)
  tabs.forEach((t) => (t.onclick = () => {
    tabs.forEach((x) => x.classList.toggle('active', x === t)); tab = t.dataset.tab; refresh()
  }))
  document.addEventListener('ba:records-changed', refresh)
  refresh()
}
```

- [ ] **Step 3: 수동 검증** — 빌드·재로드 후 trade2에서 우측 핸들 클릭 → 패널 펼침/접힘, 탭 전환 동작 확인.

- [ ] **Step 4: Commit**

```bash
git add src/content/panel/panel.js src/content/panel/panel.css
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: 패널 셸 (Shadow DOM 도킹·접기·탭)"
```

---

### Task 13: 리스트 렌더 (행 스타일 C + 가격)

**Files:** Create `src/content/panel/renderList.js`

- [ ] **Step 1: 구현**

```js
// src/content/panel/renderList.js
import { listByKind } from '../../store/store.js'
import { formatPrice } from '../../lib/formatPrice.js'
import { bindRowActions } from './rowActions.js'

const fmtTime = (t) => { const d = (Date.now() - t) / 6e4; return d < 60 ? `${d | 0}분` : d < 1440 ? `${(d / 60) | 0}시간` : `${(d / 1440) | 0}일` }

export async function renderList(listEl, kind, root) {
  const records = await listByKind(kind)
  if (!records.length) { listEl.innerHTML = `<div style="padding:16px;color:#7e8694">기록이 없습니다.</div>`; return }
  listEl.innerHTML = records.map((r) => {
    const price = r.snapshot ? formatPrice(r.snapshot) : ''
    const star = kind === 'history' ? `<span class="ba-star" data-id="${r.id}" title="북마크">☆</span>` : `<span class="ba-del" data-id="${r.id}" title="삭제">🗑</span>`
    return `<div class="ba-row" data-url="${encodeURIComponent(r.url)}" style="padding:8px;border-bottom:1px solid #23262e;cursor:pointer">
      <div style="display:flex;justify-content:space-between"><span>🔖 <b style="color:#e8ecf2">${escapeHtml(r.name || r.title)}</b></span><span style="color:#e0b341">${price}</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:3px;color:#8b93a1;font-size:11px"><span>${escapeHtml((r.stats || []).slice(0, 3).join(' · '))}</span><span>${star} ${fmtTime(r.updatedAt)}</span></div>
    </div>`
  }).join('')
  bindRowActions(listEl, root, kind)
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
```

- [ ] **Step 2: 수동 검증** — 검색 몇 건 후 히스토리 탭에 행(제목·stats·가격·시간) 렌더 확인.

- [ ] **Step 3: Commit**

```bash
git add src/content/panel/renderList.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: 리스트 렌더 (행 스타일 C + 가격)"
```

---

### Task 14: 행 상호작용 (열기·승격·삭제)

**Files:** Create `src/content/panel/rowActions.js`

- [ ] **Step 1: 구현**

```js
// src/content/panel/rowActions.js
import { promoteToBookmark, remove } from '../../store/store.js'

export function bindRowActions(listEl, root, kind) {
  listEl.querySelectorAll('.ba-row').forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('.ba-star') || e.target.closest('.ba-del')) return
      location.href = decodeURIComponent(row.dataset.url) // 저장된 검색 재오픈
    }
  })
  listEl.querySelectorAll('.ba-star').forEach((s) => (s.onclick = async () => {
    const name = prompt('북마크 이름', '') ?? undefined
    await promoteToBookmark(s.dataset.id, name || undefined)
    document.dispatchEvent(new CustomEvent('ba:records-changed'))
  }))
  listEl.querySelectorAll('.ba-del').forEach((d) => (d.onclick = async () => {
    await remove(d.dataset.id)
    document.dispatchEvent(new CustomEvent('ba:records-changed'))
  }))
}
```

- [ ] **Step 2: 수동 검증** — 히스토리 행 ☆ → 이름 입력 → 북마크 탭 이동 확인. 행 클릭 → 저장 URL로 재검색. 북마크 🗑 삭제 확인.

- [ ] **Step 3: Commit**

```bash
git add src/content/panel/rowActions.js
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "feat: 행 상호작용 (열기·승격·삭제)"
```

---

## Phase 6 — 마무리 & 패키징

### Task 15: 아이콘·스토어 메타·빌드 검증

**Files:** `src/icons/*`(정식 아이콘), `manifest.json`(action 추가), 빌드 산출물

- [ ] **Step 1: action(툴바) 추가** — manifest에:
```json
"action": { "default_title": "북마크 아틀라스" }
```

- [ ] **Step 2: 정식 아이콘 3종 교체** (16/48/128, 아틀라스 패밀리 톤).

- [ ] **Step 3: 전체 단위 테스트** — Run: `npm test` → Expected: 모든 스위트 PASS.

- [ ] **Step 4: 수동 E2E 체크리스트** (POE1·POE2 각각):
  - 검색 → 히스토리 적재(제목·stats·가격 스냅샷)
  - 가격이 div·ex로만 표시(≥1div→div, <1div→ex)
  - ☆ 승격·이름변경·삭제·행 클릭 재검색
  - 패널 접기/펼치기·탭 전환
  - 경제 링크 이동
  - 환율 실패 상황(오프라인) 폴백 표시

- [ ] **Step 5: 배포 빌드** — Run: `npm run build` → `dist/` 확인. 웹스토어 zip: `dist/`를 압축.

- [ ] **Step 6: Commit**

```bash
git add manifest.json src/icons
git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com" commit -m "chore: 아이콘·action·배포 빌드 마무리"
```

---

## Self-Review (계획 작성자 점검)

**1. Spec coverage** — 스펙 각 절 매핑:
- §2 스코프(북마크/히스토리/승격/스냅샷/패널/링크) → Task 8·11·12·13·14 ✓ / 제외 항목은 미구현(의도) ✓
- §3 대상(poe1/poe2 kakao) → manifest matches Task 2·10 ✓
- §4 컴포넌트 → Task 3~14 각 모듈 ✓
- §5 UI(도킹·접기·탭·행 C·링크) → Task 12·13 ✓
- §6 캡처(MAIN world 네트워크) → Task 10·11 ✓
- §7 가격(동적절사+P25, div·ex) → Task 4·3 ✓
- §8 환율(엔드포인트·리그별) → Task 5·9 ✓
- §9 데이터 모델 → store Task 8 + content Task 11 ✓
- §10 저장(local·평면·50캡) → Task 8 ✓
- §11 에러 처리 → 각 모듈 폴백/try (snapshot null, rates 실패 폴백) ✓ (사이트 DOM 변경은 Task 11 셀렉터 보정 메모)
- §12 배포/오픈소스 → Task 15 + 기존 LICENSE ✓
- §13 테스트 → Phase 1·2 단위 + Task 15 수동 E2E ✓
- §14 재사용(stat) → Task 7(공식 stats로 정제) ✓

**2. Placeholder scan** — 코드 스텝은 실제 코드 포함. 남은 "구현 시 보정" 항목은 외부 의존(실사이트 DOM 셀렉터·환율 베이스 호스트)으로, 플레이스홀더가 아닌 **명시적 외부 확인 포인트**(Task 9·11). 픽스처(검색 쿼리·stats)는 실제 캡처로 교체 지시.

**3. Type consistency** — `priceSnapshot`은 정상 경로 `{valueDiv, unit:'divine'}`, 폴백 `{value, unit}`; `formatPrice`는 두 형태 모두 처리(Task 3 테스트로 보장). `store`의 `addHistory/promoteToBookmark/rename/remove/listByKind` 시그니처가 content·renderList·rowActions에서 일관 사용 ✓. `dedupeKey`는 content(Task 11)에서 생성→store(Task 8)에서 사용 ✓.
