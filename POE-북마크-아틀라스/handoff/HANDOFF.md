# 북마크 아틀라스 — 자수정 글래스(Amethyst Glass) 디자인 핸드오프

> **기준 버전: v1.0 (2026-06-23)** · 전체 버전 원장은 루트 `CHANGELOG.md` 참고.
> 디자인 변경은 `디자인 시스템.dc.html`(SSOT) → 산출물 → `CHANGELOG.md` → 이 문서 순서로 반영합니다.

이 패키지는 디자인 프로토타입(`북마크 아틀라스.dc.html`)을 실제 확장
(`poe-bookmark-atlas`, 바닐라 JS + Shadow DOM + `panel.css`)에 반영하기 위한 자료입니다.

테마: **자수정 글래스 (Amethyst Glass)** — 보라(자수정) 글래스모피즘 + 두꺼운 베벨
글래스 카드 + 주기적 글린트(빛 반사). "오로라"(움직이는 그라디언트)는 성능 때문에
폐기하고 GPU 컴포지터 전용 글린트로 대체했습니다.

---

## 0. 포함 파일

```
handoff/
├─ HANDOFF.md            ← 이 문서
├─ panel.css             ← 드롭인 교체본 (기존 클래스명 100% 유지)
└─ icons/
   ├─ mascot-analyst.webp    ← 아이템 시세 마스코트(애널리스트)
   └─ mascot-researcher.webp ← 시장 동향 마스코트(리서처)
```

---

## 1. 즉시 적용 (CSS만 — 리스크 0)

`handoff/panel.css` → `src/content/panel/panel.css` 로 **그대로 교체**하면 됩니다.
JS·데이터 레이어 수정 없이 전체 룩이 자수정 글래스로 바뀝니다.

바뀌는 것:
- 단색 통일 보라-다크 패널 배경 (불투명 .97) — **성능 위해 `backdrop-filter` 미사용**
- 시그니처 바이올렛 상단 테두리, 전 모서리 라운딩 + `overflow:hidden`(스크롤 클립)
- **두꺼운 베벨 글래스 카드**(2px, 상/좌 하이라이트 + 인셋) — "다시 열기" 영역을 명확히
- 폴더를 글래스 카드로 감싸 영역 구분
- **의미별 버튼색**: 생성·저장=바이올렛 / 갱신=블루 / 공유·복사=시안 / 즐겨찾기=앰버 / 삭제·정리=로즈
- 토스트 퇴장 트랜지션, 전역 `:focus-visible`, `prefers-reduced-motion` 대응

> 클래스명은 모두 동일하므로 기존 `panel.js`/`renderList.js`가 그대로 동작합니다.
> 아래 2~8번은 **선택적 기능 추가**이며, panel.css에 해당 스타일이 이미 들어 있어
> 마크업만 추가하면 바로 적용됩니다.

---

## 2. 마스코트 시세 버튼 (아이템 시세 / 시장 동향)

`icons/mascot-*.webp` 2개를 `src/icons/` 에 복사하고, `renderList.js` 상단 import에 추가:

```js
import analystIcon from '../../icons/mascot-analyst.webp'
import researcherIcon from '../../icons/mascot-researcher.webp'
const analystUrl = chrome.runtime.getURL(analystIcon)
const researcherUrl = chrome.runtime.getURL(researcherIcon)
```

`panel.js`의 기존 `.ba-econ` 배너를 아래 2버튼 행으로 교체:

```html
<div class="ba-econ-row">
  <a class="ba-econ-btn items" href="${ECON_ITEMS[game]}" target="_blank" rel="noopener" data-tip="아이템 시세 — 서미누기의 POE 경제 ↗">
    <span class="ba-econ-glint"></span>
    <span class="ba-econ-pic"><img src="${analystUrl}" alt=""></span>
    <span class="ba-econ-lbl"><b>아이템 시세</b></span>
  </a>
  <a class="ba-econ-btn trend" href="${ECON_TREND[game]}" target="_blank" rel="noopener" data-tip="시장 동향 — 서미누기의 POE 경제 ↗">
    <span class="ba-econ-glint"></span>
    <span class="ba-econ-pic"><img src="${researcherUrl}" alt=""></span>
    <span class="ba-econ-lbl"><b>시장 동향</b></span>
  </a>
</div>
```

