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
}

/** `[[mock:키]]` → 목업 HTML. 모르는 키는 아무것도 내지 않는다(노트가 깨지는 것보다 낫다). */
export function mockHtml(key) {
  const m = MOCKUPS[key]
  if (!m) return ''
  return `<figure class="up-mock">${m.html}${m.caption ? `<figcaption>${m.caption}</figcaption>` : ''}</figure>`
}
