---
timestamp: 2026-07-22 (Asia/Seoul)
project: poe-bookmark-atlas
---

# poe-bookmark-atlas 핸드오프

POE2 거래소(poe.kakaogames.com) 북마크·히스토리 관리 Chrome MV3 확장 (Vite + @crxjs/vite-plugin). 우측 도킹 Shadow DOM 패널. 제작 브랜드: 서미누기.

## 현재 목표

**0.4.0 배포 준비 (2026-07-22)** — 리그 이관·투어 데모·내 리그 설정을 담아 **0.4.0으로 범프**(manifest·package)하고 `deploy/poe-bookmark-atlas-0.4.0.zip` 생성 완료. **남은 것: ① `develop` → `main` 머지(보호 브랜치라 사용자 확인 필요) ② GitHub 릴리즈 `v0.4.0` draft 생성 ③ 스토어 심사 제출.**
**진행 완료(2026-07-22)**: `v0.3.0` draft publish(태그 생성, `0f80dae`) → `develop`→`main` fast-forward 머지·푸시(`9064d03`, 11커밋) → `v0.4.0` draft 릴리즈 생성(target `9064d03`, 노트는 0.3.0 절 제외한 신규 버전). **다음: 사용자가 스토어에 `deploy/poe-bookmark-atlas-0.4.0.zip` 제출 → 심사 통과 후 `v0.4.0` draft를 직접 publish.**


0.2.0 스토어 심사 **통과**(2026-07-04 확인). 피드백 3건(작업1·2·3) 모두 기능 구현 완료. **사용자 방침(2026-07-04): "번역 100% 완벽 안 된 상태 인정하고, 미진한 부분은 추후 보완"** — Shift+클릭 수동 제보 기능이 그 보완 파이프라인. 이후 가이드 투어 화살표·키보드 네비·리그 노출 라운드까지 마침. **0.3.0 준비 완료** — 버전 범프(manifest·package 0.3.0)·`deploy/poe-bookmark-atlas-0.3.0.zip`·GitHub 릴리즈 3종 생성. **다음: 사용자가 스토어에 0.3.0 심사 제출 예정.**

## 완료된 작업

### 리그 이관(저장 조건 → 현재 리그 재검색) + 가이드 투어 예시 요소 (2026-07-22, `develop` 푸시 완료)

**핵심 판단 — 미완료 6번의 전제 교정**: "자동 채움 = 거래소 Vue 필터 UI를 클릭·타이핑으로 흉내내야 함(고리스크)"라는 기존 전제가 틀렸다. `cross-site-receiver.js`가 이미 쓰던 **공식 검색 생성 API**(`POST /api/trade2/search/poe2/<리그>`)에 저장된 raw query를 그대로 다시 제출하면, 반환된 해시 URL로 이동하는 것만으로 거래소가 **필터 UI까지 조건대로 채워** 렌더한다. UI 자동화 없이 (a)안이 노리던 결과를 그대로 얻는다. 유일한 걸림돌은 "raw query를 저장하지 않았다"였고, 그건 필드 추가로 해결.

