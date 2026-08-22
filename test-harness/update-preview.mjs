// 업데이트 노트 창(src/update/update.html)을 실제 브라우저에서 확인하는 미리보기.
// 확장 API 만 목으로 채우고 **실제 부트스트랩을 그대로 실행**한다 — 마크업을 여기서 다시 조립하면
// 정작 사용자가 보는 경로는 한 번도 안 돌려본 채 "확인했다"고 말하게 된다.
//
// 열기: npx vite --config vite.harness.config.js → http://localhost:5199/update.html
//   ?all=1 은 전체 이력, 기본은 '아직 안 본 것만'(seen 을 아래에서 조절해 시험한다)
// CSS 는 ?inline 으로 가져와 직접 주입한다 — vite root 가 test-harness 라 <link href="../src/..."> 는 404 다.
// (실제 update.html 은 같은 폴더의 상대 경로라 이 우회가 필요 없다.)
import css from '../src/update/update.css?inline'
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }))

const qs = new URLSearchParams(location.search)
const seen = qs.get('seen') || null

// 설치 버전은 **노트 최신 항목에서 파생**시킨다. notesSince 가 미배포 노트를 거르므로 여기에
// 숫자를 박아 두면 노트를 추가할 때마다 미리보기에서 조용히 사라진다 — 정작 새로 쓴 노트를
// 확인하지 못한 채 "확인했다"고 말하게 된다(2026-08-23: 0.9.2 로 굳어 0.10.0 이 안 보이고 있었다).
// ?v=0.9.0 처럼 넘기면 '그 버전 사용자에게 무엇이 보이는가'를 시험할 수 있다.
const { UPDATE_NOTES } = await import('../src/lib/updateNotes.js')
const version = qs.get('v') || UPDATE_NOTES[0].version

globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version }),
    getURL: (p) => '../' + p,
  },
  storage: {
    local: {
      async get(k) { return seen && (k === 'updateNotesSeen' || (Array.isArray(k) && k.includes('updateNotesSeen'))) ? { updateNotesSeen: seen } : {} },
      async set() {},
    },
  },
}

await import('../src/update/update.js')
