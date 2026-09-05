// 업데이트 노트용 목업 — 글로만 읽으면 "그게 어디 있는데?" 가 되는 기능을 그림으로 보인다.
// 예: '북마크 ⋯ → 라이브로 열기' 는 ⋯ 가 어디인지 모르면 아무 말도 아니다(사용자 요청 2026-08-18).
//
// 실제 UI 를 **축약해 흉내낸다** — 진짜 패널 CSS 는 Shadow DOM 안이라 여기서 못 쓴다.
// 픽셀 단위로 맞추려 들지 말 것: 목적은 **위치와 관계**를 알려주는 것이고, 실제 UI 가 조금 바뀌어도
// 목업이 곧장 거짓이 되지 않아야 한다. 아이콘만 진짜 세트(lib/icons.js)를 그대로 쓴다.
//
// 노트 본문에서 `[[mock:키]]` 한 줄로 불러온다(update.js mdToHtml).
import { icon } from '../lib/icons.js'

const card = (inner) => `<div class="mk-card">${inner}</div>`

export const MOCKUPS = {
  // 북마크 카드의 ⋯ 를 눌렀을 때 뜨는 액션 목록에서 '라이브로 열기' 의 자리
  'live-open': {
    caption: '북마크 카드의 <b>⋯</b> 를 누르면 나오는 메뉴',
    html: card(`
      <div class="mk-line">
        <span class="mk-ic">${icon('grip', 13)}</span>
        <span class="mk-open">${icon('search', 12)}<b>화염 저항 반지</b></span>
        <span class="mk-price">≈ 24</span>
        <span class="mk-more mk-point">${icon('more', 15)}</span>
      </div>
      <div class="mk-pop">
        <div class="mk-act mk-point">${icon('refresh', 12)}라이브로 열기</div>
        <div class="mk-act">${icon('link', 12)}링크 복사</div>
        <div class="mk-act">${icon('pencil', 12)}이름 변경</div>
        <div class="mk-act">${icon('trash', 12)}삭제</div>
      </div>
      <div class="mk-note">이름을 <b>Shift 클릭</b> 해도 같습니다</div>`),
  },

  // 설정 모달의 '검색 열기' 행
  'open-target': {
    caption: '패널 <b>설정</b>(Alt+O) 안의 선택지',
    html: card(`
      <div class="mk-set">
        <span class="mk-set-lbl">검색 열기</span>
        <span class="mk-seg"><span class="mk-opt is-on">현재 탭</span><span class="mk-opt">새 탭</span></span>
      </div>
      <div class="mk-note"><b>Ctrl 클릭</b> 은 언제나 반대로 엽니다</div>`),
  },

  // 같은 북마크가 '기본' 과 '간략' 에서 어떻게 보이는지 나란히
  'brief-view': {
    caption: '같은 북마크를 <b>기본</b> 과 <b>간략</b> 으로 본 모습',
    html: `<div class="mk-pair">
      <div class="mk-side">
        <div class="mk-side-lbl">기본</div>
        ${card(`
          <div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>화염 저항 반지</b></span><span class="mk-price">≈ 24</span></div>
          <div class="mk-line mk-sub"><span class="mk-chip">${icon('search', 11)}조건 4개 · 화염 저항 30+</span></div>`)}
        ${card(`
          <div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>생명력 갑옷</b></span><span class="mk-price">≈ 8</span></div>
          <div class="mk-line mk-sub"><span class="mk-chip">${icon('search', 11)}조건 3개 · 최대 생명력 80+</span></div>`)}
      </div>
      <div class="mk-side">
        <div class="mk-side-lbl">간략</div>
        ${card(`<div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>화염 저항 반지</b></span><span class="mk-chip mk-chip--tight">${icon('search', 11)}</span><span class="mk-price">≈ 24</span></div>`)}
        ${card(`<div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>생명력 갑옷</b></span><span class="mk-chip mk-chip--tight">${icon('search', 11)}</span><span class="mk-price">≈ 8</span></div>`)}
        ${card(`<div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>카오스 단검</b></span><span class="mk-chip mk-chip--tight">${icon('search', 11)}</span><span class="mk-price">≈ 3</span></div>`)}
        ${card(`<div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>이동 속도 장화</b></span><span class="mk-chip mk-chip--tight">${icon('search', 11)}</span><span class="mk-price">≈ 12</span></div>`)}
      </div>
    </div>
    <div class="mk-note">조건·가격은 사라지지 않고 아이콘으로 접힙니다 — 마우스를 올리면 전체가 보여요</div>`,
  },

  // ── 폭 밴드 (0.11.0) ─────────────────────────────────────────────
  // 넓히면 여러 줄이 한 줄로 합쳐진다. 좁은 쪽과 넓은 쪽의 **폭을 실제로 다르게** 그린다 —
  // 같은 너비 두 칸으로 그리면 '넓어져서 합쳐진다'는 인과가 사라진다.
  'width-bands': {
    caption: '같은 화면을 <b>기본</b> 과 <b>더 넓게</b> 로 본 모습',
    html: `<div class="mk-w">
      <div class="mk-w-narrow">
        <div class="mk-side-lbl">기본</div>
        ${card(`
          <div class="mk-row"><span class="mk-btn mk-btn--save">${icon('bookmark', 11)}현재 검색 저장</span></div>
          <div class="mk-row"><span class="mk-btn mk-btn--items">아이템 시세</span><span class="mk-btn mk-btn--trend">시장 동향</span></div>
          <div class="mk-row" style="margin-top:10px"><span class="mk-title">${icon('bookmark', 12)}북마크<span class="mk-count">12</span></span><span class="mk-sort" style="margin-left:auto"><span>순서</span><span class="is-on">최근</span><span>이름</span></span></div>
          <div class="mk-row"><span class="mk-search">${icon('search', 11)}북마크·히스토리 검색</span></div>`)}
      </div>
      <div>
        <div class="mk-side-lbl">더 넓게</div>
        ${card(`
          <div class="mk-row"><span class="mk-btn mk-btn--save">${icon('bookmark', 11)}현재 검색 저장</span><span class="mk-btn mk-btn--items">아이템 시세</span><span class="mk-btn mk-btn--trend">시장 동향</span></div>
          <div class="mk-row" style="margin-top:10px"><span class="mk-title">${icon('bookmark', 12)}북마크<span class="mk-count">12</span></span><span class="mk-search">${icon('search', 11)}북마크·히스토리 검색</span><span class="mk-sort"><span>순서</span><span class="is-on">최근</span><span>이름</span></span></div>
          <div class="mk-row" style="margin-top:10px"><span class="mk-open">${icon('search', 12)}<b>화염 저항 반지</b></span><span class="mk-chip">${icon('search', 11)}조건 4개 · 화염 저항 30+</span><span class="mk-price">≈ 24</span><span class="mk-more">${icon('more', 14)}</span></div>`)}
      </div>
    </div>
    <div class="mk-note">위아래로 접혀 있던 줄이 한 줄로 서고, <b>카드도 한 줄</b>이 됩니다 — 숨기는 게 아니라 자리만 옮깁니다</div>`,
  },

  // 폭을 고르는 두 경로 — 설정 세그먼트(발견 가능) + 드래그 배지(하던 대로)
  'width-preset': {
    caption: '패널 <b>설정</b>(Alt+O) 의 새 항목',
    html: card(`
      <div class="mk-set">
        <span class="mk-set-lbl">패널 폭</span>
        <span class="mk-seg"><span class="mk-opt">기본</span><span class="mk-opt is-on">넓게</span><span class="mk-opt">더 넓게</span><span class="mk-opt is-off">최대</span></span>
      </div>
      <div class="mk-note">창이 좁아 쓸 수 없는 단계는 이렇게 <b>흐리게</b> 표시됩니다</div>
      <div class="mk-row" style="margin-top:11px">
        <span class="mk-badge">
          <span class="mk-badge-now">512px · <i>넓게</i></span>
          <span class="mk-badge-next">▸ 128px 더 넓히면 카드가 한 줄로 접혀요</span>
        </span>
      </div>
      <div class="mk-note">가장자리를 <b>끌어서</b> 맞출 때는 다음 단계까지 얼마나 남았는지 알려드려요</div>`),
  },

  // 가장 넓게 뒀을 때 카드에 나오는 버튼 셋
  'width-actions': {
    caption: '<b>최대</b> 로 두면 카드에 바로 나오는 버튼',
    html: card(`
      <div class="mk-line">
        <span class="mk-open">${icon('search', 12)}<b>화염 저항 반지</b></span>
        <span class="mk-chip">${icon('search', 11)}조건 4개 · 화염 저항 30+</span>
        <span class="mk-actbar mk-point" style="padding:3px">
          <span class="mk-actic mk-actic--live">${icon('play', 11)}</span>
          <span class="mk-actic mk-actic--copy">${icon('link', 11)}</span>
          <span class="mk-actic mk-actic--over">${icon('refresh', 11)}</span>
        </span>
        <span class="mk-more">${icon('more', 14)}</span>
      </div>
      <div class="mk-note">왼쪽부터 <b>라이브로 열기</b> · <b>링크 복사</b> · <b>최근 검색으로 갱신</b> — 이름 변경·폴더 이동·삭제는 실수를 막기 위해 <b>⋯</b> 에 그대로 둡니다</div>`),
  },

  // ── 동기화 (0.12.0) ──────────────────────────────────────────────
  // 제보: "가져오기로 덮어쓰는 형식으로 수동 동기화 중인데 거듭될수록 지저분해져요."
  // 글로 "합치기는 없는 것만 더합니다" 라고 써 봐야 **왜 쌓이는지**가 안 온다 — 지운 항목이
  // 살아남는 장면을 눈으로 보여야 한다. 그래서 같은 파일을 두 방식으로 가져온 **결과를 나란히** 놓는다.
  'sync-merge-replace': {
    caption: '집에서 <b>생명력 갑옷</b> 을 지우고 내보낸 파일을, 직장에서 가져왔을 때',
    html: `
      ${card(`
        <div class="mk-row" style="margin-bottom:7px"><span class="mk-title">${icon('upload', 12)}집에서 내보낸 파일<span class="mk-count">2</span></span></div>
        <div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>화염 저항 반지</b></span></div>
        <div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>카오스 단검</b></span></div>`)}
      <div class="mk-step">${icon('chevronDown', 12)}직장에서 가져오기</div>
      <div class="mk-pair">
        <div class="mk-side">
          <div class="mk-side-lbl">합치기</div>
          ${card(`
            <div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>화염 저항 반지</b></span></div>
            <div class="mk-line mk-ghost"><span class="mk-open">${icon('search', 12)}<b>생명력 갑옷</b></span><span class="mk-tag">지웠는데 남음</span></div>
            <div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>카오스 단검</b></span></div>`)}
        </div>
        <div class="mk-side">
          <div class="mk-side-lbl">교체</div>
          ${card(`
            <div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>화염 저항 반지</b></span></div>
            <div class="mk-line"><span class="mk-open">${icon('search', 12)}<b>카오스 단검</b></span></div>
            <div class="mk-line mk-ok">${icon('check', 11)}집과 똑같아졌어요</div>`)}
        </div>
      </div>
      <div class="mk-note">합치기는 <b>없는 것만 더합니다</b> — 파일에 <em>없는</em> 항목은 손대지 않아요. 그래서 저쪽에서 지운 것·이름을 바꾼 것이 계속 남아 쌓입니다.</div>`,
  },

  // 폴더 헤더의 새 빗자루. 미분류에 **액션이 하나도 없었다**는 게 제보의 두 번째 문장이라,
  // 미분류와 실폴더를 **같이** 보여야 "미분류에도 생겼다" 가 전달된다.
  'folder-clear': {
    caption: '폴더 이름 옆에 생긴 <b>빗자루</b>',
    html: `
      ${card(`
        <div class="mk-fold">
          <span class="mk-fold-name">${icon('chevronRight', 11)}${icon('folder', 13)}미분류<span class="mk-count">14</span></span>
          <span class="mk-facts"><span class="mk-point">${icon('broom', 12)}</span></span>
        </div>`)}
      ${card(`
        <div class="mk-fold">
          <span class="mk-fold-name">${icon('chevronRight', 11)}${icon('folder', 13)}유니크<span class="mk-count">6</span></span>
          <span class="mk-facts"><span class="mk-fic">${icon('pencil', 12)}</span><span class="mk-fic">${icon('download', 12)}</span><span class="mk-point">${icon('broom', 12)}</span><span class="mk-fic mk-fic--del">${icon('trash', 12)}</span></span>
        </div>`)}
      <div class="mk-note"><b>빗자루</b> 는 폴더를 남기고 <b>안의 북마크만</b> 지웁니다. <b>휴지통</b> 은 폴더를 없애고 북마크를 미분류로 옮겨요 — 미분류가 쌓이던 이유입니다. 폴더째 없애시려면 <b>빗자루 → 휴지통</b> 순서로 누르세요.</div>`,
  },

  // 결과 행 버튼 겹침. 증상이 **위치**라 글로는 안 온다 — 겹친 모습을 실제로 겹쳐 그린다.
  // 0.13.0 — 섹션 순서·접기. "제목을 누르면 접힌다" 는 글로만 읽으면 어디를 누르라는 건지 모른다.
  'sec-order': {
    caption: '목록의 <b>제목 줄</b> — 누르면 접히고, 순서는 설정에서 바꿉니다',
    html: `
      ${card(`
        <div class="mk-fold">
          <span class="mk-fold-name">${icon('chevronRight', 11)}${icon('bookmark', 13)}<span class="mk-point">북마크</span><span class="mk-count">42</span></span>
          <span class="mk-facts"><span class="mk-chip mk-chip--tight">접힘</span></span>
        </div>
        <div class="mk-fold">
          <span class="mk-fold-name">${icon('chevronDown', 11)}${icon('star', 13)}찜한 매물<span class="mk-count">12</span></span>
        </div>
        <div class="mk-fold">
          <span class="mk-fold-name">${icon('chevronDown', 11)}${icon('clock', 13)}히스토리<span class="mk-count">60</span></span>
        </div>`)}
      <div class="mk-note">접어도 <b>개수는 남습니다</b>. 북마크를 접어도 <b>검색창은 그대로</b>예요 — 그 검색은 히스토리까지 찾아 주거든요.</div>`,
  },

  // 0.13.0 — 찜 일괄 확인. 버튼의 자리와 '도는 중' 모습을 같이 보여야 중단이 가능한 걸 안다.
  'watch-bulk': {
    caption: '<b>찜한 매물</b> 제목 줄 오른쪽',
    html: `
      ${card(`
        <div class="mk-fold">
          <span class="mk-fold-name">${icon('chevronDown', 11)}${icon('star', 13)}찜한 매물<span class="mk-count">12</span></span>
          <span class="mk-facts"><span class="mk-chip mk-chip--tight mk-point">${icon('refresh', 11)}전체 확인</span></span>
        </div>
        <div class="mk-line">
          <span class="mk-open">${icon('clock', 11)}<b>12개</b>를 확인한 지 오래됐어요</span>
          <span class="mk-chip mk-chip--tight mk-point">지금 확인</span>
        </div>`)}
      ${card(`
        <div class="mk-fold">
          <span class="mk-fold-name">${icon('chevronDown', 11)}${icon('star', 13)}찜한 매물<span class="mk-count">12</span></span>
          <span class="mk-facts"><span class="mk-chip mk-chip--tight mk-point">${icon('x', 11)}중단 (5/12)</span></span>
        </div>`)}
      <div class="mk-note">도는 동안 <b>몇 개째인지</b> 보이고, <b>다시 누르면 멈춥니다</b>.</div>`,
  },

  'row-btn-fix': {
    caption: '거래소 검색 결과에서 <b>★ · PoB</b> 버튼의 자리',
    html: `<div class="mk-pair">
      <div class="mk-side">
        <div class="mk-side-lbl">그동안</div>
        ${card(`
          <div class="mk-res">
            <span class="mk-res-img">${icon('layers', 17)}</span>
            <span class="mk-res-body">
              <span class="mk-res-stat">적용 반경: 대형</span>
              <span class="mk-res-stat">아이템 레벨: 85</span>
              <span class="mk-res-stat">화염 저항 +42%</span>
            </span>
            <span class="mk-res-btns mk-res-over">${icon('star', 10)}<b>PoB</b></span>
          </div>`)}
      </div>
      <div class="mk-side">
        <div class="mk-side-lbl">이제</div>
        ${card(`
          <div class="mk-res">
            <span class="mk-res-col">
              <span class="mk-res-img">${icon('layers', 17)}</span>
              <span class="mk-res-btns">${icon('star', 10)}<b>PoB</b></span>
            </span>
            <span class="mk-res-body">
              <span class="mk-res-stat">적용 반경: 대형</span>
              <span class="mk-res-stat">아이템 레벨: 85</span>
              <span class="mk-res-stat">화염 저항 +42%</span>
            </span>
          </div>`)}
      </div>
    </div>
    <div class="mk-note">일부 매물에서 버튼이 <b>아이템 설명 위로 떠올라</b> 글자를 가렸습니다. 이제 언제나 <b>그림 아래</b> 제자리에 붙습니다.</div>`,
  },
}

/** `[[mock:키]]` → 목업 HTML. 모르는 키는 아무것도 내지 않는다(노트가 깨지는 것보다 낫다). */
export function mockHtml(key) {
  const m = MOCKUPS[key]
  if (!m) return ''
  return `<figure class="up-mock">${m.html}${m.caption ? `<figcaption>${m.caption}</figcaption>` : ''}</figure>`
}