- `src/lib/tradeSearch.js` **신규** — 순수 헬퍼 4종. `searchApiPath`/`searchResultPath`(게임별 경로·리그 인코딩), `isSafeSearchId`(응답 id를 URL에 이어 붙이므로 `[A-Za-z0-9_-]{1,64}`만 허용 — 경로 탈출 차단), `sanitizeQuery`(최상위 키를 query·sort로 화이트리스트 + 20KB 상한 + JSON 왕복). 헤더에 "왜 UI 자동 채움이 아닌가" 근거 기록
- `store.js` — 레코드에 `query`(raw 검색 조건) 추가. `backfillQuery(dedupeKey, game, query)`: query 도입 전 저장한 **구 북마크는 사용자가 같은 조건을 재검색하는 순간 자동으로 채워져** 이관 가능해짐(있는 값은 안 덮음). `migrateBookmarkLeague(id, url, league)`: url·league·lastUsedAt만 교체(이름·폴더·순서·메모·id·query 보존). `overwriteBookmark`·`markUsedByUrl`도 query 승계. `importBookmarksJSON`은 남의 query를 `sanitizeQuery` 통과시킨 뒤에만 채택(불합격이면 조건만 버리고 북마크는 유지)
- `content-main.js` — 히스토리 저장 시 `query` 동봉 + `backfillQuery` 호출. `migrateSearch(query, league)`: same-origin POST → 429/401·403/기타 HTTP를 각각 다른 사유로 반환 → id·URL 검증 후 결과 URL 반환. **일괄 이관은 의도적으로 미제공**(요청 폭주 시 GGG rate limit에 걸리면 거래소 검색 자체가 막힘)
- `renderList.js` — 진입점 2개: ① **지난 리그 북마크 이름 클릭 시 제안 팝오버**(기존 `showConflict` 재사용 — 신규 UI 요소 0): 조건이 있으면 [그대로 열기 / 현재 리그로 다시 검색], 없으면 **저장된 조건 요약을 보여주고** [그대로 열기](= 검토했던 "참고용 재구성 도우미"안의 가치를 여기서 흡수, 110자 초과 시 말줄임) ② ⋯ 팝오버의 `현재 리그로 다시 검색`(에메랄드 `.ba-act.relg`, query 있는 북마크만 노출 — 현재 리그 북마크도 해시 만료 복구용으로 사용 가능). Ctrl/⌘ 클릭(새 탭)은 기존대로 원본 열기
- **테스트가 잡은 버그 2건**: ① 중복 클릭 가드를 첫 `await` **뒤**에 둬서 연타 3회가 전부 통과 → 요청 3번(rate limit 유발). 동기 시점으로 이동 ② URL 허용 도메인 검증이 **이동 시점에만** 있어, 이상한 URL이 북마크에 먼저 기록됨 → 저장 전으로 검증 이동
- **가이드 투어 예시 요소** — 투어 2·3스텝(PoB 버튼·환산 칩)은 검색 결과가 없으면 가리킬 대상이 없어 스포트라이트가 통째로 사라졌다(사용자 스크린샷 제보). `content-main.js`의 `showTourDemo/hideTourDemo`가 **실제와 같은 클래스**(`.ba-pob-btn`/`.ba-exr-chip`)를 가진 '예시' 카드를 패널 반대편 자유 영역(패널 폭 412px 회피)에 놓고, `panel.js` 투어가 대상 없을 때만 호출→종료·다른 스텝에서 제거. 오인 방지: 점선 테두리 + "예시" 배지 + `pointer-events:none`. **진입 모션은 opacity만**(transform을 주면 투어가 삽입 직후 동기로 재는 rect가 어긋나 스포트라이트가 밀린다), 160ms `cubic-bezier(0.23,1,0.32,1)`, reduced-motion 대응
- **후속 수정 — "현재 리그"의 진실 소스 교정 (같은 날, 사용자 제보: "처음에 settlers로 리그명이 설정돼 있다")**
  - 증상: 오래된 북마크 링크로 들어오면 URL이 이미 끝난 리그(예: `Settlers`)라서 **패널이 그 죽은 리그를 "현재"로 표시**하고 진짜 현재 리그가 "지난"으로 뒤바뀐다. 그 상태에서 이관하면 **죽은 리그에 검색을 만든다**
  - 원인: '현재 리그' 판정을 `leagueFromUrl()`(페이지 URL)에만 의존 — 2026-07-04 리그 배지 때부터 있던 문제이고, 이관 기능이 그 위에 얹히면서 실해를 끼치게 됨
  - 수정: `renderList.js`에 `leagueInfo(leagueMap)` 신설 — **거래소 리그 목록 API(현재 열려 있는 리그만 반환)를 진실 소스로** 삼는다. poe1 카카오는 URL이 표시명("허상")·맵 키가 id("Mirage")라 양쪽 형태를 모두 인정. 목록을 못 받았으면 판정 보류(성급한 경고 방지)
  - 파급: ① "지난" 판정 = **끝난 리그**일 때만(스탠다드↔하드코어처럼 둘 다 살아있으면 안 깨진 것 — 기존엔 전부 "지난"으로 오탐) ② 섹션 접힘 기본값 = 끝난 리그만 접힘 ③ 살아있는 다른 리그 섹션은 배지 없음 ④ **이관 대상 리그**는 페이지 리그가 살아있을 때만 그것, 아니면 최근 히스토리의 살아있는 리그, 그것도 없으면 요청하지 않고 안내
  - `rowHtml`/`folderHtml`의 `currentLeague` 인자는 이 변경으로 고아가 돼 제거(대신 `lg` 전달 — 부수적으로 북마크 툴팁도 리그 **표시명**으로 나오게 됨, 기존엔 id 노출)
