# Claude Code 작업 지시 — 북마크 아틀라스 v1.0 디자인 반영

이 폴더는 디자인 프로토타입을 실제 확장(`poe-bookmark-atlas`)에 반영하기 위한 핸드오프 패키지입니다.

## ⚠️ 먼저 읽을 것

번들된 `*.dc.html` / `*(미리보기).html`은 **HTML로 만든 디자인 레퍼런스**입니다 — 의도한 룩·동작을
보여주는 프로토타입이지, 그대로 복붙할 프로덕션 코드가 아닙니다. 작업은 **이 디자인을 기존
코드베이스의 패턴(바닐라 JS + Shadow DOM + `panel.css`)으로 재현**하는 것입니다.

**충실도: 하이파이(hifi).** 색·타이포·간격·인터랙션이 확정본이므로 픽셀 단위로 재현하세요.

## 읽는 순서

1. **`HANDOFF.md`** — 섹션별 구현 가이드(§1~§11). 실제 클래스명·함수명 기준.
2. **`CHANGELOG.md`** (프로젝트 루트 복제본) — v1.0 기능 범위 + 버전 관리 규칙.
3. **`디자인 프로토타입 (미리보기).html`** — 패널 전체를 브라우저에서 직접 열어 확인(오프라인 동작).
4. **`디자인 시스템 (미리보기).html`** — 색·타이포·컴포넌트·규칙 기준 문서.
5. **`panel.css`** — 드롭인 교체본(기존 클래스명 100% 유지). `src/content/panel/panel.css`로 교체.

---

## 코드베이스 현황 (중요 — 데이터 레이어는 이미 있음)

실제 레포는 핸드오프 문서가 가정한 것보다 앞서 있습니다. **store API를 새로 만들지 말고 재사용**하세요.

| 디자인 기능 | 이미 있는 것 (재사용) | 추가로 필요한 것 (UI 위주) |
|---|---|---|
| 게임 판별 | `content-main.js` `location.pathname.startsWith('/trade2')` → `game` | 토글 UI 없음 — 그대로 |
| 리그 기록 | `content-main.js` `leagueFromUrl()`, 북마크 `r.league`, `overwriteBookmark`가 `league` 갱신 | **현재 리그 vs `r.league` 비교 → "이전 리그" 배지** UI + 클릭 시 재검색·갱신 |
| 중복 점프 | `store.findBookmark(dedupeKey, game)`, `renderList.highlightBookmark(container, id)` | 토스트 문구 + 폴더 펼침 연결만 |
| soft-stale | `renderList.js` `STALE_MS`, `.ba-stale` 경고, `removeStaleBookmarks` | 삭제 대신 **흐림 + "갱신 필요" 배지 → 원클릭 되살리기**로 전환 |
| 폴더 | `listFolders(game)` `addFolder(name, game)` `renameFolder` `deleteFolder` | **폴더 `color` 필드 추가** + 헤더 좌측 띠/아이콘 색 + 5색 팔레트 |
| 가격/통화 | `lib/formatPrice.js` `lib/currencyRates.js` `priceSnapshot.js` | 그대로 |

### 신규로 구현할 UI 레이어 (§11 참고)
- **빠른 검색 + 정렬** — `renderList.js`에 검색 입력 + 정렬 분절 토글. `rowHtml` 풀을 필터·정렬 후 렌더. 북마크·히스토리 각각.
- **정보 밀도 토글** — `density`(여유/조밀)를 `chrome.storage.local`에 저장, 패널 루트에 `data-density` 부여해 `panel.css`에서 분기(스타일은 panel.css에 추가).
- **대용량 리스트** — 카드에 `content-visibility:auto; contain-intrinsic-size`. 히스토리는 60개 캡 + "더 보기" 200개씩(렌더 슬라이스). 검색 시 캡 리셋.
- **조건 기반 이름 자동 제안** — 저장 다이얼로그 기본값을 `dedupeKey`/조건에서 생성(유니크명 우선, 없으면 핵심 스탯 2개).
- **폴더 색상** — store 폴더에 `color` 추가 + 저장 다이얼로그 색상 팔레트.

### 데이터 마이그레이션 주의
- 폴더 `color` 신규 필드: 기존 폴더는 `color` 없음 → 렌더 시 기본색(`#8b85a8` 또는 팔레트 첫 색)으로 폴백.
- `density` 미설정 시 기본 `comfortable`(노안 배려).

---

## 권장 작업 순서

`HANDOFF.md` 말미 "적용 순서 권장" + §11을 따르세요. 데이터 레이어가 이미 있으니
**panel.css 교체 → 리그/소프트-stale 배지(기존 store 재사용) → 검색·정렬·밀도·가상화(UI 신규)** 순이 효율적입니다.

각 단계는 독립적이며, `test/`의 vitest가 store 회귀를 잡아줍니다. UI 변경 후 `npm test`로 store 계약이 안 깨졌는지 확인하세요.
