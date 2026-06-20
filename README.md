# 북마크 아틀라스 (poe-bookmark-atlas)

Path of Exile 거래소(거래 검색)용 **검색 북마크 + 검색 히스토리** 관리 크롬 확장 프로그램.
"아틀라스" 제품군(필터 아틀라스 · 스태시 아틀라스)의 신규 멤버입니다.

> 🚧 **상태: 설계 확정 (구현 전)**
> 설계 문서 → [`docs/superpowers/specs/2026-06-20-poe-bookmark-atlas-design.md`](docs/superpowers/specs/2026-06-20-poe-bookmark-atlas-design.md)

## 핵심 기능

- 🔖 **검색 북마크** — 거래 검색을 이름 붙여 저장하고 한 번에 다시 열기
- 🕘 **검색 히스토리** — 최근 검색 자동 기록, ☆로 북마크 승격
- 💰 **가격 스냅샷** — 저장 시점 최저가 평균(디바인 환산)을 기록 (시세 변화 참고용)
- 📊 **시세 상세** — 직접 구현 대신 [seominugi.com 경제](https://seominugi.com/poe2/economy/items)로 연결

## 대상

- POE1 / POE2 한국 거래소 (`poe.kakaogames.com`)

## 기술 개요

- Manifest V3 · content script(네트워크 가로채기) · service worker · Shadow DOM 우측 도킹 패널
- 저장: `chrome.storage.local`

## 라이선스

[MIT](LICENSE) — 자유롭게 사용 · 포크 · 기여하세요.
