import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const DATA_LOCK = JSON.parse(
  readFileSync(new URL('../poe-game-data.lock.json', import.meta.url), 'utf8')
)

if (DATA_LOCK.schemaVersion !== 2 || DATA_LOCK.snapshot !== DATA_LOCK.tag) {
  throw new Error('poe-game-data lock 계약이 올바르지 않습니다.')
}

function findSibling(startDir, name) {
  let directory = startDir
  for (;;) {
    const candidate = join(directory, name)
    try {
      if (statSync(candidate).isDirectory()) return candidate
    } catch { /* 상위 디렉토리에서 계속 탐색 */ }
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

export function assertGameDataSnapshot(root) {
  let index
  try {
    index = JSON.parse(readFileSync(join(root, '_index.json'), 'utf8'))
  } catch (error) {
    throw new Error(`poe-game-data 루트 index를 읽지 못했습니다: ${root} (${error.message})`)
  }
  if (index.snapshot !== DATA_LOCK.snapshot) {
    throw new Error(
      `poe-game-data snapshot 불일치: ${index.snapshot ?? '<missing>'} != ${DATA_LOCK.snapshot}`
    )
  }
  return root
}

export function resolveLockedGameDataRoot({ startDir, env = process.env } = {}) {
  const configured = env.POE_GAME_DATA_ROOT
  const root = configured
    ? resolve(configured)
    : findSibling(startDir ?? process.cwd(), 'poe-game-data')
  if (!root) {
    throw new Error(
      'poe-game-data 를 찾지 못했습니다. 이웃 저장소로 클론하거나 POE_GAME_DATA_ROOT를 지정하세요.'
    )
  }
  return assertGameDataSnapshot(root)
}
