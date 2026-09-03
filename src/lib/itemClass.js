// src/lib/itemClass.js
// 거래소 검색 조건 → 부위(modifiers 파일명).
//
// 왜 표를 손으로 쓰나: 자동 단수화가 PoE2 에서 네 군데 깨진다 —
//   Staves↔Staff · Quarterstaves↔Warstaff · Foci↔Focus · LifeFlask(구분자 없음).
// 규칙으로 덮으려다 조용히 틀리느니 표로 못박고 빌드에서 검증한다(scripts/build-tier-table.mjs).

/** 거래소 유형 필터의 구체 category → modifiers 파일명. 묶음(weapon·armour·weapon.onemelee 등)은 담지 않는다. */
export const MOD_FILE_BY_CATEGORY = {
  'weapon.claw': 'Claw',
  'weapon.dagger': 'Dagger',
  'weapon.onesword': 'One_Hand_Sword',
  'weapon.oneaxe': 'One_Hand_Axe',
  'weapon.onemace': 'One_Hand_Mace',
  'weapon.spear': 'Spear',
  'weapon.flail': 'Flail',
  'weapon.twosword': 'Two_Hand_Sword',
  'weapon.twoaxe': 'Two_Hand_Axe',
  'weapon.twomace': 'Two_Hand_Mace',
  'weapon.warstaff': 'Warstaff',
  'weapon.talisman': 'Talisman',
  'weapon.bow': 'Bow',
  'weapon.crossbow': 'Crossbow',
  'weapon.wand': 'Wand',
  'weapon.sceptre': 'Sceptre',
  'weapon.staff': 'Staff',
  'armour.helmet': 'Helmet',
  'armour.chest': 'Body_Armour',
  'armour.gloves': 'Gloves',
  'armour.boots': 'Boots',
  'armour.quiver': 'Quiver',
  'armour.shield': 'Shield',
  'armour.focus': 'Focus',
  'armour.buckler': 'Buckler',
  'accessory.amulet': 'Amulet',
  'accessory.belt': 'Belt',
  'accessory.ring': 'Ring',
  'flask.life': 'LifeFlask',
  'flask.mana': 'ManaFlask',
}

/** 점이 없지만 부위가 하나로 정해지는 category. */
const FLAT_CATEGORY = { jewel: 'Jewel' }

/** pobBaseMap 의 PoB 클래스명 → modifiers 파일명. */
export const MOD_FILE_BY_POB_CLASS = {
  'Amulets': 'Amulet',
  'Belts': 'Belt',
  'Rings': 'Ring',
  'Talismans': 'Talisman',
  'Body Armours': 'Body_Armour',
  'Boots': 'Boots',
  'Gloves': 'Gloves',
  'Helmets': 'Helmet',
  'Shields': 'Shield',
  'Bucklers': 'Buckler',
  'Quivers': 'Quiver',
  'Foci': 'Focus',
  'Bows': 'Bow',
  'Crossbows': 'Crossbow',
  'Claws': 'Claw',
  'Daggers': 'Dagger',
  'Flails': 'Flail',
  'One Hand Axes': 'One_Hand_Axe',
  'One Hand Maces': 'One_Hand_Mace',
  'One Hand Swords': 'One_Hand_Sword',
  'Two Hand Axes': 'Two_Hand_Axe',
  'Two Hand Maces': 'Two_Hand_Mace',
  'Two Hand Swords': 'Two_Hand_Sword',
  'Spears': 'Spear',
  'Sceptres': 'Sceptre',
  'Staves': 'Staff',
  'Quarterstaves': 'Warstaff',
  'Wands': 'Wand',
  'Jewels': 'Jewel',
  'Life Flasks': 'LifeFlask',
  'Mana Flasks': 'ManaFlask',
}

/** @returns {string|null} modifiers 파일명, 부위를 특정할 수 없으면 null */
export function classFromCategory(option) {
  if (option == null) return null
  const key = String(option)
  return MOD_FILE_BY_CATEGORY[key] || FLAT_CATEGORY[key] || null
}

/**
 * @param {string|null} name 베이스 아이템의 한글 이름 (거래소 query.type)
 * @param {Record<string,[string,string]>} baseMap src/lib/pobBaseMap.json
 */
export function classFromBaseName(name, baseMap) {
  if (!name || !baseMap) return null
  const entry = baseMap[String(name)]
  const pobClass = entry && entry[1]
  return (pobClass && MOD_FILE_BY_POB_CLASS[pobClass]) || null
}

/** 거래소가 변형 아이템의 type 을 {option, discriminator} 객체로 보내는 경우를 흡수한다. */
function typeText(v) {
  if (typeof v === 'string') return v || null
  if (v && typeof v === 'object' && v.option != null && typeof v.option !== 'object') return String(v.option) || null
  return null
}

/**
 * category 를 베이스 이름보다 우선한다 — 사용자가 유형을 바꾸면 베이스 이름이 남아 있어도
 * 지금 찾는 것은 새 유형이다.
 * @param {any} query 거래소 검색 바디의 query
 * @param {Record<string,[string,string]>} baseMap
 */
export function classFromQuery(query, baseMap) {
  if (!query) return null
  const option = query?.filters?.type_filters?.filters?.category?.option
  return classFromCategory(option) || classFromBaseName(typeText(query.type), baseMap)
}
