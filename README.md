# 북마크 아틀라스 (poe-bookmark-atlas)

Path of Exile 거래소(거래 검색)용 **검색 북마크 + 검색 히스토리** 관리 크롬 확장 프로그램.
"아틀라스" 제품군(필터 아틀라스 · 스태시 아틀라스)의 신규 멤버입니다.

> **상태: v0.1 구현 완료 (로컬 테스트 단계)** · Manifest V3 · MIT
> 설계 → [`docs/superpowers/specs/2026-06-20-poe-bookmark-atlas-design.md`](docs/superpowers/specs/2026-06-20-poe-bookmark-atlas-design.md) · 계획 → [`docs/superpowers/plans/2026-06-20-poe-bookmark-atlas.md`](docs/superpowers/plans/2026-06-20-poe-bookmark-atlas.md)

## 핵심 기능

- 🔖 **검색 북마크** — 거래 검색을 이름 붙여 저장하고 한 번에 다시 열기
- 🕘 **검색 히스토리** — 최근 검색 자동 기록, ☆로 북마크 승격
- 💰 **가격 스냅샷** — 저장 시점 시세를 `div`·`ex`로 기록. 백엔드 `smng-poe-pricer`의 `compute_sellable_price`와 동일 방법론(동적 하위절사 + P25)이라 economy 사이트와 값이 일관됨
- 📊 **시세 상세** — 직접 구현 대신 [seominugi.com 경제](https://seominugi.com/poe2/economy/items)로 연결

## 대상

- POE1 / POE2 한국 거래소 (`poe.kakaogames.com`)

## 설치 (로컬 / 개발)

빌드 산출물 `dist/` 를 "압축해제된 확장 프로그램"으로 로드합니다.

```bash
npm install
npm run build      # → dist/ 생성
npm test           # 단위 테스트 (vitest)
```

1. `chrome://extensions` → **개발자 모드 ON**
2. **"압축해제된 확장 프로그램 로드"** → **`dist` 폴더**를 선택 (⚠️ 프로젝트 루트가 아니라 `dist`)
3. `poe.kakaogames.com/trade2` 접속 → 우측에 패널이 나타남

> ⚠️ **반드시 `dist` 를 로드**하세요. 프로젝트 루트를 로드하면 `src/`의 ES모듈 소스를 content script로 실행하려다 `Cannot use import statement outside a module` 로 죽습니다. `dist`는 이를 실행 가능한 형태(IIFE)로 번들한 산출물입니다.

## 기술 개요

- Manifest V3 · **Vite + @crxjs/vite-plugin** 빌드 · **Vitest** 테스트
- content script: **MAIN world**에서 거래 `/search`·`/fetch` 요청을 가로채 쿼리·가격 추출 (DOM 비의존)
- service worker: 환율·stats fetch 프록시 · Shadow DOM 우측 도킹 패널
- 저장: `chrome.storage.local`

## 라이선스

[MIT](LICENSE) — 자유롭게 사용 · 포크 · 기여하세요.