`ECON` 상수를 시세/동향 2개로 분리:

```js
const ECON_ITEMS = { poe1: 'https://seominugi.com/poe1/economy/items', poe2: 'https://seominugi.com/poe2/economy/items' }
const ECON_TREND = { poe1: 'https://seominugi.com/poe1/economy/trends', poe2: 'https://seominugi.com/poe2/economy/trends' }
```

> 마스코트 import 경로(webp)는 번들러가 처리하도록 기존 divine/exalted와 동일한 패턴을 따릅니다.

---

## 3. 검색 링크 복사 버튼 (.ba-copy — 시안)

`renderList.js`의 `rowHtml()` actions에 복사 버튼 추가(북마크·히스토리 공통):

```js
const copyBtn = `<span class="ba-copy" data-id="${r.id}" data-url="${encodeURIComponent(r.url)}" data-tip="검색 링크 복사">🔗</span>`
```

`bindAll()`에 핸들러:

```js
listEl.querySelectorAll('.ba-copy').forEach((c) =>
  c.addEventListener('click', async (e) => {
    e.stopPropagation()
    const url = decodeURIComponent(c.dataset.url)
    try { await navigator.clipboard.writeText(url); toast('검색 링크를 복사했습니다.') }
    catch (_) {
      const t = document.createElement('textarea'); t.value = url; t.style.position='fixed'; t.style.opacity='0'
      document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t)
      toast('검색 링크를 복사했습니다.')
    }
  }))
```

---

## 4. JSON 내보내기 / 가져오기 (전체 + 폴더 단위, 오래된 북마크 제외)

섹션 헤더 `.ba-sec-actions`에 버튼 추가:

```html
<span class="ba-import" data-tip="JSON에서 북마크 가져오기">⬆</span>
<span class="ba-export" data-tip="북마크를 JSON으로 내보내기 (오래된 북마크 제외)">⬇</span>
```

폴더 헤더 `fActions`(g.id !== null)에 폴더 단위 내보내기:

```html
<span class="ba-folder-export" data-id="${g.id}" data-name="${escapeHtml(g.name)}" data-tip="이 폴더만 JSON으로 내보내기 (오래된 북마크 제외)">⬇</span>
```

`store.js`에 추가할 함수 (IndexedDB/storage 구현에 맞춰):

```js
// 내보내기: folderId === undefined → 전체, null → 미분류, 'fid' → 특정 폴더
// stale(14일↑ 미사용)은 항상 제외하고, 제외 개수를 함께 반환
export async function exportBookmarksJSON(game, folderId) {
  const all = await listByKind('bookmark', game)
  const STALE_MS = 14*24*60*60*1000, now = Date.now()
  let scoped = folderId === undefined ? all : all.filter(b => (b.folderId ?? null) === folderId)
  const total = scoped.length
  scoped = scoped.filter(b => now - (b.lastUsedAt || b.createdAt || b.updatedAt || 0) <= STALE_MS)
  const folders = folderId === undefined ? await listFolders(game)
                : (await listFolders(game)).filter(f => f.id === folderId)
  return { json: { app:'poe-bookmark-atlas', version:1, exportedAt:new Date().toISOString(),
                   game, scope: folderId===undefined?'all':(folderId||'uncategorized'),
                   staleExcluded: total - scoped.length, folders, bookmarks: scoped },
           count: scoped.length, staleExcluded: total - scoped.length }
}

// 가져오기: 같은 dedupeKey 중복은 건너뛰고, 없는 폴더만 생성, 새 id 발급
export async function importBookmarksJSON(game, data) {
  const inB = Array.isArray(data.bookmarks) ? data.bookmarks : []
  const inF = Array.isArray(data.folders) ? data.folders : []
  let added = 0
  for (const f of inF) { /* 없으면 addFolder(f.name, game) (id 매핑 유지) */ }
  for (const b of inB) {
    if (await findBookmark(b.dedupeKey, game)) continue
    await addBookmark({ ...b, game }, b.name || b.title); added++
  }
  return { added }
}
```

