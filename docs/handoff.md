---
timestamp: 2026-07-01 (Asia/Seoul)
project: poe-bookmark-atlas
---

# poe-bookmark-atlas 핸드오프

POE2 거래소(poe.kakaogames.com) 북마크·히스토리 관리 Chrome MV3 확장 (Vite + @crxjs/vite-plugin). 우측 도킹 Shadow DOM 패널. 제작 브랜드: 서미누기.

## 현재 목표

0.2.0 스토어 심사 대기 중. 첫 사용자 피드백 3건을 다음 버전(0.3.0)으로 개선 — **별도 세션 `task_315e1210`에서 권장 순서 2→3→1로 진행 중**.

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

## 미완료 / 진행 중 작업

### 피드백 3건 개선 (task_315e1210 세션, 2026-07-01~, 권장 순서 2→3→1)

1. **중복 저장 오판 수정** ★먼저(작고 명확)
   - 원인: `src/lib/searchParser.js` `searchIdentity()`가 키에 q.stats(능력치)·가격·유형·이름만 넣고 **otherFilters(경로석 확률·효율·등급·타락 등 type/misc/map 필터 값)를 누락** → 경로석 확률만 40%→120% 바꿔도 "이미 저장됨".
   - 수정: (a) searchIdentity에 비-능력치 필터 값 포함(`filterMap.js` parseQueryFilters 재사용 검토), (b) 중복 시 "덮어쓰기" 액션 제공(`store.js` overwriteBookmark 재사용).

2. **패널 좌측 이동 옵션** (중간 규모)
   - 현재 우측 하드코딩: `panel.css` 52줄(.ba-root right:14px), 79줄(핸들 right:398px), 91줄(collapsed right:0) + `panel.js` applyPagePush 우측 기준.
   - 구현: `uiPanelSide` storage 저장 + `[data-side="left"]` 스코프로 방향 스타일 미러링(패널·핸들·glint·collapsed·페이지밀기).

3. **아이템 → 영문 PoB 복사** ★대형(선행조사 후 착수)
   - **착수 전 확인**: KR trade2 API 아이템에 `item.extended.hashes`(+ mods magnitude) 유무 → 아키텍처 갈림길.
   - 권장 C안: trade stat ID 기준 **ko↔en stat 맵을 seominugi.com 서빙**(EN stat은 pathofexile.com geo-block). base/유니크 KO→EN은 poe-i18n 생성기(`D:\github\poe-i18n-json-data-generator-dev\assets\data\poe2\json`) 활용(단 생성기 mod ID ≠ trade stat ID → 조인 주의).
   - `content-main.js`는 현재 `.item.icon`만 캡처 → 아이템 원본 유지 + per-아이템 "PoB 복사" 버튼(거래소 페이지 표면) 필요. PoB2 텍스트 포맷 조립.
   - MVP: 희귀 아이템 + explicit/implicit + 흔한 base → 확장.

## 현재 상태

- 브랜치: `main` (origin/main 동기화, 최신 커밋 `ae71972`)
- 작업 트리: **clean** (미커밋 없음)
- 배포: **0.2.0 스토어 심사 중** / 0.3.0 개선은 별도 세션 진행
- 빌드: `npm run build` → dist/ (해시 변경 시 확장 리로드+F5). dist/·deploy/ gitignore.
- 검증 제약: 거래소는 **로그인 세션 탭에서만** 패널 마운트, 자동 navigate 새 탭은 카카오 로그인+Cloudflare 차단 → 라이브 검증은 확장 리로드+F5 수동. 확장은 **dist 폴더** 로드(루트 로드 시 import 에러).
- 커밋 작성자: `git -c user.name="서민욱" -c user.email="alsdnr0712@gmail.com"`, Co-Authored-By 금지.
