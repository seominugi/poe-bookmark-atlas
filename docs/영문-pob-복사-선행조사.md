# 작업3 — 아이템 → 영문 PoB 복사 · 선행조사 & 체크포인트

> 상태: **3-1(hashes 존재) 라이브 확인 완료 ✅ (2026-07-03) / 남은 선결: 3-2(EN stat 데이터) 취득 + 아키텍처 C 승인 (본 구현 미착수)**
> 원칙: 이 작업은 "선행조사 후 체크포인트" 대상이라, KR trade2 API에 `item.extended.hashes`가 있는지 **라이브로 확인**하고 아키텍처를 **승인**받은 뒤에만 본 구현에 착수한다. (개발자 외출로 캡처가 미뤄져, 여기까지 준비만 해둠.)

## 1. 목표
거래소 검색 결과의 개별 아이템을, 한글 PoB(import 파서는 **영문 기반**)에 붙여넣도록 **영문 아이템 텍스트로 변환·복사**한다. 거래소 결과 행마다 "PoB 복사" 버튼을 주입 → 클릭 시 영문 아이템 텍스트를 조립해 클립보드에 복사.

## 2. 데이터 확보/부재 현황 (선행조사 결과)

| 데이터 | 상태 | 위치/비고 |
|---|---|---|
| 아이템 원본 JSON | **확보(전이적)** | page-bridge가 fetch 응답 가로챔 → content-main.js의 fetch 핸들러에서 `d.data.result[]`로 접근 가능. 단 현재는 `topIcon`용 `.item.icon`만 쓰고 나머지는 버림 → **결과 아이템 원본 유지 필요(구현 시)** |
| KO stat 텍스트 | **확보** | `statMap`(라이브 `poe.kakaogames.com .../data/stats`) 보유 |
| EN stat 텍스트/패턴 | **부재(geo-block)** | `pathofexile.com`은 한국 IP geo-redirect로 차단 → 개발자가 **비-KR 환경에서 1회 취득** 필요 (§3) |
| base type KR→EN | **확보** | poe-i18n 생성기: `assets/data/poe2/json/**/*_base_types.json` → `name.{en,kr}` + `classId`. KR 이름 매칭 → EN 이름 |
| unique KR→EN | **확보** | poe-i18n: `unique/*_unique_items.json` → `name.{en,kr}` + `baseItemId` + 고정 implicits/explicitMods |
| mod KR→EN (생성기) | **조인 불가** | 생성기 mod id = `poe2-rings-prefix-increased_life-t1`(poe2db식). trade stat id(`explicit.stat_...`/hash)와 **다름** → id 직접 조인 불가. (effectPattern.en 텍스트/group으로만 간접 매칭 가능 — 취약) |

**결론**: mod(능력치) 번역은 poe-i18n이 아니라 **trade `data/stats`(KR+EN)를 stat id로 페어링**해서 해야 한다. poe-i18n은 **base·unique 이름 KR→EN**에만 사용.

## 3. 핵심 검증 (BLOCKING 체크포인트) — 복귀 후 캡처 2건

### 3-1. KR trade2 아이템 응답에 `item.extended.hashes`가 있는가?  ← 아키텍처 갈림길
거래소에서 아이템 하나 검색 후, **거래소 탭 콘솔**에 아래 스니펫을 붙여넣고 다시 검색하면 `result[0].item.extended`가 콘솔에 찍힌다. 그 출력을 저장/공유해 주세요.

```js
(() => {
  const orig = window.fetch
  window.fetch = async (...a) => {
    const res = await orig(...a)
    const url = (a[0] && a[0].url) || a[0]
    if (typeof url === 'string' && /\/api\/trade2\/fetch\//.test(url)) {
      res.clone().json().then((d) => {
        const it = d && d.result && d.result[0] && d.result[0].item
        console.log('[BA] item.extended =', JSON.stringify(it && it.extended, null, 2))
        console.log('[BA] item[0] =', JSON.stringify(it, null, 2))
      }).catch(() => {})
    }
    return res
  }
  console.log('[BA] fetch 훅 설치됨 — 이제 아이템을 하나 검색하세요')
})()
```

