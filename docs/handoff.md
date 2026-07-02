---
timestamp: 2026-07-03 (Asia/Seoul)
project: poe-bookmark-atlas
---

# poe-bookmark-atlas 핸드오프

POE2 거래소(poe.kakaogames.com) 북마크·히스토리 관리 Chrome MV3 확장 (Vite + @crxjs/vite-plugin). 우측 도킹 Shadow DOM 패널. 제작 브랜드: 서미누기.

## 현재 목표

0.2.0 스토어 심사 대기 중. 피드백 3건 중 **작업1(중복 저장 오판)·작업2(패널 좌/우) 완료**, **작업3(영문 PoB 복사) — poe1·poe2 모두 종단 구현 완료**(아이템 원본 보존·전체 조립·행별 버튼·엑잘/카오스 환산 칩). **남은 것: 사용자의 실제 PoB import 최종 확인 1건**.

## 완료된 작업

### 0.2.0 릴리즈 (2026-07-01)
- 커밋: `592d2c6` → `db73b33` → `ae71972` (origin/main 푸시 완료)
- 배포: `deploy/poe-bookmark-atlas-0.2.0.zip` 업로드 + **스토어 심사 제출 완료** (0.1.0 zip 보관)
- 주요 변경 (db73b33 + ae71972):
  - 북마크 **간략(한 줄) 보기** 토글 — `renderList.js`, `panel.css .ba-oneline` (content-visibility 대신 실측 높이)
  - 폴더별 **"현재 검색 저장" 칩** — 폴더 본문 최상단 고정 (`renderList` folderHtml `.ba-folder-savechip`)
  - 메모를 **조건 칩 우측 한 행**으로 통합 (`.ba-meta-row`) + 이름 클릭영역 테두리 (`.ba-open`)
  - **가격 호버 툴팁**(검색 시점·매물수·p25 빠른 판매가), 히스토리 **조건 칩**(필터 포함 카운트)·대표 이미지
  - **액션 버튼 의미색**(복사=청록·갱신=하늘·편집=바이올렛·이동=앰버·삭제=로즈) + 폴더 버튼
  - **정렬 기본값 recent** + 새 북마크를 폴더 맨 앞 저장 (`store.js` minBookmarkOrder)
  - **schemaVersion 도입** (`store.js` ensureSchema/MIGRATIONS, `content-main.js` 호출) — 향후 데이터 마이그레이션 진입점
  - **가이드 투어 박스(스포트라이트 구멍) 방식 전면 재설계** (`panel.js` startTour, `.ba-tour-spot`): 12스텝, 이전 버튼, 숨쉬는 테두리, 패딩 대칭 보정, 동기 즉시 배치(비활성 탭 대응), 빈 화면용 **데모 데이터** 임시 주입/제거 (`store.js` seedDemoData/clearDemoData/isStoreEmpty)
  - "모든 폴더 접기" 용어 통일

### 검색 통합·리그 접이식 (592d2c6)
- 북마크·히스토리 통합 검색, 리그별 접이식 섹션(현재 펼침/지난 접힘), 정렬 토글 헤더 이동

### 피드백 작업1·2 + 버그픽스 (2026-07-02~03)

- **작업1 — 저장 충돌 판정·UX 재설계** (`searchParser.js`, `renderList.js`, `panel.js`)
  - `filterParts()`: 비-능력치 필터(경로석 확률·등급 등)를 searchIdentity에 포함 → 수치만 바꿔도 "이미 저장됨" 오판 해결
  - `structuralIdentity()`/`findNearDuplicate()`: 수치만 다른 near-dup 감지 → **취소/새로 만들기/덮어쓰기 3지선다** (`resolveSaveConflict` + `showConflict` 팝오버)
  - 조건 칩에 입력 수치 표기(≥/≤/~) + '조건 N개' 앰버 배지, 북마크 열람 시 검색 필드 업그레이드(`markUsedByUrl` 4번째 인자)
