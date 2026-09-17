// src/lib/affixCategory.js
// 속성 목록을 종류끼리 묶는 기준 — 저항은 저항끼리, 생명력·마나는 그것끼리(사용자 요청 2026-09-15).
//
// 판정은 번역문이 아니라 **게임 내부 능력치 이름**(`base_fire_damage_resistance_%`)으로 한다.
// 번역문은 조사·어순이 제각각이라 규칙이 금방 새지만, 내부 이름은 영어 토큰이 일정하다.
// 빌드(scripts/build-tier-table.mjs)가 이 함수로 종류 키를 미리 박아 두고, 화면은 키만 읽는다.
//
// 규칙 순서가 곧 우선순위다 — 한 이름이 여러 규칙에 걸리면 위의 것이 이긴다.
//   소환수 `minion_critical_strike_chance_+%` 는 치명타보다 소환수, `base_life_gained_on_enemy_death` 는
//   생명력보다 회복이 맞다.

export const AFFIX_CATEGORIES = [
  { key: 'minion', label: '소환수·동료·토템', re: /^(minion_|companion_|totem_|allies_in_presence|summon_totem)/ },
  // 적 저항을 깎는 관통은 내 저항이 아니라 피해 쪽이다
  { key: 'damage', label: '피해·상태 이상', re: /penetrat|reduce_enemy/ },
  { key: 'resist', label: '저항', re: /resist/ }, // resistance · base_resist_all_elements
  { key: 'attribute', label: '능력치', re: /^additional_(strength|dexterity|intelligence|all_attributes)|attribute_requirements/ },
  { key: 'recovery', label: '회복·흡수', re: /leech|gained_on|_on_kill|gain_per_target|regeneration|recharge|recover|goes_to_(life|mana)|on_enemy_death/ },
  { key: 'resource', label: '생명력·마나·정신력', re: /maximum_life|maximum_mana|spirit/ },
  { key: 'defence', label: '방어', re: /armour|evasion|energy_shield|physical_damage_reduction|block|deflection|threshold/ },
  { key: 'flask', label: '플라스크·호신부', re: /flask|charm/ },
  { key: 'added', label: '피해 추가', re: /added_[a-z]+_damage|thorns_minimum/ },
  { key: 'crit', label: '정확도·치명타', re: /critical_strike|accuracy/ },
  { key: 'skill', label: '스킬 레벨', re: /gem_level|skill_level/ },
  { key: 'grant', label: '스킬 부여', re: /(?!)/ }, // 모드 이름으로는 판정하지 않는다 — 빌드(skillGrantPool)가 키를 직접 박는다. 이름·순서용
  { key: 'speed', label: '속도', re: /speed|velocity|cooldown/ },
  { key: 'damage', label: '피해·상태 이상', re: /damage|ailment|ignite|bleed|poison|shock|chill|freeze|curse|mark_|stun|daze|blind|incision|pin_/ },
  { key: 'other', label: '기타', re: /.*/ },
]

// 규칙 순서(판정 우선순위)와 화면 순서는 다르다 — 같은 키가 규칙 두 곳에 있을 수 있다(피해: 관통 + 일반).
// 화면은 사용자가 먼저 찾는 것부터: 방어 쪽(저항·생명력·방어) → 공격 쪽 → 기타.
const DISPLAY_ORDER = ['resist', 'resource', 'defence', 'attribute', 'added', 'damage', 'crit', 'speed', 'skill', 'grant', 'recovery', 'minion', 'flask', 'other']
const ORDER = new Map(DISPLAY_ORDER.map((k, i) => [k, i]))
const LABEL = new Map(AFFIX_CATEGORIES.map((c) => [c.key, c.label]))

/** 게임 내부 능력치 이름 → 종류 키. 모르면 'other'. */
export function affixCategoryOf(statName) {
  const name = String(statName ?? '')
  return AFFIX_CATEGORIES.find((c) => c.re.test(name))?.key ?? 'other'
}

/** 종류 키 → 화면 이름. 모르는 키는 기타로 본다. */
export function affixCategoryLabel(key) {
  return LABEL.get(key) ?? LABEL.get('other')
}

/**
 * 항목을 종류별로 묶는다. 묶음 순서는 AFFIX_CATEGORIES 순서, 묶음 안 순서는 들어온 순서를 지킨다.
 * @template T
 * @param {T[]} items
 * @param {(item:T)=>string|undefined} keyOf
 * @returns {Array<{key:string, label:string, items:T[]}>}
 */
export function groupByCategory(items, keyOf) {
  const buckets = new Map()
  for (const item of items) {
    const raw = keyOf(item)
    const key = ORDER.has(raw) ? raw : 'other'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(item)
  }
  return [...buckets.entries()]
    .sort((a, b) => ORDER.get(a[0]) - ORDER.get(b[0]))
    .map(([key, list]) => ({ key, label: affixCategoryLabel(key), items: list }))
}