확인 포인트:
- `item.extended.hashes.{explicit,implicit,...}` 배열이 있는가? (각 원소 `[statId, [valueIdx...]]`)
- `item.extended.mods.{explicit,implicit}[].magnitudes[]`에 `{hash, min, max}`가 있는가?
- (네트워크 탭 대안) trade2 `/fetch/` 응답 JSON에서 `result[0].item.extended` 직접 확인해도 됨.

> **결과 (2026-07-03 라이브 캡처 · 사원 서판):** ✅ `item.extended.hashes.{explicit,implicit}` 존재 — 각 원소 `[statId, [valueIdx]]` 확인.
> 추가로 `item.explicitMods[]`에 라인별 `hash`(`stat.explicit.stat_...`) + `mods[].magnitudes[].{min,max}`(티어 범위) + `description`(실제 값 포함 KR 텍스트)까지 존재.
> `implicitMods[]`는 라인별 hash가 없어 `extended.hashes.implicit`의 statId로 매핑. → **옵션 C 채택 가능.** (실제 롤 값은 `description`의 숫자가 authoritative; magnitudes는 티어 범위일 뿐.)
> 주의: 이 아이템은 `extended.mods.explicit`가 비어 있고 explicit 값은 top-level `explicitMods[]`에 있음 → 조립기는 `explicitMods[].hash`+`description` 경로를 1차로 쓴다.

### 3-2. EN stat 데이터 1회 취득 (geo-block 우회)
비-KR 환경(VPN/프록시 등)에서 아래를 1회 받아 저장:
- `https://www.pathofexile.com/api/trade2/data/stats` (EN)
- 이미 확보된 KR: `https://poe.kakaogames.com/api/trade2/data/stats`
- 두 응답을 **stat id 기준으로 페어링** → `{ id: { ko, en } }` (en은 `#` 포함 패턴) 맵 생성 → **seominugi.com에서 서빙**(확장은 환율 fetch와 동일 경로로 취득).

## 4. 아키텍처 — 결정 필요

### 옵션 C (권장, hashes 존재 시)
- `item.extended.hashes`의 stat id로 ko↔en stat 맵을 조회 → EN 패턴(`#` 포함) 확보.
- `item.extended.mods[].magnitudes`의 값으로 `#` 치환 → EN mod 라인 재구성.
- 정확·견고(생성기 mod-id 불일치 문제 회피). **stat 맵 1회 구축 + seominugi 서빙**이 유일한 선결 비용.

### 옵션 Fallback (hashes 부재 시)
- KR mod 텍스트를 KR→EN 패턴 매칭으로 변환 — **취약**(다수값·하이브리드·어순·복수 매칭 모호). 이 경우 **사용자와 재논의** 후 범위 축소.

> **트레이드오프**: C는 정확하지만 EN stat 데이터 취득/서빙 선결작업 필요 · Fallback은 선결 없지만 정확도·유지보수성 낮음. → hashes 존재하면 **C 권장**.

## 5. 조립 계획 (EN 아이템 텍스트, PoB import 포맷)
순서: `Item Class` / `Rarity` / 이름 / base(EN) / `Item Level` / `Requirements` / `Quality` / `Sockets·Runes` / implicit / explicit / `Corrupted`.
- 값은 `magnitude`로 `#` 치환.
- 하이브리드(1줄=복수 stat)·룬·인챈트·유니크·미감정 엣지 처리.

## 6. MVP 범위
1차: **희귀 아이템 + explicit/implicit + 흔한 base** → 검증 후 유니크·룬·경로석 확장.

## 7. 다음 단계 (승인 후 착수)
1. (사용자) 3-1 캡처 → hashes 존재 확인 → 아키텍처 C/Fallback 확정 **승인**.
2. (사용자/개발자) 3-2 EN stat 데이터 1회 취득 → ko↔en 맵 생성 → seominugi 서빙.
3. content-main: 결과 아이템 원본 유지 + 거래소 결과 행에 "PoB 복사" 버튼 주입.
4. EN 텍스트 조립기(§5) + 클립보드 복사.
5. 희귀 아이템 MVP 검증 → 확장.

**미착수 이유**: 3-1(hashes 존재)이 아키텍처를 가르고, 3-2(EN stat)가 없으면 mod 번역 자체가 불가. 둘 다 라이브 캡처가 필요해 여기서 멈추고 준비만 완료함.
