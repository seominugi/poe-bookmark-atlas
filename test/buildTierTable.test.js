import { describe, it, expect } from 'vitest'
import { verifyClassBridge } from '../scripts/build-tier-table.mjs'
import { MOD_FILE_BY_POB_CLASS } from '../src/lib/itemClass.js'

describe('verifyClassBridge — 부위 대응표 양방향 검증', () => {
  const modFiles = new Set(['Ring', 'Body_Armour', 'Staff'])
  const pobClasses = new Set(['Rings', 'Body Armours', 'Staves'])
  const bridge = { Rings: 'Ring', 'Body Armours': 'Body_Armour', Staves: 'Staff' }

  it('맞으면 문제를 내지 않는다', () => {
    expect(verifyClassBridge(bridge, modFiles, pobClasses)).toEqual([])
  })
  it('없는 modifiers 파일을 지목하면 잡는다', () => {
    const bad = { ...bridge, Wands: 'Wand' }
    expect(verifyClassBridge(bad, modFiles, pobClasses).join(' ')).toMatch(/Wand/)
  })
  it('pobBaseMap 에 없는 클래스를 지목하면 잡는다', () => {
    const bad = { ...bridge, Charms: 'Ring' }
    expect(verifyClassBridge(bad, modFiles, pobClasses).join(' ')).toMatch(/Charms/)
  })
  it('실제 대응표는 31행이다', () => {
    expect(Object.keys(MOD_FILE_BY_POB_CLASS)).toHaveLength(31)
  })
})