- **스포트라이트 focus 재설계**: opacity 디밍이 패널 opacity transition들과 충돌해 무력화 → **투어식 hole-punch 오버레이**(`.ba-focus-spot`)로 교체. 대화 중 **재렌더 레이스**(행 교체 → 강조·스크롤 소실, "취소해야 스크롤됨") 해결: 행 재조회 + MutationObserver 재적용 + center 스크롤 + 휠 잠금 + 접힌 폴더 자동 펼침
- **카드 2줄 구성 + ⋯ 액션 팝오버**: 액션 5종 팝오버 통합(간략/상세 공통). shadow retargeting(`composedPath` 필수), hover transform containing-block, content-visibility, **flip 기준 리스트 가시영역 바닥**(하단 잘림) 픽스
- **작업2 — 패널 좌/우 설정**: 기어 → 설정 모달(`showSettings`), `uiPanelSide` storage, `[data-side="left"]` 미러링, 핸들 `left` transition
- **팝업 정리**: 영문거래소·시세/동향 버튼 제거
- **E2E 하네스** (`test-harness/`, `vite.harness.config.js`, `.claude/launch.json`): 목 chrome + 시드로 패널 마운트, Preview MCP(`preview_eval`)로 자동 검증. `__triggerConflict`/`__saveUnique`/`__dumpBookmarks` 헬퍼. **주의: 스크린샷·rAF는 이 환경에서 멈춤 → eval+setTimeout만**

### 작업3 — 영문 PoB 복사 (poe1·poe2 종단 완료)

- **선결 2건 해소**: ① `item.extended.hashes` 라이브 캡처 확인 ② EN stat 취득 — **이 개발 환경은 pathofexile.com geo-block 안 걸림**(curl 통과, Node fetch는 Cloudflare 차단)
- **맵 생성 스크립트** — poe1·poe2 각각 3종(총 6개 JSON, `src/lib/pob{Stat,Base,Unique}Map[.poe1].json`):
  - `scripts/build-pob-statmap.mjs`: EN+KR trade stats 페어링. **id별 k번째 등장 매칭**으로 개선(단순 인덱스 페어링은 그룹 entry 수가 1개라도 어긋나면 그 이후 전부 오염 — poe1 enchant EN 1465/KR 1464 케이스로 발견). poe2 8086 id(다중변형 80) · poe1 14969 id(다중변형 229, 미페어링 1)
  - `scripts/build-pob-basemap.mjs`: poe-i18n 생성기 base_types+unique_items → base/유니크 KR→EN. poe2 base 3172·유니크 444 / poe1 base 3102·유니크 1201
- `src/lib/pobExport.js` — `buildPobText()`: Item Class/Rarity/이름/base EN/ilvl/**enchant**(implicit 옆 별도 섹션)/**implicit**/**fractured+explicit+crafted**(한 섹션, 인게임 순서)/Corrupted. 희귀 이름은 KR↔EN 데이터 없어(+PoB 폰트에 한글 없음) `seominugi-bookmark-item-<classId 슬러그>` ASCII 치환, 유니크는 uniqueMap으로 EN 실명. 26개 TDD(캡처 실아이템 포함)
- `src/lib/currencyRates.js` — `baseCurrencyOf(game)`(poe2=exalted/poe1=chaos), `baseFromPrice(price, ex, game)`(카오스·디바인·미러→게임 기본화폐, poe1은 `chaos_per_exalted` 등 다른 키셋), `fmtCurAmount`. 16 TDD
- `src/content/content-main.js` — 종단 통합:
  - 모든 fetch(스크롤 포함)에서 `pobItems`(id→item)·`pobPrices`(id→listing.price) 누적, 새 검색 시 초기화
  - poe1 리그명 버그: URL엔 KR 표시명("허상")인데 BE는 EN id("Mirage") 요구 → **leagueMap 역변환** 추가(부수 효과로 poe1 북마크 가격 스냅샷도 복구)
  - PoB 버튼: **'인증 완료' 배지 아래**(자연 높이, 텍스트 앵커 — 이미지 로딩 타이밍 무관) 1순위 → 이미지 오른쪽(이미지 로딩 전이면 다음 패스로 스킵) → 우측 버튼 줄 아래. 2줄 라벨(PoB/영문 복사), 바이올렛 글래스모피즘, lazy-load(클릭 시 게임별 맵 3종 동적 import)
  - 엑잘/카오스 환산 칩: `findPriceHost`(텍스트 앵커 '제시 가격'/'정가')에 주입, **GGG 공식 static API**(`api/trade[2]/data/static`)의 CDN 화폐 이미지 사용(확장 내부 URL은 페이지 CSP로 깨짐), 제시가 화폐 아이콘 실측 크기에 맞춰 칩 아이콘·폰트 스케일(`!important`로 사이트 전역 img 규칙 무력화), 텍스트 폴백→아이콘 도착 시 업그레이드
  - body 전역 MutationObserver(디바운스 100ms) + 타이머 5단계 이중 안전망으로 행 주입(컨테이너 탐색·재부착 의존 제거)
