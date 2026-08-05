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
- **pathofexile.com 접근 제약 (2026-08-05 재측정으로 정정)**: 실제로 걸리는 건 **Cloudflare 봇 챌린지**다 — `/trade`·`/trade2` 모두 `403 Cf-Mitigated: challenge`이고 **`Location` 헤더가 없다**(리다이렉트 아님). API 경로(`/api/trade/data/*`)는 200으로 통과한다.
  - 오래 쓰이던 "한국 IP를 카카오로 geo-redirect한다"는 서술은 **측정으로 뒷받침되지 않는다.** 확장을 끄면 pathofexile에 그대로 머문다는 사용자 확인도 있다. (참조하던 메모리 `project_poe_bookmark_atlas_georedirect`는 실재하지 않는다.)
  - 챌린지가 반복되며 화면이 깜박이던 원인은 **우리 `page-bridge.js`의 fetch/XHR 후킹**이 봇 점수를 올린 것 — 네이티브 위장으로 완화했다.
  - 한↔영 전환 기능은 **여전히 UI에서 숨김 유지.** 되살리려면 재현 사례가 더 필요하다(현재 재현율이 매우 낮다).
- 패널 라이브 검증은 'POE 브라우저'(테스트 전용)에서 기본 연결한다.
