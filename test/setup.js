// 최소 chrome.storage.local 인메모리 목 (store 테스트용)
const mem = new Map()
const changeListeners = []
globalThis.chrome = {
  storage: {
    onChanged: {
      addListener(fn) { changeListeners.push(fn) },
      removeListener(fn) { const i = changeListeners.indexOf(fn); if (i >= 0) changeListeners.splice(i, 1) },
    },
    local: {
      async get(keys) {
        if (keys == null) return Object.fromEntries(mem)
        const k = Array.isArray(keys) ? keys : [keys]
        const out = {}
        for (const key of k) if (mem.has(key)) out[key] = mem.get(key)
        return out
      },
      async set(obj) { for (const [k, v] of Object.entries(obj)) mem.set(k, v) },
      async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((k) => mem.delete(k)) },
      async clear() { mem.clear() },
    },
  },
  runtime: { sendMessage: async () => ({}), onMessage: { addListener() {} }, getURL: (p) => p },
}
globalThis.__resetChromeMock = () => mem.clear()
// 저장소 변경 구독(onChanged)을 검증할 때 쓰는 수동 발화기.
// set()은 일부러 자동 발화하지 않는다 — 그러면 다른 테스트의 리스너가 예기치 않게 깨어난다.
globalThis.__fireStorageChange = (changes, area = 'local') => changeListeners.forEach((fn) => fn(changes, area))
