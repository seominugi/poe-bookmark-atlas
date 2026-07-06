---
timestamp: 2026-07-07 (Asia/Seoul)
project: poe-bookmark-atlas
---

# poe-bookmark-atlas 핸드오프

POE2 거래소(poe.kakaogames.com) 북마크·히스토리 관리 Chrome MV3 확장 (Vite + @crxjs/vite-plugin). 우측 도킹 Shadow DOM 패널. 제작 브랜드: 서미누기.

## 현재 목표

0.2.0 스토어 심사 **통과**(2026-07-04 확인). 피드백 3건(작업1·2·3) 모두 기능 구현 완료. **사용자 방침(2026-07-04): "번역 100% 완벽 안 된 상태 인정하고, 미진한 부분은 추후 보완"** — Shift+클릭 수동 제보 기능이 그 보완 파이프라인. 이후 가이드 투어 화살표·키보드 네비·리그 노출 라운드까지 마침. **0.3.0 준비 완료** — 버전 범프(manifest·package 0.3.0)·`deploy/poe-bookmark-atlas-0.3.0.zip`·GitHub 릴리즈 3종 생성. **다음: 사용자가 스토어에 0.3.0 심사 제출 예정.**

## 완료된 작업

### CLAUDE.md 신설 — 전역 지침 감사 후속 (2026-07-07)
- 루트 `CLAUDE.md` 신규(최소형): 멀티 페르소나 도메인 선언(Domain-Specific Tool) + geo-redirect 제약·'POE 브라우저' 검증 관례 명시
- 전역 `~/.claude/CLAUDE.md` §14.4 매핑에 본 프로젝트 등록 — 4역할 검증 자동 트리거 정상화
- **미커밋 상태** — 커밋은 사용자 지시 시

### 소개 영상 대본 작성 (2026-07-06)
- `docs/영상-소개-대본.md` 신규 — 장면(🎬)+내레이션(🎙) 형식, 3분 30초~4분 30초 구성
- 구성: 훅 → 소개 → 핵심 기능 4꼭지 → **피드백 3건 업데이트 스토리**(저장 3지선다·패널 좌/우·PoB 영문 복사+Shift+클릭 제보) → "피드백으로 함께 개선" 마무리(사용자 지정 멘트)
- 부록: 촬영 체크리스트(⚠️ 0.3.0 기능은 스토어 심사 통과 후 공개 권장)·제목 후보·설명란 초안(디스코드 링크 포함)
- **미커밋 상태** — 사용자 검토 후 커밋 여부 결정

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

### 가이드 투어 화살표·키보드 네비·리그 노출 라운드 (2026-07-04, 이어서)

- **가이드 투어 스포트라이트↔카드 연결 화살표** (`panel.js` startTour) — 사용자 스크린샷 피드백 기반 여러 라운드 반복:
  - SVG 베지어 곡선(`.ba-tour-arrow`)으로 연결. `edgeAnchor()`가 내 상하좌우 네 변의 가운데 점 중 상대 중심에 **실제로 더 가까운 곳**을 직접 거리 비교로 선택(중심점 dx/dy 비율 방식은 옆으로 넓적한 박스에서 엉뚱한 변을 골라 폐기)
  - 여백(pad)이 실제 간격보다 크면 시작·끝점이 서로 앞질러 곡선이 카드 밑으로 접혀 들어가는 버그 → 여백 없는 기준점 사이 실측 간격(rawGap)에 맞춰 pad를 동적으로 축소
  - `.ba-tour-spot`은 top/left/width/height에 CSS transition이 걸려 있어 스타일 변경 직후 동기 `getBoundingClientRect()`로 되읽으면 트랜지션 시작 전(한 스텝 전) 값이 나옴 → `place()`가 계산값을 직접 반환, 화살표는 그 값을 씀(실측 DOM 재조회 안 함)
  - 화살촉 마커 확대(10×9→14×16) + `stroke-linecap: round`→`butt`(마커 밑동에 둥근 돌기 생기던 SVG 흔한 문제 해결)
  - 패널이 접힌 상태에서 투어 시작 시 `.ba-root` 슬라이드인(.26s transform) 도중 첫 스텝을 측정해 스포트라이트가 어긋나는 버그 → 접힌 상태였으면 280ms 대기 후 측정
