---
timestamp: 2026-07-04 (Asia/Seoul)
project: poe-bookmark-atlas
---

# poe-bookmark-atlas 핸드오프

POE2 거래소(poe.kakaogames.com) 북마크·히스토리 관리 Chrome MV3 확장 (Vite + @crxjs/vite-plugin). 우측 도킹 Shadow DOM 패널. 제작 브랜드: 서미누기.

## 현재 목표

0.2.0 스토어 심사 대기 중. 피드백 3건(작업1·2·3) 모두 기능 구현 완료. **사용자 방침(2026-07-04): "번역 100% 완벽 안 된 상태 인정하고, 미진한 부분은 추후 보완"** — Shift+클릭 수동 제보 기능이 그 보완 파이프라인. 지금은 UI 다듬기 라운드 다수 진행, **커밋 안 한 변경 다수 누적**(아래 "현재 상태" 참조) — 다음 세션 시작 시 우선 확인.

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

### 작업3 이후 다듬기 라운드 (2026-07-04, 미커밋)

- **PoB 번역 정확도 버그 2건**:
  - `(Local)`/`(Global)` 접미사(거래소 필터 UI 전용 표시, 인게임 텍스트엔 없음) 미제거 → PoB가 mod 인식 못 함. `translateMod`에서 `TRADE_ONLY_SUFFIX` 정규식으로 제거
  - `fillValues` 결과에 `#`가 안 채워진 채 남는 케이스(클러스터 주얼류 "Allocates #" 같은 텍스트형 옵션 — `#` 자리가 숫자가 아니라 특성 이름) → `missing[]` 집계에도 안 잡히던 사각지대. 이제 `#` 잔존 시 `en=null`(실패) 처리해 KR 폴백 + 집계
  - **알려진 한계**: poe1 탈리스만(부적류 장신구) 베이스가 poe-i18n 데이터셋에 통째로 없음(Talisman 리그 아이템 미포함) — 확인됨, 대안 데이터소스 필요시 별도 조사
- **엑잘/카오스 환산 칩 커버리지 확장**: 큐레이션 4종(엑잘·디바인·미러) 밖 BE `items` 맵(개별 화폐 시세, poe1 341개/poe2 608개) 폴백 추가 — `itemsRate()`. 거래소 103개 화폐 id 중 63개 커버(스크린샷 재현: 쥬얼러 오브·색채의 오브 등). `primary_currency` 일치 시 직접관찰 `_ask`, 아니면 cross 계산값 사용(둘이 갈리는 사례 발견해 구분)
- **히스토리 카드 재설계 (여러 라운드)**:
  - 리그 통합(모든 리그 단일 섹션, 북마크는 리그별 유지) — `listByKind`가 이미 시간순 정렬이라 재파티션만 제거
  - 카드 UI를 북마크와 동일한 **조건칩+⋯팝오버** 언어로 통일 — 액션(북마크로 저장·링크복사·삭제)을 `.ba-actions-pop`으로 이동(신규 JS 불필요, 기존 범용 핸들러 재사용)
  - 리그 표시는 별도 칩(가변 길이 → 말줄임 문제) 대신 **조건칩(없으면 날짜칩) 툴팁 맨 위**로 이동 — `[리그] 《...》` 마커를 tooltip 렌더러가 시안색 span으로 치환(`.ba-tip-accent`, 기존 `────────`→`<hr>` 패턴과 동일 메커니즘 확장)
  - 날짜는 항상 연월일시분 전체(`fmtTime`), 히스토리 전용 시안(cyan) 색 칩(`.ba-hist-price`/`.ba-hist-when`)으로 북마크 골드 칩과 구분
  - **버그 2건 — 북마크에도 있던 잠재 버그**: ① 가격 없을 때 빈 필(pill) 렌더(`.ba-price-pill`/`.ba-hist-price` 둘 다 무조건 래핑하던 게 원인) → 가격 있을 때만 렌더로 수정. ② ⋯ 버튼이 행 우측 끝에 고정 안 됨(칩이 짧으면 남는 공간이 ⋯ 뒤에 생김, 북마크는 조건 텍스트가 보통 길어 우연히 안 보이던 문제) → `.ba-more`에 `margin-left:auto`
