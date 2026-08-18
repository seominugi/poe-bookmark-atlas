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

const seen = new URLSearchParams(location.search).get('seen') || null

globalThis.chrome = {
  runtime: {
    // UPDATE_NOTES 의 최신 항목 이상이어야 노트가 보인다(notesSince 가 미배포 노트를 거른다)
    getManifest: () => ({ version: '0.9.2' }),
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