- **가이드 투어 ← → 방향키 네비게이션** — 버튼 클릭과 동일한 `goNext`/`goPrev` 공유(중복 로직 없음), 입력창·`<select>` 포커스 시 무시, 키 반복(길게 누름) 무시. 카드에 `← →` 힌트 표시(`.ba-tour-kbdhint`, 기존 `.ba-kbd-pop kbd` 스타일 공유)
- **리그 정보 노출** (`renderList.js` rowHtml) — 조사 결과 폴더는 이미 게임 단위로 전역 공유(리그 무관, `addFolder`에 league 필드 없음)라 같은 폴더가 리그 섹션 수만큼 반복 렌더되는 구조적 어색함 확인(리그 섹션 자체를 없애는 안은 논의만 하고 보류 — 미완료 7번 참조):
  - 리그 섹션 헤더 "지난" 배지를 경고 톤(앰버, `.ba-league-badge.past`)으로 강화 + 툴팁("링크가 깨졌을 수 있음") — 행 단위 아님(섹션 헤더가 이미 리그를 말해주므로 중복 방지, AskUserQuestion으로 범위 확정)
  - 북마크 조건 칩 툴팁에도 `[리그] 《...》` 저장 당시 리그 표시(히스토리와 동일 마커·메커니즘 재사용) — `leagueLine`/`condTipWithLeague`를 히스토리·북마크 공용으로 한 번만 계산하도록 정리(히스토리 쪽 중복 코드 제거)
  - 조건 0개인 북마크는 조건 칩 자체가 안 떠서 리그 정보 걸 곳이 없던 문제 → 조건 칩 항상 렌더로 변경("조건 0개" 텍스트 + 리그만 담긴 툴팁)

## 미완료 / 다음 단계

1. 사용자가 poe1·poe2 각각에서 PoB 복사 → 실제 PoB(1/2)에 Ctrl+V import 최종 확인 — 아직 미확인(현재 "미완벽 인정, 추후 보완" 방침이라 급하지 않음. Shift+클릭 제보로 사용자 피드백 루프 대체)
2. poe1 탈리스만 베이스 데이터 소스 부재(위 참조) — 필요시 별도 조사
3. poe1 환산 칩은 BE items 맵에 있는 63개 화폐만 지원 — 제왕의 오브·축복의 오브 등 일부 흔한 화폐는 BE 데이터 자체에 없음(이 리그 스냅샷 한정일 수 있음)
4. poe1 장비 품질/소켓/링크는 MVP 미포함(PoB에서 수동 지정 필요)
5. 완료 선언 전 Designer·QA 페르소나(Phase 3·4) 정리 권장(§14, 아직 미실시)
6. **[일부 완료] 리그 변경으로 깨진 북마크 복구 기능** — 사용자 제안(2026-07-04): 저장 시점 리그와 현재 리그가 달라 검색이 깨진 북마크에 "① 능력치 필터/그룹에 저장된 조건 재적용 ② 삭제" 2択 제공. 조사 결과:
   - **리그 불일치 감지는 구현 완료(2026-07-04)** — 리그 섹션 헤더 "지난" 배지 경고 강화 + 북마크/히스토리 조건 칩 툴팁에 리그 노출(위 항목 참조)
   - 기존 `.ba-stale`류 배지(14일 미사용 기준, `renderList.js`)와는 별개 로직 — 시간 기준과 리그 기준은 독립적
   - "삭제"는 기존 삭제 흐름 재사용, 간단(미구현)
   - "능력치 필터/그룹 재적용"(자동 채움)은 신규 대형 기능 — 거래소 필터 UI에 값을 프로그래밍적으로 써넣는 코드가 현재 전무(Alt+A/Alt+G도 드롭다운만 열어줄 뿐 값을 채우진 않음, `stat-shortcut.js`). 거래소가 Vue 기반 SPA라 제대로 하려면 실제 상호작용(클릭·타이핑·이벤트 디스패치)을 흉내내야 해서 GGG 사이트 개편마다 깨질 수 있는 유지보수 리스크가 큼
   - 대안으로 "참고용 재구성 도우미"(저장된 조건을 읽기 전용으로 보여주고 기존 Alt+A/Alt+G로 사용자가 직접 재구성) 검토됨 — 훨씬 저비용·저리스크, 다만 자동 채움보다 편의는 낮음
   - **토큰 여유 있을 때 재검토** — 완전 자동 채움 vs 참고용 도우미 중 방향부터 결정 필요
