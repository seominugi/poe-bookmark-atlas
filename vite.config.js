// vite.config.js
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig({
  plugins: [crx({ manifest })],
  // update.html 은 manifest 어디에서도 참조되지 않아(팝업·옵션 페이지가 아니다) crxjs 가 엔트리로 잡지 못한다.
  // 확장이 chrome.windows.create 로 직접 여는 페이지라 web_accessible_resources 도 필요 없다 — 여기서 명시한다.
  build: {
    target: 'esnext',
    rollupOptions: { input: { update: 'src/update/update.html' } },
  },
})