`bindAll()` 핸들러(내보내기는 Blob 다운로드, 가져오기는 file input):

```js
function downloadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
// 내보내기
listEl.querySelector('.ba-export')?.addEventListener('click', async () => {
  const { json, count, staleExcluded } = await exportBookmarksJSON(ui.game)
  if (!count) return toast(staleExcluded ? '내보낼 북마크가 없습니다 (모두 오래됨).' : '내보낼 북마크가 없습니다.')
  downloadJSON(json, `bookmark-atlas-${new Date().toISOString().slice(0,10)}.json`)
  toast(`북마크 ${count}개를 내보냈습니다${staleExcluded ? ` (오래된 ${staleExcluded}개 제외)` : ''}.`)
})
listEl.querySelectorAll('.ba-folder-export').forEach((b) => b.addEventListener('click', async (e) => {
  e.stopPropagation()
  const { json, count, staleExcluded } = await exportBookmarksJSON(ui.game, b.dataset.id)
  if (!count) return toast('내보낼 북마크가 없습니다.')
  downloadJSON(json, `bookmark-atlas-${b.dataset.name}-${new Date().toISOString().slice(0,10)}.json`)
  toast(`"${b.dataset.name}" 북마크 ${count}개를 내보냈습니다${staleExcluded ? ` (오래된 ${staleExcluded}개 제외)` : ''}.`)
}))
// 가져오기
listEl.querySelector('.ba-import')?.addEventListener('click', () => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json'
  inp.onchange = () => { const f = inp.files?.[0]; if (!f) return
    const rd = new FileReader()
    rd.onload = async () => { try {
      const { added } = await importBookmarksJSON(ui.game, JSON.parse(rd.result)); changed()
      toast(added ? `${added}개 북마크를 가져왔습니다.` : '중복을 제외하니 추가할 북마크가 없습니다.')
    } catch (_) { toast('JSON 형식이 올바르지 않습니다.') } }
    rd.readAsText(f) }
  inp.click()
})
```

---

## 5. 저장 시 폴더 선택 + 새 폴더 생성

`showNameInput(defaultName)`를 확장해 폴더 선택 칩을 함께 노출하고
`{ name, folderId }`를 반환하도록 변경(드래그 없이 원하는 폴더로 저장).
`.ba-namebar` 안에 칩 컨테이너 마크업:

```html
<div class="ba-folder-pick">
  <span class="lbl">저장 폴더 선택</span>
  <span class="chip active" data-fid="">미분류</span>
  <!-- folders.forEach → <span class="chip" data-fid="${f.id}">${f.name}</span> -->
  <span class="chip new" data-new="1">+ 새 폴더</span>
</div>
```

`+ 새 폴더` 클릭 시 이름 입력칸을 노출하고, 저장 시 `addFolder` → 그 폴더에 저장.
`.ba-save`와 `.ba-folder-save` 모두 이 확장된 입력을 사용합니다.

---

## 6. 폴더 순서 변경 (위/아래)

폴더 헤더 `fActions`에 추가:

```html
<span class="ba-folder-up" data-id="${g.id}" data-tip="폴더 위로">▲</span>
<span class="ba-folder-down" data-id="${g.id}" data-tip="폴더 아래로">▼</span>
```

`store.js`에 `moveFolder(id, dir)` (folders 배열의 order 스왑) 추가 후 `changed()`.

---

## 7. POE1 / POE2 — URL 기반 자동 판버 (토글 아님)