- **헤더 레이아웃**: `.ba-brand` 행에 로고·⌨·서미누기제작·⚙·♥ 5개 고정폭 요소가 몰려 타이틀 줄바꿈 → 설정(⚙) 버튼을 푸터로 이동("사용법 가이드 다시 보기" 옆), 아이콘 전용→"설정" 텍스트 병기로 직관성 개선
- **가이드 투어**: 죽은 `.ba-rowfoot` 셀렉터(카드 리스트럭처링으로 고아됨) → `.ba-more`로 교체, 설정 스텝 신규 추가, 투어 엔진이 페이지 바깥(PoB 버튼·환산 칩) 요소도 스포트라이트 가능하도록 확장(`global:true`, shadow root가 `.ba-root`의 transform과 무관해 좌표 안전)
- **Shift+클릭 수동 제보**: PoB 버튼에 미변환 mod 있으면 Shift+클릭으로 제보 텍스트를 클립보드에 복사 + 기존 공개 Discord 초대 링크(`discord.gg/kEm2G2qcZQ`)를 새 탭으로 오픈. **웹훅 직접 연동 안 함**(클라이언트에 webhook 시크릿 노출 시 악용 위험 — 확장은 언패킹된 JS라 누구나 추출 가능). seominugi.com 백엔드(smng-poe-pricer, 별도 레포) 쪽에 제보 수신 엔드포인트 생기면 `reportMissing()` 내부만 fetch(POST)로 교체하면 됨, UI·트리거는 안 바꿔도 됨

## 미완료 / 다음 단계

1. 이번 세션 다듬기 라운드 **커밋 안 함** — 다음 세션에서 커밋 여부 사용자 확인 필요(8개 파일, +261/-72줄)
2. 사용자가 poe1·poe2 각각에서 PoB 복사 → 실제 PoB(1/2)에 Ctrl+V import 최종 확인 — 아직 미확인(현재 "미완벽 인정, 추후 보완" 방침이라 급하지 않음. Shift+클릭 제보로 사용자 피드백 루프 대체)
3. poe1 탈리스만 베이스 데이터 소스 부재(위 참조) — 필요시 별도 조사
4. poe1 환산 칩은 BE items 맵에 있는 63개 화폐만 지원 — 제왕의 오브·축복의 오브 등 일부 흔한 화폐는 BE 데이터 자체에 없음(이 리그 스냅샷 한정일 수 있음)
5. poe1 장비 품질/소켓/링크는 MVP 미포함(PoB에서 수동 지정 필요)
6. 완료 선언 전 Designer·QA 페르소나(Phase 3·4) 정리 권장(§14, 아직 미실시)

## 현재 상태

- 브랜치: `main` — **미커밋 변경 다수**(작업3 종단 구현 이후 다듬기 라운드 전체, 8 파일). 이전 3커밋(작업1·2+픽스/하네스/PoB 코어)만 origin push 완료
- 테스트: **165/165**(vitest, jsdom 포함) · 빌드 통과
- 배포: **0.2.0 스토어 심사 중** / 이번 작업들은 0.3.0 대상
- 빌드: `npm run build` → dist/ (해시 변경 시 확장 리로드+F5). dist/·deploy/ gitignore.
- 하네스: `.claude/launch.json`의 `harness`(포트 5199), `test-harness/harness.mjs` 참조. content-main.js(페이지 주입 로직·PoB 버튼·환산 칩)는 하네스가 실행 안 함 — 이 부분은 `preview_eval`로 실제 로직을 인라인 재현해 모의 검증(라이브 로그인 세션 접근 불가)
- 검증 제약: 거래소는 **로그인 세션 탭에서만** 패널 마운트 → 라이브 검증은 확장 리로드+F5 수동. 확장은 **dist 폴더** 로드.
- 커밋 작성자: `git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com"`, Co-Authored-By 금지.
- **함정 메모**: 패널은 open shadow root — document 레벨 리스너에서 `e.target.closest` 금지, **`e.composedPath()` 사용** (누적 3회 물림)
- **맵 재생성 절차**: `scripts/build-pob-statmap.mjs <en.json> <kr.json> [출력명]`은 비-KR 환경(VPN)에서 curl로 받은 raw JSON 필요(EN pathofexile.com geo-block, Node fetch는 Cloudflare 차단 — curl만 통과). `scripts/build-pob-basemap.mjs [poe-i18n루트] [base출력] [unique출력]`은 poe-i18n-json-data-generator-dev 레포 최신 상태 의존
