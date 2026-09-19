# 북마크 아틀라스 (poe-bookmark-atlas)

Path of Exile 거래소(거래 검색)용 **검색 북마크 + 검색 히스토리** 관리 크롬 확장 프로그램.
"아틀라스" 제품군(필터 아틀라스 · 스태시 아틀라스)의 신규 멤버입니다.

> **[⬇ 크롬 웹스토어에서 설치](https://chromewebstore.google.com/detail/poe-%EB%B6%81%EB%A7%88%ED%81%AC-%EC%95%84%ED%8B%80%EB%9D%BC%EC%8A%A4/kjdnpniemjhflpbgfhcjgdenngdpikeh)** · Manifest V3 · Source-available
> 설계 → [`docs/superpowers/specs/2026-06-20-poe-bookmark-atlas-design.md`](docs/superpowers/specs/2026-06-20-poe-bookmark-atlas-design.md) · 계획 → [`docs/superpowers/plans/2026-06-20-poe-bookmark-atlas.md`](docs/superpowers/plans/2026-06-20-poe-bookmark-atlas.md)

> [!IMPORTANT]
> 이 저장소는 코드 투명성과 검토를 위해 공개되어 있으며 **오픈소스가 아닙니다**.
> 열람·분석과 검토 목적의 일시적 로컬 빌드/실행만 허용됩니다. 소스나 변형물을
> 제품·서비스에 재사용하거나 배포·호스팅하려면 저작권자의 사전 서면 허락이
> 필요합니다. 자세한 조건은 [LICENSE](LICENSE)를 확인하세요.
>
> This repository is **source-available, not open source**. Viewing, analysis,
> and temporary local build/run for review are permitted. Reuse in a product or
> service, modification, distribution, or hosting requires prior written
> permission. See [LICENSE](LICENSE).

## 핵심 기능

- 🔖 **검색 북마크** — 거래 검색을 이름 붙여 저장하고 한 번에 다시 열기
- 🕘 **검색 히스토리** — 최근 검색 자동 기록, ☆로 북마크 승격
- 💰 **가격 스냅샷** — 저장 시점 시세를 `div`·`ex`로 기록. 백엔드 `smng-poe-pricer`의 `compute_sellable_price`와 동일 방법론(동적 하위절사 + P25)이라 economy 사이트와 값이 일관됨
- 📊 **시세 상세** — 직접 구현 대신 [seominugi.com 경제](https://seominugi.com/poe2/economy/items)로 연결

## 대상

- POE1 / POE2 한국 거래소 (`poe.kakaogames.com`)

## 설치 (사용자)

**[크롬 웹스토어 — POE 북마크 아틀라스](https://chromewebstore.google.com/detail/poe-%EB%B6%81%EB%A7%88%ED%81%AC-%EC%95%84%ED%8B%80%EB%9D%BC%EC%8A%A4/kjdnpniemjhflpbgfhcjgdenngdpikeh)** 에서 "Chrome에 추가"를 누르면 됩니다.
설치 후 `poe.kakaogames.com/trade`(POE1) 또는 `/trade2`(POE2)에 접속하면 우측에 패널이 나타나고, 첫 실행 시 가이드 투어가 시작됩니다.

소개 영상 대본 → [`docs/영상-소개-대본.md`](docs/영상-소개-대본.md) · 촬영·업로드 메타데이터 → [`docs/영상-촬영-노트.md`](docs/영상-촬영-노트.md)

## 설치 (로컬 / 개발)

[LICENSE](LICENSE)가 허용하는 검토 목적 또는 별도 허락을 받은 개발에 한해,
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

라이선스 전환 커밋 이후의 저장소 스냅샷은
[Seominugi Transparency Source License 1.0](LICENSE)에 따라 공개됩니다.
열람·분석과 검토 목적의 일시적 로컬 빌드/실행은 허용되지만, 그 밖의
복제·수정·재배포·제품/서비스 재사용은 사전 서면 허락이 필요합니다.

Git 태그 `v0.14.1`(커밋 `bce44512ab7f0d0548c2312e621336e9b4f8f6ff`) 및
그 이전 태그에 실제로 포함된 자료는 각 태그에 동봉된 MIT License로 계속
이용할 수 있으며, 이미 부여된 권리는 소급 변경되지 않습니다. 패키지나
매니페스트의 버전 문자열만으로 라이선스 경계를 판단하지 마세요. 제3자 자료의
권리는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 확인하세요.