헤더 토글은 **쓰지 않습니다.** 현재 거래소 탭의 URL로 게임 버전을 판별해,
해당 버전의 북마크·히스토리만 보입니다.

```js
// content script / panel 진입 시
function detectGame(href = location.href) {
  // pathofexile.com (POE1) vs pathofexile2 경로·호스트 패턴으로 분기
  return /poe2|pathofexile2|\/poe2\//i.test(href) ? 'poe2' : 'poe1'
}
const game = detectGame()
```

- `listByKind(game, …)` / `listFolders(game)`는 이미 `game` 인자로 분리돼 있어 데이터는 게임별 독립입니다.
- 저장/읽기 모두 `detectGame()` 결과를 그대로 사용 — 사용자가 게임을 수동 전환할 필요가 없습니다.
- `ECON_ITEMS`/`ECON_TREND`도 감지된 `game` 키로 링크를 선택합니다(§2 참고).

> panel.css의 `.ba-game-seg` 룰은 미사용입니다(제거해도 무방). 토글 UI 없이 자동 판버만 쓸 것.

---

## 8. 빈 상태 (empty state)

`renderList.js`에서 북마크가 0개이고 사용자 폴더도 없을 때, 폴더 루프 대신:

```html
<div class="ba-empty-bm">
  <img src="${analystUrl}" alt="">
  <b>저장된 북마크가 없어요</b>
  <small>좋은 검색을 찾으면 상단 <span class="hl">현재 검색 저장</span>으로<br>북마크해 두고 언제든 다시 열어보세요</small>
</div>
```

히스토리 0개일 때 기존 `.ba-empty-sm` 사용.

---

## 9. 다시 열기 = 이름 칩만 클릭 (북마크)

북마크 카드는 전체 클릭 대신 **제목(이름) 칩만** 재검색 트리거로(오클릭 방지).
`rowHtml`에서 북마크 제목을 클릭 칩으로 감싸고, `bindAll`의 행 클릭 핸들러는
`kind==='history'`에만 적용. (히스토리는 전체 클릭 유지)

```js
// 북마크: 이름 칩만
listEl.querySelectorAll('.ba-open').forEach((s) =>
  s.addEventListener('click', (e) => { e.stopPropagation(); location.href = decodeURIComponent(s.closest('.ba-row').dataset.url) }))
```

`.ba-cond`, 액션 버튼 등은 `e.stopPropagation()` 유지.

---

## 10. 확장 아이콘 팝업 + 첫 설치 가이드 투어

**팝업** (`확장 팝업.dc.html` 디자인 참고): manifest `action`에 `default_popup` 추가하고
`popup.html`/`popup.css`/`popup.js` 구성. 내용 = 소개 + 단축키 표 + "패널 열기/접기" +
마스코트 시세 버튼 + "가이드 다시 보기" + "단축키 직접 변경하기"(아래) + 소셜.

**단축키** — manifest에 `commands` 추가:

```jsonc
"commands": {
  "toggle-panel":  { "suggested_key": { "default": "Alt+B" }, "description": "패널 열기/접기" },
  "save-search":   { "suggested_key": { "default": "Alt+S" }, "description": "현재 검색 저장" }
}
```

service-worker에서 `chrome.commands.onCommand`로 content script에 메시지 전달.
"단축키 직접 변경하기" 버튼 → `chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })`
(보안상 `<a href>`로는 못 엶 — 이 API 필수).

**가이드 투어** — 첫 실행 시 패널 위 코치마크 4스텝(자동기록→저장/폴더→재검색·공유→접기).
`chrome.storage.local`의 `tourDone` 플래그로 1회만 노출, 팝업의 "가이드 다시 보기"로 재실행.

---

## 적용 순서 권장