- **'내 리그' 설정 신설 (사용자 제안: "그냥 리그 정보를 유저들이 입력하게 하는 건 어떨까?")**
  - 설정 모달(Alt+O)에 **내 리그** 셀렉트 — 옵션은 거래소 리그 목록(살아있는 리그) + "자동". 게임별로 따로 저장(`uiLeague = {poe1, poe2}`), 다른 탭과 `storage.onChanged` 동기화
  - 우선순위: **설정 → 페이지 URL 리그 → 최근 검색 리그** (각 후보는 살아있을 때만 채택). `resolveCurrentLeague()`로 분리 — 이 값 하나가 섹션 '현재' 배지와 이관 대상을 **동시에** 결정한다(따로 계산하면 화면 표시와 실제 대상이 어긋난다). `bindAll`은 렌더가 정한 값을 그대로 받아 쓴다
  - 기본값은 여전히 자동 — 설정을 안 건드려도 대부분 맞고, 자동이 흔들리는 상황(끝난 리그 링크로 진입)에서만 사용자가 못 박으면 된다
  - 설정 모달 정리(사용자 지적): **패널 위치 세그먼트를 `왼쪽 | 오른쪽` 순으로** — 버튼 위치가 그 뜻과 같은 쪽에 있어야 라벨을 안 읽고도 고른다(기존은 `오른쪽 | 왼쪽`으로 반대). '내 리그' 행은 리그 목록을 못 받았을 때도 항상 렌더(저장값이 목록에 없으면 그 값도 선택지로 유지 — 설정이 사라진 것처럼 보이지 않게)
- **이관을 2단으로 재구성 — 조건 미저장 구 북마크까지 복구 (사용자 확인: "리그 단위로 검색 조건 유지가 되는 것 같아")**
  - 확인된 사실: **검색 해시는 조건만 담고 리그는 URL 경로가 정한다**(`/trade/search/Hardcore/EBo8vB8LC5` ↔ `/Standard/EBo8vB8LC5`). 따라서 리그 세그먼트만 바꾸면 같은 조건이 그 리그에서 검색된다
  - `migrateSearch(rec, league)` — ① 저장된 URL에서 해시 추출 → `GET /api/trade{2}/search/<목표리그>/<해시>`로 살아있는지 확인 → OK면 그 URL로 이동(**새 검색 생성 없음**) ② 해시가 만료됐으면 저장된 조건으로 POST 재생성 ③ 둘 다 안 되면 사유별 안내(`expired` 등)
  - **효과: query 도입 전 저장한 옛 북마크도 전부 이관 대상**(현재 구현의 유일한 사각지대였음). `migratable(rec)` = 해시 ‖ 조건
  - `searchHashFromUrl(url, game)` 신설(도메인·경로·해시 형태 검증). `isAllowedTradeUrl`은 이 모듈이 URL 조립에도 써야 해서 **정본을 `lib/tradeSearch.js`로 옮기고 `store.js`가 재수출**(순환 import 방지, 기존 import 경로 전부 그대로)
  - ⋯ 액션 라벨을 **"내 리그로 다시 검색"** 으로 통일(설정 이름과 일치). 이제 모든 북마크에 노출 — 리그 이동뿐 아니라 **만료된 링크 복구** 경로이기도 하다. 투어 ⋯ 스텝 문구도 갱신
