// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    // jsdom 기본값은 pretendToBeVisual: false라 el.focus()가 조용히 no-op해 document.activeElement가
    // 갱신되지 않는다(fuzzyPrefix.dom.test.js가 focus 기반 검증에 필요 — 다른 jsdom 테스트는 focus 미사용이라 영향 없음).
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
  },
})
