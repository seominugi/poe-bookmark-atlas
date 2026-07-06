# poe-bookmark-atlas — CLAUDE.md

전역 지침(`~/.claude/CLAUDE.md`)을 따른다. 본 문서는 프로젝트 특화 최소 선언만 담는다 (2026-07-07 생성, 작업 축적 시 보강).

## 멀티 페르소나 도메인 (전역 §14)

- **도메인**: Domain-Specific Tool
- **핵심 페르소나**: Product Strategist (커뮤니티 가치) + Designer (Chrome Extension UX)
- **체크리스트**: `D:\github\multi-persona-domain-review-framework\domains\domain-specific-tool\`

## 프로젝트 개요

- PoE 북마크 아틀라스 — Chrome Extension (Manifest V3). v0.1 구현 완료, 로컬 테스트 단계.
- **알려진 제약**: pathofexile.com 이 한국 IP 를 카카오게임즈로 geo-redirect 하므로 한↔영 거래소 전환류 기능은 차단됨 (메모리 `project_poe_bookmark_atlas_georedirect` 참조).
- 패널 라이브 검증은 'POE 브라우저'(테스트 전용)에서 기본 연결한다.
