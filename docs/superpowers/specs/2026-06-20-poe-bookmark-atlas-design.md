# 북마크 아틀라스 (poe-bookmark-atlas) — 설계 문서

- **작성일**: 2026-06-20
- **상태**: 설계 확정 (구현 전)
- **레포**: `poe-bookmark-atlas` · **브랜드명**: 북마크 아틀라스
- **라이선스**: MIT (공개 오픈소스)

---

## 1. 배경 & 목적

POE 거래소(거래 검색)용 **검색 북마크 + 검색 히스토리** 관리 크롬 확장 프로그램.

기존에 사용하던 두 확장( [POE Trade Extension](https://chromewebstore.google.com/detail/poe-trade-extension/bikeebdigkompjnpcljicocidefgbhgl) · [POE 거래소 ++ 카카오전용](https://chromewebstore.google.com/detail/poe-%EA%B1%B0%EB%9E%98%EC%86%8C-++-%EC%B9%B4%EC%B9%B4%EC%98%A4%EC%A0%84%EC%9A%A9/cbfodfbcpnlkkecmoioiegcfjididkfd) )이 **유지보수 중단으로 방치**되어, 직접 만들어 관리하며 커뮤니티에 서비스하기 위함. "아틀라스" 제품군(필터 아틀라스 · 스태시 아틀라스)의 신규 멤버.

**최우선 가치**: 검색한 기록이 **한눈에 보기 편할 것** — "무엇을 검색했는지"를 즉시 파악할 수 있어야 한다.

---

## 2. 스코프

### 포함 (v1)
- 검색 **북마크** (이름 저장, 영구)
- 검색 **히스토리** (자동 기록, 최근 N개)
- 히스토리 → 북마크 **승격** (☆, 이름 변경 가능)
- **가격 스냅샷** (저장 시점 최저가 평균, 디바인 환산)
- 우측 **도킹 패널** (접기), **탭** UI (북마크 / 히스토리)
- seominugi.com **경제 페이지 링크**

### 제외 (v2 후보)
- 폴더 / 태그 정리 → v1은 평면 리스트
- 리그 변경 시 저장 검색 **자동 변환**
- 클라우드 **동기화 / 공유**
- 시세 상세 · 추이 (→ seominugi.com 경제로 위임, 직접 구현 안 함)

> 설계 원칙: **북마크에 집중**. 가격 스냅샷은 별도 "시세 기능"이 아니라 **북마크에 붙는 메타데이터**로 취급한다.

---

## 3. 대상 사이트

| 게임 | 도메인 / 경로 |
|------|---------------|
| POE1 한국 | `https://poe.kakaogames.com/trade/...` |
| POE2 한국 | `https://poe.kakaogames.com/trade2/...` (poe2 경로) |

- 구 도메인 `poe.game.daum.net` 아님 — **카카오게임즈(`poe.kakaogames.com`)로 이전**됨.
- 글로벌 `pathofexile.com`은 v1 제외 (확장 시 `host_permissions`·파서 분기 추가).

---

## 4. 아키텍처 (Manifest V3)

각 컴포넌트는 **한 가지 책임**만 가지며, 잘 정의된 인터페이스로 통신한다.

| 모듈 | 실행 위치 | 책임 |
|------|-----------|------|
| `pageBridge` | content script (**MAIN world**) | 거래소 검색 네트워크 요청(`POST …/api/trade(2)/search`)을 가로채 **쿼리 JSON**과 결과를 추출, content script로 메시지 전달 |
| `searchParser` | content script (ISOLATED) | 쿼리 JSON → **사람이 읽는 기록**(제목·스탯칩) 변환. 순수 함수. *Naratmalssami 스탯 번역 자산 재사용* |
| `priceSnapshot` | content script | 렌더된 결과의 최저가 listings 가격 수집 → 하위 2개 제외 → 환율 환산 → 평균 |
| `currencyRates` | service worker (CORS 우회 fetch) | 리그별 환율을 백엔드에서 가져와 캐시, "디바인 환산 함수" 제공 |
| `store` | service worker / content | `chrome.storage.local` CRUD — `SearchRecord`의 **단일 진실원** |
| `panelUI` | content script (**Shadow DOM**) | 우측 도킹·접기 패널, 탭, 리스트 렌더, 상호작용 |
| `serviceWorker` | background | 생명주기, 외부 fetch 프록시(환율) |

### 데이터 흐름

**① 캡처** (검색 시 기록 생성)
```
거래 페이지 검색(POST /api/trade/search)
  → pageBridge (쿼리 JSON·결과 추출)
  → searchParser (제목·스탯칩) + priceSnapshot (최저가 평균 ← currencyRates)
  → store (chrome.storage.local)
```

**② 표시**
```
store → panelUI (탭·리스트 렌더)
  → 행 클릭: 저장된 URL로 재검색
  → ☆: history → bookmark 승격
  → 하단 링크: seominugi.com 경제
```

---

## 5. UI 설계

- **위치**: 거래 페이지 **우측 도킹** + 접기. 늘 보이는 **핸들**로 토글(발견성↑).
- **격리**: **Shadow DOM** 컨테이너로 사이트 CSS와 충돌 방지.
- **탭**: `🔖 북마크` / `🕘 히스토리`.
- **행 스타일 (두 줄 하이브리드)**:
  - 1줄: `🔖 제목` ……… `≈ 2.3 div` (가격 스냅샷, 우측 정렬)
  - 2줄: `핵심 스탯칩` ……… `저장시각` (소형, 회색)
  - 히스토리 행에는 `☆`(북마크 승격), 북마크 행에는 이름변경·삭제.
- **하단**: `📊 아이템 시세 자세히 → seominugi.com ↗` 링크.

표시에 담기는 정보: 아이템 이름/카테고리 · 핵심 스탯 필터 · 가격 스냅샷 · 리그 · 저장시각 · 북마크/히스토리 구분.

---

## 6. 검색 캡처 — 네트워크 가로채기

- `pageBridge`를 **MAIN world**에 주입하여 페이지의 `fetch`/`XHR`를 후킹, 거래 검색 요청(`POST …/api/trade(2)/search/...`)의 **요청 바디(쿼리 JSON)** 와 응답(검색 ID·결과 해시 목록)을 읽는다.
- **DOM이 아니라 네트워크를 읽는 이유**: POE 거래 API의 쿼리 스키마는 안정적이지만 DOM/CSS는 자주 바뀐다. 기존 확장이 방치되며 깨진 지점이 보통 DOM 의존부 → **유지보수 부담을 줄이는 방향**.
- MAIN world ↔ content script(ISOLATED) 통신은 `window.postMessage`(출처 검증 포함).
- 캡처 시점에 현재 검색 URL(재검색용)·리그·게임(poe1/poe2)을 함께 확보.

### 히스토리 vs 북마크
- **히스토리**: 검색 요청 감지 시 자동 적재. **최근 50개** 유지(초과 시 오래된 것 제거), 동일 쿼리는 중복 제거(최신 시각으로 갱신).
- **북마크**: 사용자가 명시 저장(패널의 "북마크" 버튼) 또는 히스토리 행의 `☆` 승격. 개수 제한 없음(저장 용량 한도 내).

---

## 7. 가격 스냅샷

저장(또는 수동 "갱신") 시점에 1회 계산하는 **스냅샷**. 자동 갱신하지 않는다(레이트리밋 회피).

**알고리즘**
1. 렌더된 결과 listings에서 `{amount, currency}`를 수집한다. 정렬이 가격 오름차순이면 상위 10개가 곧 **최저가 10개**. 정렬이 가격순이 아니면 환율로 환산 비교해 **클라이언트에서 최저가 10개를 선별**한다(선별 불가 시 "가격순 정렬" 안내).
2. listings가 **5개 이상이면 가장 싼 2개 제외**(미끼/시세조작 방어). 5개 미만이면 절사하지 않음.
3. `currencyRates`로 해당 **리그 환율** 확보.
4. 남은 listings를 각각 **디바인 가치로 환산**(§8 공식). 환율이 없는 통화는 제외.
5. 환산값 **평균** → `snapshot.valueDiv`. 사용 표본 수 `samples`, 시각 `capturedAt` 기록.
6. **표시**: `valueDiv ≥ 1` → `≈ X.X div`; `< 1` → 가독성을 위해 하위 단위로 표기(예: `≈ N ex`).

**폴백**: 환율 조회 실패 시 → 디바인 환산을 포기하고, 남은 listings 중 **최빈(가장 많이 쓰인) 통화**의 것만 평균하여 **그 통화 그대로** 표시(`≈ 150 chaos`, `samples`에 표본 수). 외부 의존 없이도 의미 있는 값 유지.

---

## 8. 환율 통합 (currencyRates)

- **소스(주)**: 운영 백엔드 `smng-poe-pricer`의 라이브 엔드포인트
  `GET /api/{poe1|poe2}/currency-exchange?realmName=<리그명>` (서버 5분 캐시)
  - 베이스 호스트는 구현 시 운영 배포 기준 1줄 확인(seominugi.com 운영 API).
- **소스(대안)**: 동일 `exchange_rates`를 담은 published JSON(raw)도 가능(서버 의존 0). v1은 사용자가 지정한 라이브 API 우선.
- **응답 구조**(예, POE2):
  ```json
  {
    "poe_version": "poe2",
    "primary_unit": "exalted",
    "exchange_rates": {
      "exalted_per_chaos":  { "price": 23 },
      "exalted_per_divine": { "price": ... }
    }
  }
  ```
- **환산 공식**(primary_unit 일반화):
  - listing 가격을 primary_unit으로 변환: `amount_primary = amount × {primary}_per_{currency}` (동일 통화는 1).
  - 디바인으로 변환: `value_div = amount_primary ÷ {primary}_per_divine`.
  - POE1/POE2의 `primary_unit`이 다를 수 있으므로, `exchange_rates`의 `*_per_*` 키를 일반화해 "디바인 환산 함수"를 구성.
- **리그 단위 분리 준수**: 환율은 **검색과 동일한 리그** 기준으로 사용한다(리그마다 디바인 값이 다름 — 백엔드 불변 원칙과 일치).
- **캐시**: 리그별로 클라이언트 세션 캐시(예: 5분), 백엔드 캐시와 정합.

---

## 9. 데이터 모델

```jsonc
// SearchRecord — chrome.storage.local에 평면 배열로 저장
{
  "id": "uuid",
  "game": "poe1" | "poe2",
  "league": "Standard",            // 검색 당시 리그
  "url": "https://poe.kakaogames.com/trade2/search/poe2/Standard/AbC123",  // 재검색용
  "title": "희귀 갑옷",             // 아이템 이름 또는 카테고리 요약
  "itemType": "Body Armour",       // (선택) 타입
  "stats": ["+최대 생명", "화염 저항", "혼돈 저항"],  // 2줄 칩
  "priceFilter": { "min": null, "max": 3, "currency": "divine" },  // (선택) 검색 자체의 가격 조건
  "snapshot": {                    // (선택) 가격 스냅샷
    "valueDiv": 2.3,               // 디바인 환산 평균 (폴백 시 raw 통화)
    "unit": "divine",              // 표시 단위 (폴백: "chaos" 등)
    "samples": 8,                  // 평균에 사용된 표본 수
    "capturedAt": 1718800000000
  },
  "kind": "bookmark" | "history",  // ☆ 승격 시 history → bookmark
  "name": "내 갑옷 검색",           // (북마크) 사용자 지정 이름
  "createdAt": 1718800000000,
  "updatedAt": 1718800000000
}
```

---

## 10. 저장

- `chrome.storage.local`에 `SearchRecord[]` 단일 컬렉션(평면).
- 히스토리·북마크는 `kind`로 구분(승격은 `kind` 변경).
- 용량: `storage.local` 기본 한도 내(히스토리 50개 상한 + 북마크). 초과 대비 히스토리 우선 정리.

---

## 11. 에러 처리

| 상황 | 처리 |
|------|------|
| 거래 API 스키마/네트워크 변경 | `pageBridge` 파싱 실패를 감지·로깅, 기록은 최소 정보(URL·리그)라도 저장. 패널에 "정보 일부 누락" 표시 |
| 환율 API 실패 | §7 폴백(최빈 통화 평균, 그 통화 그대로 표시) |
| 레이트리밋 | 가격 계산은 사용자 액션(저장·갱신) 시에만. 자동 일괄 갱신 금지 |
| 결과 부족(<5) | 절사 없이 가능한 만큼 평균, `samples`로 신뢰도 표기. 0개면 스냅샷 생략 |
| 저장된 리그 만료 | 클릭 시 URL 그대로 이동(404/리다이렉트 가능) — v1 허용, 리그명 표기로 사용자 인지 |
| Shadow DOM 스타일 충돌 | 모든 패널 스타일을 Shadow root 내부에 캡슐화 |

---

## 12. 배포 & 오픈소스

- **크롬 웹스토어** 배포(커뮤니티 서비스). 스토어 제목에 검색 노출 키워드 포함(예: "북마크 아틀라스 — POE 거래 검색·북마크").
- **오픈소스(MIT)**: 공개 레포. 크롬 확장은 코드가 어차피 클라이언트에 노출되므로 은닉 이점이 없고, 공개 시 **신뢰·기여·유지보수 영속성** 이득.
- **보안 전제**: 익스텐션에 **비밀키·토큰 절대 미포함**(클라이언트라 노출됨). 환율 API는 읽기 전용 공개 데이터.
- 권한 최소화: `host_permissions`는 `poe.kakaogames.com` + 환율 API 호스트로 한정.

---

## 13. 테스트

- **단위 테스트**(순수 로직): `searchParser`(쿼리 JSON → 기록), `priceSnapshot`(샘플 가격 → 절사·환산·평균), `currencyRates`(환산 공식). 실제 검색 요청 payload를 **픽스처**로 사용.
- **통합/수동**: unpacked 로드 후 `poe.kakaogames.com` 거래 페이지에서 캡처·렌더·재검색 검증(로그인 필요로 E2E 자동화는 제한적).

---

## 14. 재사용 (Reuse-First)

- **스탯 번역**: 기존 `Naratmalssami-POE`의 스탯 번역 자산(stat id → 한글)을 `searchParser`에서 재사용 검토. POE 스탯 ID 매핑을 새로 만들지 않는다.
- **POE 아이템 데이터**: 이름/번역 기준 소스 = `poe-i18n-json-data-generator-dev/assets/data` (전역 우선 소스).
- **환율/경제 데이터**: `smng-poe-pricer` 백엔드 재사용(외부 의존 0).

---

## 15. 미해결 / 추후 결정

- 환율 API **베이스 호스트** 최종 확인(운영 배포 기준).
- 가격 표시 단위 자동 포맷(div ↔ ex ↔ chaos)의 임계값 미세조정.
- v2 후보: 폴더/태그, 리그 자동 변환, 클라우드 동기화/공유.

---

## 부록 · 핵심 결정 요약

| 항목 | 결정 |
|------|------|
| 스코프 | 북마크 + 히스토리 전용 (시세는 링크) |
| 대상 | POE1·POE2 한국 `poe.kakaogames.com` |
| 패널 | 우측 도킹 + 접기, Shadow DOM |
| 구조 | 탭(북마크/히스토리), ☆ 승격 |
| 행 표시 | 두 줄 하이브리드 + 가격 스냅샷 |
| 캡처 | 네트워크 가로채기(MAIN world) |
| 가격 | 최저가 10 → 하위2 절사 → 8개 평균, 리그별 환율로 디바인 환산, 저장 시점 스냅샷 + 수동 갱신 |
| 환율 | `smng-poe-pricer` `/api/{poe1\|poe2}/currency-exchange?realmName=` |
| 저장 | `chrome.storage.local` 평면 리스트 |
| 배포 | 크롬 웹스토어 · MIT 오픈소스 |