1. **panel.css 교체** (즉시 체감, 무위험) ✅
2. 마스코트 시세 버튼(2) + 빈 상태(8) — 시각적 완성도
3. 복사(3) + 이름 칩 클릭(9) — 오클릭 방지·공유
4. export/import(4) + 저장 폴더 선택(5) + 폴더 순서(6) — store.js 함수 필요
5. POE1/2 URL 자동 판별(7) — `detectGame()`, 토글 UI 없음
6. 팝업 + 단축키 + 투어(10) — manifest·service-worker 작업
7. v1.0 신규 UX/데이터(11) — 검색·정렬·리그·자동이름·폴더색상·soft-stale·중복점프·밀도·가상화

각 단계는 독립적이라 부분 적용해도 깨지지 않습니다.

---

## 11. v1.0 신규 UX / 데이터 (요약)

프로토타입 v1.0에 들어간 신규 기능입니다. 구현 상세 코드는 개발이 해당 단계에
도달했을 때 확장하고, 여기서는 **데이터 모델 영향 + 설계 의도**를 못 박아 둡니다.

### 11-1. 빠른 검색 + 정렬 (북마크·히스토리 각각)
- 섹션 상단 검색창: `name + 조건 텍스트`를 소문자 매칭으로 필터.
- 정렬 분절 토글 — 북마크: 순서(수동 드래그 순)/최근(timeText desc)/이름(localeCompare 'ko'). 히스토리는 시간 역순 고정.
- 검색 시 빈 폴더 자동 숨김, 결과 0건이면 안내 상태.

### 11-2. 리그 태깅 + 불일치 경고
- **데이터**: 북마크에 `league` 필드 추가(저장 시 현재 리그 기록).
- 현재 리그(`detectLeague()` 또는 설정값)와 다르면 카드 흐림 + **"이전 리그"** 배지 → 클릭 시 현재 리그로 재검색하며 `league` 갱신.
- 거래소 파라미터 만료(리그 교체)로 안 열리는 문제의 근본 처리.

### 11-3. 조건 기반 이름 자동 제안
- 저장 다이얼로그 기본값을 조건에서 생성: 유니크명 우선, 없으면 핵심 스탯 2개를 `·`로 결합. 사용자가 수정 가능.

### 11-4. 폴더 색상 구분
- **데이터**: 폴더에 `color` 필드. 헤더 좌측 3px 띠 + 폴더 아이콘 색. 새 폴더 생성 시 5색 팔레트(`#a78bfa #7dd3fc #5eead4 #fbbf24 #fb7185`)에서 선택.

### 11-5. soft-stale (삭제 대신 갱신)
- 오래된 북마크는 즉시 삭제하지 않고 흐림 + **"갱신 필요"** 배지 → 원클릭으로 최근 검색 기준 되살리기(데이터 보존). 리그 불일치 배지와 동일 UI로 통합.

### 11-6. 중복 저장 점프
- 같은 조건(`keyOf`) 재저장 시 새로 만들지 않고 "이미 저장된 검색" 토스트 + 해당 폴더 펼치고 기존 카드 플래시(검색어도 초기화).

### 11-7. 정보 밀도 토글 (여유 / 조밀)
- **상태**: `density`. 여유(기본, 노안 배려: 이름 14.5px·넉넉한 간격) ↔ 조밀(13px·축소). 카드 패딩·간격·이름 크기에 반영. `chrome.storage.local`에 영속화 권장.

### 11-8. 대용량 리스트 대응 ⚡ (저사양 PC 필수)
- 모든 카드에 `content-visibility:auto; contain-intrinsic-size:…` — 화면 밖 카드는 레이아웃·페인트 생략(드래그/이벤트 영향 없음).
- **히스토리 점진 렌더**: 처음 60개만 DOM에 마운트, 하단 "더 보기"로 200개씩 확장(남은 개수 표시). 검색 시 limit 60으로 리셋.
- 의도: 검색이 누적되며 수천 개로 폭증해도 DOM 노드와 초기 마운트 비용을 묶어둠. 노드 실제 제거형 윈도잉은 이걸로 부족할 때만 도입.
