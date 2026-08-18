# poe-bookmark-atlas — CLAUDE.md

전역 지침(`~/.claude/CLAUDE.md`)을 따른다. 본 문서는 프로젝트 특화 최소 선언만 담는다 (2026-07-07 생성, 작업 축적 시 보강).

## 멀티 페르소나 도메인 (전역 §14)

- **도메인**: Domain-Specific Tool
- **핵심 페르소나**: Product Strategist (커뮤니티 가치) + Designer (Chrome Extension UX)
- **체크리스트**: `D:\github\multi-persona-domain-review-framework\domains\domain-specific-tool\`

## 브랜치 전략 (전역 §4.7)

- **통합 브랜치는 `develop`** (2026-07-22 신설). 개발 커밋은 `develop` 또는 그 하위 작업 브랜치(`feature/*`)에 한다.
- **`main`은 릴리즈 전용** — 직접 커밋 금지. 스토어 심사에 올릴 버전이 확정되면 `develop` → `main` 머지 후 GitHub 릴리즈 태그를 만든다(절차는 `docs/handoff.md` 현재 상태 참조).

## 프로젝트 개요

- PoE 북마크 아틀라스 — Chrome Extension (Manifest V3). v0.1 구현 완료, 로컬 테스트 단계.
- **pathofexile.com 접근 제약 (2026-08-16 재측정 — 아래가 최신)**: 한국 IP에서 브라우저로 `https://www.pathofexile.com/trade/search/Standard` 에 들어가면 **`https://poe.kakaogames.com/login/kakao?redir=%2Ftrade%2Fsearch%2FStandard` 로 리다이렉트된다.** 경로를 `redir` 로 넘겨주는 **서버 쪽 지역 라우팅**이다.
  - **우리 확장은 원인이 아니다** — 그 페이지에 콘텐츠 스크립트가 **주입되지도 않은 상태**(`panelInjected: false`, `ba-cross-notice` 없음, Cloudflare 챌린지 화면 아님)에서 리다이렉트가 일어났다. 당시엔 `optional_host_permissions` 라 기본 미허용이었기 때문(2026-08-18 기본 권한으로 승격 — 아래 참조. 승격 후에도 리다이렉트는 **서버 쪽 지역 라우팅**이라 그대로다).
  - ⚠ 아래 2026-08-05 서술은 **이번 측정과 어긋난다**(그때는 `403 Cf-Mitigated: challenge` · `Location` 없음으로 기록). 서버 동작이 바뀌었거나 당시 측정 조건이 달랐을 수 있다. **판단이 필요하면 그때그때 다시 측정할 것** — 이 줄을 근거로 "리다이렉트는 없다"고 단정하지 말 것.
  - **해외 IP 사용자의 제보는 이것과 별개일 수 있다**(2026-08-16 제보: "확장 프로그램 추가하고 거래소 들어가면 강제로 카카오로 이동"). 해외 IP는 위 지역 라우팅 대상이 아닐 가능성이 큰데, **우리 `popup.js` 가 `TRADE_HOME` 을 카카오로 하드코딩**하고 있어 팝업 버튼이 사용자를 카카오로 보낸다. 한국에서는 재현할 수 없으므로 제보자 환경에서 확인이 필요하다.
  - 챌린지가 반복되며 화면이 깜박이던 원인은 **우리 `page-bridge.js`의 fetch/XHR 후킹**이 봇 점수를 올린 것 — 네이티브 위장으로 완화했다.
  - 한↔영 전환 기능은 **여전히 UI에서 숨김 유지.** 되살리려면 재현 사례가 더 필요하다(현재 재현율이 매우 낮다).
- **글로벌(GGG 계정) 지원 — 1차 구현 완료 (2026-08-16, `a5f9795`)**. 두 호스트 API 실측 결과가 설계 근거다.
  - `filter`·`option`·`static` id 는 **순서까지 동일**, `stat` id 는 **집합 동일**(양쪽 배타 0건) → 언어 중립.
  - ⚠ **`items` 만 다르다**: `type` 이 곧 로컬라이즈된 이름이다(카카오 `파란 진주 목걸이` ↔ GGG `Blue Pearl Amulet`). 내부 id 계열도 표시명이 갈린다(`NonEleBowRangerPhys` → `용병 소환장 (저격수)` vs `Mercenary Warrant (Sniper)`). itemMap 대상 725개 중 공통은 225개뿐.
  - 그래서 **거래소 데이터는 사용자가 보고 있는 호스트에서 받는다** — 콘텐츠 스크립트가 `location.origin` 을 보내고 `tradeApiOrigin()`(lib/tradeSearch.js)이 허용 목록으로 검증한다. **여기에 호스트를 다시 고정하지 말 것.**
  - **`https://www.pathofexile.com/*` 는 기본 `host_permissions` 다 (2026-08-18 승격, 사용자 결정).** 그전엔 `optional_host_permissions` 였는데, 켜지 않은 사용자의 PoB 복사가 **조용히 번역본으로 폴백**해 값이 깨진 채 나갔다(제보 2026-08-18 — 3줄짜리 유니크 mod의 첫 줄 유실 + `+-17%` 부호 겹침 + `Radius: 변수`). 승격 비용은 **스토어 업데이트 시 기존 사용자 1회 재승인**(크롬이 확장을 비활성화한다) — 릴리즈 노트에 반드시 안내할 것.
  - 팝업의 버튼은 **평소 숨김**이고, 사용자가 크롬에서 사이트 접근을 직접 내렸을 때만 '접근 다시 켜기'로 뜬다(`popup.js renderGlobalBtn`). 서비스 워커·콘텐츠 스크립트의 `no-permission` 방어는 **그대로 유지**한다 — 크롬은 기본 권한도 사용자가 내릴 수 있게 한다.
  - **영문 거래소 API 는 한국 IP 에서 열려 있다 (2026-08-18 브라우저 실측)**: `https://www.pathofexile.com/api/trade/data/leagues`·`/api/trade/search/<league>`(POST)·`/api/trade/fetch/<id>` 전부 **인증 없이 200**. 리다이렉트되는 것은 **HTML 페이지 경로뿐**이다. 단 ⚠ **CORS 는 닫혀 있다** — 다른 origin(카카오 페이지)에서 부르면 `Failed to fetch`. 그래서 서비스 워커 + host permission 이 **유일한 경로**다. curl 로는 Cloudflare 가 403 을 주므로 검증은 브라우저에서 할 것.
  - ⏳ **한국에서는 end-to-end 검증 불가** — pathofexile 페이지가 카카오로 리다이렉트돼 글로벌 패널을 띄울 수 없다. 실제 동작은 해외 사용자 확인이 필요하다.
- 패널 라이브 검증은 'POE 브라우저'(테스트 전용)에서 기본 연결한다.
