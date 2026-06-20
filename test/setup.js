// 최소 chrome.storage.local 인메모리 목 (store 테스트용)
const mem = new Map()
globalThis.chrome = {
  storage: {
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
  runtime: { sendMessage: async () => ({}), onMessage: { addListener() {} } },
}
globalThis.__resetChromeMock = () => mem.clear()
