import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DATA_LOCK,
  assertGameDataSnapshot,
  resolveLockedGameDataRoot,
} from '../scripts/poe-game-data-lock.mjs'

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function snapshotRoot(snapshot) {
  const root = mkdtempSync(join(tmpdir(), 'poe-game-data-lock-'))
  roots.push(root)
  writeFileSync(join(root, '_index.json'), JSON.stringify({ snapshot }), 'utf8')
  return root
}

describe('poe-game-data 공통 lock', () => {
  it('mutable ref가 아닌 단일 snapshot을 사용한다', () => {
    expect(DATA_LOCK.schemaVersion).toBe(2)
    expect(DATA_LOCK.snapshot).toBe(DATA_LOCK.tag)
    expect(DATA_LOCK.tag).not.toMatch(/^(?:latest|main|master)$/)
  })

  it('명시 경로도 lock과 같은 snapshot만 허용한다', () => {
    const root = snapshotRoot(DATA_LOCK.snapshot)
    expect(resolveLockedGameDataRoot({ env: { POE_GAME_DATA_ROOT: root } })).toBe(root)
    expect(() => assertGameDataSnapshot(snapshotRoot('v2000.01.01'))).toThrow(/snapshot 불일치/)
  })
})