7. **[논의만, 미결정] 리그별 폴더 섹션 구조 제거** — 폴더가 이미 게임 전역 공유임을 확인, 히스토리처럼 리그 섹션을 없애고 북마크도 통합하는 안이 나왔으나 결론 없이 보류. 진행하려면 위 6번(리그 배지·툴팁)과의 관계 재정리 필요(섹션이 없어지면 리그 배지 위치도 바뀌어야 함)

## 현재 상태

- 브랜치: `main` — tip `d4880c8`(origin 동기화). **미커밋: `docs/영상-소개-대본.md`(신규)·`docs/handoff.md`(이 갱신)** — 영상 대본은 사용자 검토 후 커밋
- 테스트: **165/165**(vitest, jsdom 포함) · 빌드 통과
- 배포: **0.2.0 심사 통과** / **0.3.0 준비 완료**(`deploy/poe-bookmark-atlas-0.3.0.zip`, 화살표 수정까지 반영) — 사용자가 스토어 심사 제출 예정
- **GitHub 릴리즈·태그 (2026-07-04 도입)**: 버전별 릴리즈 노트를 GitHub Releases로 통합관리(스토어 설명에 매번 쓰던 것 대체). `v0.1.0`(`34469d5`)·`v0.2.0`(`ae71972`) 공개, `v0.3.0`(`0f80dae`) **draft**(스토어 심사 통과 후 사용자가 직접 publish → 그때 태그 실제 생성). **다음 릴리즈 절차**: ① 릴리즈 커밋에서 버전 범프+빌드+zip ② `gh release create vX.Y.Z --draft --target <full-sha> --title "vX.Y.Z" --notes-file <md>`(전체 SHA 필수 — 단축 SHA는 target_commitish 거부) ③ 스토어 심사 통과 후 draft를 publish. 노트는 사용자 관점 기능 중심으로 묶어 작성(개발 커밋 나열 X)
- 빌드: `npm run build` → dist/ (해시 변경 시 확장 리로드+F5). dist/·deploy/ gitignore.
- 하네스: `.claude/launch.json`의 `harness`(포트 5199), `test-harness/harness.mjs` 참조. content-main.js(페이지 주입 로직·PoB 버튼·환산 칩)는 하네스가 실행 안 함 — 이 부분은 `preview_eval`로 실제 로직을 인라인 재현해 모의 검증(라이브 로그인 세션 접근 불가)
- 검증 제약: 거래소는 **로그인 세션 탭에서만** 패널 마운트 → 라이브 검증은 확장 리로드+F5 수동. 확장은 **dist 폴더** 로드.
- 커밋 작성자: `git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com"`, Co-Authored-By 금지.
- **함정 메모**: 패널은 open shadow root — document 레벨 리스너에서 `e.target.closest` 금지, **`e.composedPath()` 사용** (누적 3회 물림)
- **하네스 검증 함정 3건(2026-07-04)**: ① `import('../src/store/store.js')`를 `preview_eval`에서 동적 import하면 실패(harness.mjs 자체 top-level import는 정상) — `chrome.storage.local.get/set('records')`을 직접 조작해 우회. ② renderList.js/panel.js 등을 Edit하면 Vite HMR이 **풀 페이지 리로드**를 트리거해 harness.mjs가 재실행되고 `mem` Map(목 storage)이 초기화됨 — eval로 주입한 테스트 데이터가 사라지므로 Edit 직후엔 재주입 필요. ③ 이 세션에서 `preview_screenshot`이 투어 유무·코드 변경과 무관하게 지속 타임아웃(환경 이슈로 추정) — `preview_eval`로 좌표·속성·컴퓨티드 스타일을 직접 읽어 대체 검증
- **맵 재생성 절차**: `scripts/build-pob-statmap.mjs <en.json> <kr.json> [출력명]`은 비-KR 환경(VPN)에서 curl로 받은 raw JSON 필요(EN pathofexile.com geo-block, Node fetch는 Cloudflare 차단 — curl만 통과). `scripts/build-pob-basemap.mjs [poe-i18n루트] [base출력] [unique출력]`은 poe-i18n-json-data-generator-dev 레포 최신 상태 의존
