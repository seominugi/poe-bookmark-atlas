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

/** _quartiles 포팅: 내부 정렬 */
export function quartiles(values) {
  const s = [...values].sort((a, b) => a - b)
  if (s.length >= 4) return [linearQuantile(s, 0.25), linearQuantile(s, 0.5), linearQuantile(s, 0.75)]
  const mid = Math.floor(s.length / 2)
  const p50 = s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
  return [s[0], p50, s[s.length - 1]]
}

/** compute_sellable_price 포팅. */
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

/** _dominant_currency 포팅 (ex 우선) — 환율이 없을 때만 쓰는 폴백 경로 */
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
 * 화폐 구성 — 툴팁이 "원래 어떤 화폐로 올라와 있었나"를 말할 수 있게 센다.
 * 이름을 **여기서 확정해 저장**하는 이유: 패널은 화폐 한글명 맵(거래소 static API)을 갖고 있지 않다.
 *
 * ⚠ 상위 3종까지만 담고 나머지는 '기타'로 접는다 — 툴팁(`.ba-tip`)이 `white-space: pre` 라
 *   **줄바꿈을 하지 않는다.** 한글 화폐명은 `완벽한 엑잘티드 오브`·`히네코라의 머리카락` 처럼
 *   10자까지 가므로, 4종을 담으면 한 줄이 max-width(720px)를 넘길 수 있다. 3종이면
 *   `제시 화폐 — ` + 3×13자 ≈ 47자로 상한 안에 들어온다.
 * @param {{currency:string}[]} used 실제로 계산에 쓴 매물만
 * @param {(id:string)=>string} nameOf 화폐 id → 한글명 (없으면 id 그대로)
 */
function currencyMix(used, nameOf) {
  const counts = new Map()
  for (const l of used) {
    const id = String(l.currency || '').toLowerCase() || '?'
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const top = sorted.slice(0, 3).map(([id, n]) => ({ name: nameOf(id) || id, n }))
  const restN = sorted.slice(3).reduce((s, [, n]) => s + n, 0)
  if (restN) top.push({ name: '기타', n: restN })
  return top
}

/**
 * listings → 시세 스냅샷.
 *
 * ⚠ **2026-09-13 이전에는 exalted·divine 두 화폐만 인정했다.** 그 외 화폐로 매겨진 매물을 통째로
 *   버렸고, 전부 그런 화폐면 `null` 을 돌려줘 북마크에 가격이 **아무 표시 없이** 사라졌다
 *   (제보 — 베렉 시리즈 3건). 사용자 리그에 실제로 쓰이는 화폐가 33종이라 **31종이 버려지고 있었다.**
 *   섞여 있을 때는 더 조용했다: 다른 화폐 매물만 빠진 채 계산되고 `sampleN` 이 줄어든 수를 말했다
 *   (툴팁이 "매물 3개 중"이라고 하는데 실제로는 11개였다).
 *   같은 저장소의 `baseFromPrice`(lib/currencyRates.js)는 그 31종을 **이미 전부 환산**하고 있었고
 *   거래소 결과 행의 환산 칩이 그걸 쓰고 있었다 — 한 앱 안에서 같은 가격에 답이 갈렸다.
 *   그래서 여기서 환산을 **직접 하지 않고 주입받는다**(`toBase`). 환산 로직을 두 벌 갖지 않는 게 핵심이다.
 *
 * @param {{amount:number,currency:string}[]} listings
 * @param {object} o
 * @param {(l:{amount:number,currency:string})=>number|null} [o.toBase] 매물 → 게임 기본 화폐 환산.
 *   null 이면 그 매물은 환산 불가로 제외된다. 없으면 폴백 경로로 간다(환율 미도착).
 * @param {number} [o.basePerDivine] 기본 화폐 1개당 신성한 오브 수 (currencyRates.basePerDivineOf)
 * @param {number} [o.exaltedPerDivine] 표시용 — formatPrice 가 1 디바인 미만을 엑잘로 바꿀 때 쓴다
 * @param {(id:string)=>string} [o.nameOf] 화폐 id → 한글명 (툴팁용)
 */
export function priceSnapshot(listings, o) {
  const toBase = o?.toBase
  const basePerDivine = o?.basePerDivine || 0
  // poe2 는 기본 화폐가 엑잘이라 두 값이 같다. poe1 은 다르다(base=chaos) — 표시는 엑잘 기준이 맞다.
  const epd = o?.exaltedPerDivine || 0
  const nameOf = o?.nameOf || ((id) => id)
  const now = Date.now()

  if (toBase && basePerDivine > 0) {
    // 환산 가능한 것만 남긴다. **무엇을 썼는지 함께 들고 간다** — sampleN 이 거짓말하지 않게.
    const used = []
    const base = []
    for (const l of listings || []) {
      const v = toBase(l)
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) { used.push(l); base.push(v) }
    }
    if (base.length === 0) return null
    const r = computeSellable(base)
    const valueDiv = round4(r.sellable / basePerDivine)
    return {
      valueDiv,
      exaltedPerDivine: epd || basePerDivine, // poe2 는 동일. poe1 에서 epd 를 못 받았으면 표시가 base 축이 된다
      value: valueDiv,
      unit: 'divine',
      lowestAsk: round4(r.lowestAsk / basePerDivine),
      sampleN: r.sampleN,
      dropped: (listings || []).length - used.length, // 환산 못 한 매물 수 — 0 이 아니면 표본이 전부가 아니다
      currencyMix: currencyMix(used, nameOf),
      method: 'sellable_p25',
      capturedAt: now,
    }
  }

  // ── 폴백: 환율이 없다 ────────────────────────────────────────────────
  // 환산할 수단이 없으니 **한 화폐로 매겨진 것만** 모아 그 단위로 낸다. exalted·divine 로 제한하는 건
  // formatPrice 가 그 둘만 라벨을 갖기 때문이다 — 카오스로 내면 화면에 빈칸이 뜬다(조용한 실패).
  const unit = dominantUnit(listings || [])
  if (!unit) return null
  const same = (listings || []).filter((l) => String(l.currency || '').toLowerCase() === unit)
  const r = computeSellable(same.map((l) => l.amount))
  if (r.sampleN === 0) return null
  return {
    value: r.sellable,
    unit,
    lowestAsk: r.lowestAsk,
    sampleN: r.sampleN,
    dropped: (listings || []).length - same.length,
    currencyMix: currencyMix(same, nameOf),
    method: 'sellable_p25_fallback',
    capturedAt: now,
  }
}