- **투어 데모 조건 교정 (사용자 제보: 5·6·8스텝도 하이라이팅이 안 된다)**
  - 원인: 데모 주입 조건이 `isStoreEmpty`(저장소가 통째로 비었나) — **히스토리만 쌓이고 북마크는 0개**인 흔한 상태에선 false라 데모가 안 깔렸다. 그 상태에서 북마크 이름(5)·가격 필(6)·폴더 아이콘(8) 스텝은 가리킬 요소가 아예 없다(2·3스텝의 페이지 요소 문제와 같은 성격, 원인만 다름)
  - `needsTourDemo(game)`로 교체 — **북마크 0 ‖ 실폴더 0 ‖ 가격 스냅샷 가진 북마크 0** 중 하나라도 해당하면 데모를 띄운다(데모가 폴더 1 + 가격 있는 북마크 2를 넣어 셋을 한 번에 메움). `isStoreEmpty`는 이 변경으로 고아가 돼 제거
  - 투어 렌더에서 **접힌 리그 섹션도** 임시로 펼친다(기존엔 접힌 폴더만) — 끝난 리그가 기본 접힘이라 북마크가 지난 리그에만 있으면 같은 공백이 생긴다
  - 데모 링크를 게임별 경로로(`poe1 → /trade/search/`) — 데모가 더 자주 뜨게 됐으므로 잘못 클릭 시 엉뚱한 게임 404로 가지 않게
  - 하네스 실측(히스토리 3·북마크 0·폴더 0 재현): 4~8스텝 스포트라이트 전부 실제 크기로 잡힘, 투어 종료 후 북마크 0·폴더 0으로 원복(저장소 무오염)
  - **데모 리그명 교정(사용자 지적: 투어에 'Settlers'가 뜬다)**: 데모를 페이지 URL 리그로 심으면, 옛 북마크 링크로 들어온 상태에선 그 URL이 이미 끝난 리그라 예시 데이터가 `Settlers` 섹션(지난·접힘)에 들어갔다. 이제 `resolveCurrentLeague`(설정 → 페이지(살아있을 때) → 최근 검색)로 심고, **하나도 못 정하면 실제 리그명 대신 `예전 리그`** 로 적는다. 하네스 실측 — 정상: `Runes of Aldur:현재` / 끝난 리그 페이지: `예전 리그:지난`. 하네스에 `__leagueMap` 오버라이드 추가(끝난 리그 상황 재현용)
- 테스트 **218/218**(신규 53: `tradeSearch` 22 + `store` 12 + `leagueMigration.dom` 19) · 빌드 통과
- 하네스(`test-harness/harness.mjs`)에 지난 리그 북마크 2종(조건 有/無)·`migrateSearch` 목(`__migrateResult`로 성공·실패 전환)·투어 예시 스텁 추가

### CLAUDE.md 신설 — 전역 지침 감사 후속 (2026-07-07)
- 루트 `CLAUDE.md` 신규(최소형): 멀티 페르소나 도메인 선언(Domain-Specific Tool) + geo-redirect 제약·'POE 브라우저' 검증 관례 명시
- 전역 `~/.claude/CLAUDE.md` §14.4 매핑에 본 프로젝트 등록 — 4역할 검증 자동 트리거 정상화
- main 커밋·push 완료 (`99c32a5`, 2026-07-07)

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
6. **[구현 완료 — 라이브 검증만 남음] 리그 변경으로 깨진 북마크 복구** — 위 2026-07-22 항목 참조. **남은 것은 실제 거래소에서의 1회 확인**: 지난 리그 북마크 → "현재 리그로 다시 검색" → 새 검색이 생성되고 **필터 UI에 조건이 채워져** 뜨는지. 개발 환경에서는 로그인 세션이 필요해 POST를 실행해보지 못했다(단위·DOM 테스트와 하네스는 목으로 검증). 실패 시 확인 지점: ① 응답 JSON에 `id`가 오는지 ② poe1 리그 경로가 URL 표시명("허상")으로 맞는지(BE 환율 API만 EN id를 요구하고 거래소 API는 URL 표기 그대로일 것으로 판단) ③ 429가 뜨면 잠시 후 재시도
6-b. **[반영 완료 / 잔여 확인 1건] URL 리그 세그먼트 치환** — 사용자 확인(2026-07-22)으로 2단 이관 반영(위 항목). **남은 확인**: *오래된* 해시(예: Settlers 시절)가 GGG 서버에 얼마나 오래 살아있는지 — 만료돼 있으면 1순위가 실패하고 저장된 조건으로 폴백한다(조건도 없으면 `expired` 안내). 라이브에서 옛 북마크로 한 번 눌러보면 어느 경로를 탔는지 콘솔 로그(`[BA] 리그 이관 — 기존 해시 재사용` vs `해시 만료 추정, 조건 재생성으로 폴백`)로 바로 보인다

7. **[논의만, 미결정] 리그별 폴더 섹션 구조 제거** — 폴더가 이미 게임 전역 공유임을 확인, 히스토리처럼 리그 섹션을 없애고 북마크도 통합하는 안. **6번 구현으로 판단 근거가 바뀌었다**: 북마크가 "특정 리그의 링크"가 아니라 "리그 무관한 조건 + 언제든 재생성 가능한 링크"가 되었으므로 리그는 더 이상 1차 조직 축이 아니다 → 섹션 제거 쪽에 무게. 진행 시 리그 표시는 행 단위(조건 칩 툴팁의 `[리그]` 표기, 이미 있음) + `data-past` 기반 표식으로 내리고, 섹션 헤더의 "지난" 배지는 없어진다. **단 6번 라이브 검증 후에 착수**(검증 범위가 두 배가 되는 것 방지)

