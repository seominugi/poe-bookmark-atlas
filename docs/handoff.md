---
timestamp: 2026-07-03 (Asia/Seoul)
project: poe-bookmark-atlas
---

# poe-bookmark-atlas 핸드오프

POE2 거래소(poe.kakaogames.com) 북마크·히스토리 관리 Chrome MV3 확장 (Vite + @crxjs/vite-plugin). 우측 도킹 Shadow DOM 패널. 제작 브랜드: 서미누기.

## 현재 목표

0.2.0 스토어 심사 대기 중. 피드백 3건 중 **작업1(중복 저장 오판)·작업2(패널 좌/우) 완료**, 작업3(영문 PoB 복사)은 코어 조립기·EN stat 맵까지 완료 — **남은 것: 아이템 원본 보존 + 전체 아이템 텍스트 조립 + 행별 'PoB 복사' 버튼 UI**.

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

### 작업3 — 영문 PoB 복사 (착수, 코어 완료)

- **선결 2건 해소**: ① `item.extended.hashes` 라이브 캡처 확인 ② EN stat 취득 — **이 개발 환경은 pathofexile.com geo-block 안 걸림**(curl 통과, Node fetch는 Cloudflare 차단)
- `scripts/build-pob-statmap.mjs`: EN+KR trade stats(각 8202개, 그룹·순서 동일) 위치 페어링 → `src/lib/pobStatMap.json`(8086 id, 다중변형 80개 `[{en,ko}]` KR 매칭 택1, 588KB)
- `src/lib/pobExport.js`: stripTags/fillValues/pickTemplate/translateMod — 캡처 실아이템(공허 경고) mod 15케이스 TDD 통과
- 문서: `docs/영문-pob-복사-선행조사.md` (캡처 결과·아키텍처 C 확정)

## 미완료 / 다음 단계 (작업3 계속)

1. **content-main 아이템 원본 보존**: 현재 `.item.icon`만 사용 → 결과별 item JSON을 행 매칭 가능하게 유지
2. **전체 아이템 텍스트 조립기**: PoB2 import 포맷(Item Class/Rarity/이름/base EN/Item Level/implicit/explicit) — base type KR→EN은 poe-i18n(`D:\github\poe-i18n-json-data-generator-dev\assets\data\poe2\json\**\*_base_types.json`, name.{en,kr}) 번들 맵 스크립트 추가. 희귀 이름은 KR 유지 가능(PoB는 base만 EN 필수)
3. **UI**: 거래소 **결과 행마다** 'PoB 복사' 버튼(사용자 확정) — 주입 패턴 재사용, 클릭 시 조립→클립보드+피드백. EN 맵은 **lazy-load**(동적 import)
4. 실제 PoB import 검증(MVP: 희귀 gear) — **gear 아이템 캡처 필요**(서판은 엣지). Designer·QA 페르소나 검증(Phase 3·4) 후 완료 선언
5. 멀티 페르소나: PS Go·Dev Lead 승인 완료(2026-07-03, EN 맵 갱신 스크립트 문서화 조건)

## 현재 상태

- 브랜치: `main` — 이번 세션 3커밋(작업1·2+픽스 / 하네스 / PoB 코어) 후 origin push
- 테스트: **116/116**(vitest, jsdom 포함) · 빌드 통과(content-main 113KB — pobStatMap 미번들)
- 배포: **0.2.0 스토어 심사 중** / 이번 작업들은 0.3.0 대상
- 빌드: `npm run build` → dist/ (해시 변경 시 확장 리로드+F5). dist/·deploy/ gitignore.
- 하네스: `.claude/launch.json`의 `harness`(포트 5199), `test-harness/harness.mjs` 참조
- 검증 제약: 거래소는 **로그인 세션 탭에서만** 패널 마운트 → 라이브 검증은 확장 리로드+F5 수동. 확장은 **dist 폴더** 로드.
- 커밋 작성자: `git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com"`, Co-Authored-By 금지.
- **함정 메모**: 패널은 open shadow root — document 레벨 리스너에서 `e.target.closest` 금지, **`e.composedPath()` 사용** (이번 세션에만 3회 물림)