- `src/content/panel/panel.js` — 설정 단축키 **Alt+O** 추가(Alt+S는 검색저장 선점) — kbd 안내 팝오버·기어 툴팁 반영
- 문서: `docs/영문-pob-복사-선행조사.md` (캡처 결과·아키텍처 C 확정)

## 미완료 / 다음 단계

1. **작업3 최종 확인**: 사용자가 poe1·poe2 각각에서 PoB 복사 → 실제 PoB(1/2)에 Ctrl+V import 검증 — 아직 미확인. 실패 시 `missing[]` 콘솔 로그(`[BA] PoB 미변환 항목:`)로 원인 특정
2. 완료되면 Designer·QA 페르소나(Phase 3·4) 정리 후 작업3 완료 선언
3. poe1 환산 칩은 BE 응답에 있는 엑잘·디바인·미러 매물만 지원(연금술 등은 칩 생략) — BE에 마켓 추가 시 확장은 자동 커버
4. poe1 장비 품질/소켓/링크는 MVP 미포함(PoB에서 수동 지정 필요)

## 현재 상태

- 브랜치: `main` — 이번 세션 커밋 예정(작업1·2+픽스 / 하네스 / PoB 코어는 기존 3커밋 완료·push됨; 이번 라운드의 PoB 종단 구현·poe1 지원·환산 칩·단축키는 신규 커밋)
- 테스트: **139/139**(vitest, jsdom 포함) · 빌드 통과
- 배포: **0.2.0 스토어 심사 중** / 이번 작업들은 0.3.0 대상
- 빌드: `npm run build` → dist/ (해시 변경 시 확장 리로드+F5). dist/·deploy/ gitignore.
- 하네스: `.claude/launch.json`의 `harness`(포트 5199), `test-harness/harness.mjs` 참조
- 검증 제약: 거래소는 **로그인 세션 탭에서만** 패널 마운트 → 라이브 검증은 확장 리로드+F5 수동. 확장은 **dist 폴더** 로드.
- 커밋 작성자: `git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com"`, Co-Authored-By 금지.
- **함정 메모**: 패널은 open shadow root — document 레벨 리스너에서 `e.target.closest` 금지, **`e.composedPath()` 사용** (이번 세션에만 3회 물림)
- **맵 재생성 절차**: `scripts/build-pob-statmap.mjs <en.json> <kr.json> [출력명]`은 비-KR 환경(VPN)에서 curl로 받은 raw JSON 필요(EN pathofexile.com geo-block, Node fetch는 Cloudflare 차단 — curl만 통과). `scripts/build-pob-basemap.mjs [poe-i18n루트] [base출력] [unique출력]`은 poe-i18n-json-data-generator-dev 레포 최신 상태 의존