## 현재 상태

- **브랜치 전략 (2026-07-22 신설)**: 통합 브랜치 `develop`, `main`은 릴리즈 전용(직접 커밋 금지). 정본은 루트 `CLAUDE.md`. 릴리즈 시 `develop` → `main` 머지 후 태그.
- 브랜치: `main`·`develop` 둘 다 tip `9064d03`(origin 동기화, fast-forward 완료)
- 미커밋: `docs/영상-소개-대본.md`(신규, 사용자 검토 대기 — 0.4.0 리그 이관 기능 반영 여부 확인 필요)
- 테스트: **218/218**(vitest, jsdom 포함) · 빌드 통과
- 배포: **0.3.0 스토어 게시 중** / **0.4.0 준비 완료**(`deploy/poe-bookmark-atlas-0.4.0.zip`, 리그 이관·투어 데모·내 리그 설정 반영) — 사용자가 스토어 심사 제출 예정
- **GitHub 릴리즈·태그**: `v0.1.0`·`v0.2.0`·`v0.3.0`(2026-07-22 publish, `0f80dae`) 공개, `v0.4.0`(`9064d03`) **draft**(스토어 심사 통과 후 사용자가 직접 publish → 그때 태그 실제 생성). **릴리즈 절차**: ① 릴리즈 커밋에서 버전 범프+빌드+zip ② `gh release create vX.Y.Z --draft --target <full-sha> --title "vX.Y.Z" --notes-file <md>`(전체 SHA 필수 — 단축 SHA는 target_commitish 거부) ③ 스토어 심사 통과 후 draft를 publish. 노트는 사용자 관점 기능 중심으로 묶어 작성(개발 커밋 나열 X). **이전 버전 draft가 게시 안 됐으면 그것부터 publish**(v0.3.0 사례 — 스토어엔 나갔는데 태그 없이 19일 방치됨) 후 새 버전 릴리즈 진행
- 빌드: `npm run build` → dist/ (해시 변경 시 확장 리로드+F5). dist/·deploy/ gitignore.
- 하네스: `.claude/launch.json`의 `harness`(포트 5199), `test-harness/harness.mjs` 참조. content-main.js(페이지 주입 로직·PoB 버튼·환산 칩)는 하네스가 실행 안 함 — 이 부분은 `preview_eval`로 실제 로직을 인라인 재현해 모의 검증(라이브 로그인 세션 접근 불가)
- 검증 제약: 거래소는 **로그인 세션 탭에서만** 패널 마운트 → 라이브 검증은 확장 리로드+F5 수동. 확장은 **dist 폴더** 로드.
- 커밋 작성자: `git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com"`, Co-Authored-By 금지.
- **함정 메모**: 패널은 open shadow root — document 레벨 리스너에서 `e.target.closest` 금지, **`e.composedPath()` 사용** (누적 3회 물림)
- **하네스 검증 함정 3건(2026-07-04)**: ① `import('../src/store/store.js')`를 `preview_eval`에서 동적 import하면 실패(harness.mjs 자체 top-level import는 정상) — `chrome.storage.local.get/set('records')`을 직접 조작해 우회. ② renderList.js/panel.js 등을 Edit하면 Vite HMR이 **풀 페이지 리로드**를 트리거해 harness.mjs가 재실행되고 `mem` Map(목 storage)이 초기화됨 — eval로 주입한 테스트 데이터가 사라지므로 Edit 직후엔 재주입 필요. ③ 이 세션에서 `preview_screenshot`이 투어 유무·코드 변경과 무관하게 지속 타임아웃(환경 이슈로 추정) — `preview_eval`로 좌표·속성·컴퓨티드 스타일을 직접 읽어 대체 검증
- **맵 재생성 절차**: `scripts/build-pob-statmap.mjs <en.json> <kr.json> [출력명]`은 비-KR 환경(VPN)에서 curl로 받은 raw JSON 필요(EN pathofexile.com geo-block, Node fetch는 Cloudflare 차단 — curl만 통과). `scripts/build-pob-basemap.mjs [poe-i18n루트] [base출력] [unique출력]`은 poe-i18n-json-data-generator-dev 레포 최신 상태 의존
