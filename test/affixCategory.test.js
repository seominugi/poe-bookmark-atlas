import { describe, it, expect } from 'vitest'
import { affixCategoryOf, affixCategoryLabel, groupByCategory } from '../src/lib/affixCategory.js'
import realAffixes from '../src/lib/statAffixes.poe2.json'

describe('affixCategoryOf — 게임 내부 능력치 이름으로 종류를 가른다', () => {
  const cases = [
    ['base_fire_damage_resistance_%', 'resist'],
    ['base_resist_all_elements_%', 'resist'],
    ['additional_dexterity', 'attribute'],
    ['local_attribute_requirements_+%', 'attribute'],
    ['base_maximum_life', 'resource'],
    ['base_spirit_from_equipment', 'resource'],
    ['local_energy_shield_+%', 'defence'],
    ['local_armour_and_evasion_+%', 'defence'],
    ['attack_minimum_added_fire_damage', 'added'],
    ['critical_strike_chance_+%', 'crit'],
    ['accuracy_rating', 'crit'],
    ['attack_speed_+%', 'speed'],
    ['melee_skill_gem_level_+', 'skill'],
    ['physical_damage_+%', 'damage'],
    ['base_item_found_rarity_+%', 'other'],
    ['', 'other'],
  ]
  it.each(cases)('%s → %s', (name, key) => {
    expect(affixCategoryOf(name)).toBe(key)
  })

  // 여러 규칙에 걸리는 이름 — 위의 규칙이 이긴다. 순서를 바꾸면 여기가 깨진다.
  it('소환수 치명타는 치명타가 아니라 소환수', () => {
    expect(affixCategoryOf('minion_critical_strike_chance_+%')).toBe('minion')
  })
  it('처치 시 생명력 획득은 생명력이 아니라 회복', () => {
    expect(affixCategoryOf('base_life_gained_on_enemy_death')).toBe('recovery')
  })
  it('소환수 저항은 저항이 아니라 소환수', () => {
    expect(affixCategoryOf('minion_elemental_resistance_%')).toBe('minion')
  })
  it('적 저항 관통은 저항이 아니라 피해', () => {
    expect(affixCategoryOf('base_reduce_enemy_cold_resistance_%')).toBe('damage')
    expect(affixCategoryOf('cold_resistance_penetration_%')).toBe('damage')
  })
  it('격분 충전은 플라스크가 아니다', () => {
    expect(affixCategoryOf('max_frenzy_charges')).not.toBe('flask')
  })
})

describe('groupByCategory', () => {
  it('묶음은 정해진 순서, 묶음 안은 들어온 순서', () => {
    const items = [{ k: 'attribute', n: 1 }, { k: 'resist', n: 2 }, { k: 'attribute', n: 3 }, { k: 'nope', n: 4 }]
    expect(groupByCategory(items, (i) => i.k).map((g) => [g.key, g.label, g.items.map((i) => i.n)])).toEqual([
      ['resist', '저항', [2]],
      ['attribute', '능력치', [1, 3]],
      ['other', '기타', [4]],
    ])
  })
  it('화면 순서: 저항 → 생명력 → 방어 → … → 피해 (판정 규칙 순서와 무관)', () => {
    const items = ['damage', 'defence', 'resist', 'resource'].map((k) => ({ k }))
    expect(groupByCategory(items, (i) => i.k).map((g) => g.key)).toEqual(['resist', 'resource', 'defence', 'damage'])
  })
  it('모르는 키의 이름은 기타', () => {
    expect(affixCategoryLabel('nope')).toBe('기타')
  })
})

describe('실제 데이터', () => {
  it('모든 능력치에 종류 키가 있다', () => {
    for (const [cls, v] of Object.entries(realAffixes)) {
      for (const id of [...v.p, ...v.s]) expect(v.c[id], `${cls} ${id}`).toBeTruthy()
    }
  })
  it('타락 속성은 인챈트 id 이고 값 범위·종류가 있다', () => {
    const x = realAffixes.Ring.x
    expect(Object.keys(x).length).toBeGreaterThan(5)
    for (const [id, v] of Object.entries(x)) {
      expect(id).toMatch(/^enchant\.stat_\d+$/)
      expect(v.v.length).toBeGreaterThan(0)
      expect(v.c).toBeTruthy()
    }
  })
})
