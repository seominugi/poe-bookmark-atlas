// src/lib/statTextNorm.js
// 게임 데이터 모드 문구와 거래소 능력치 문구를 같은 모양으로 맞춘다.
//
// 왜 문구로 잇나: 거래소 stat id(`explicit.stat_3372524247`)는 불투명한 해시라
// 게임 데이터의 내부 stat 이름(`base_fire_damage_resistance_%`)과 직접 이어지는 공개 대응표가 없다.
// 대신 양쪽이 같은 GGPK 문구에서 나오므로, 수치 자리를 지우면 문자열이 일치한다.
// PoE2 기준 5,848개 중 97.0%가 이 방법으로 붙는다(2026-09-04 실측).

// 치환 중간 표식 — 실제 게임 문구에 나오지 않는 제어문자.
// 소스에는 항상 `\x01` 이스케이프로 적는다. 제어문자를 눈에 안 보이게 박아 넣으면
// 나중에 읽는 사람이 정규식을 해석할 수 없다.
const SLOT = '\x01'

/** 거래소 문구 → 비교 키. `+#`·`-#`의 부호를 떼고 공백을 정리한다. */
export function normalizeTradeText(text) {
  return String(text).replace(/[+\-]\s*#/g, '#').replace(/\s+/g, ' ').trim()
}

/**
 * 게임 모드 문구 → 비교 키.
 * @param {string} text 예: '화염 저항 (30-35)%'
 * @param {number} slotCount 이 문장이 가진 값 슬롯 수 (`stats[].stats[].length`)
 *
 * 순서가 중요하다. 괄호 범위·물결 범위를 먼저 표식으로 바꾸고, 그래도 표식 수가
 * 슬롯 수에 모자랄 때만 남은 상수를 슬롯으로 올린다. 이 마지막 단계가 없으면
 * `모든 근접 스킬 레벨 1` 류가 통째로 빠져 매칭률이 97.0% → 91.0%로 떨어진다.
 */
export function normalizeModText(text, slotCount = 0) {
  // 여기서는 `~` 주변 공백을 버리고 아래 3단계는 `$1` 로 보존하는데, 둘 다 상관없다 —
  // 맨 마지막에 공백을 한 칸으로 정규화하므로 그 차이는 결과 키에 남지 않는다.
  let t = String(text)
    .replace(/\(\s*[+\-]?\d+(?:\.\d+)?\s*[-~]\s*[+\-]?\d+(?:\.\d+)?\s*\)/g, SLOT) // (30-35)
    .replace(/[+\-]?\d+(?:\.\d+)?\s*~\s*[+\-]?\d+(?:\.\d+)?/g, SLOT + '~' + SLOT)  // 1~2

  // 표식과 물결로 이어진 상수도 값 슬롯이다: `1~(2-3)` → 슬롯 둘.
  // 이 두 줄이 없으면 아래 상수 승격이 '왼쪽부터' 채우느라 엉뚱한 숫자를 값으로 잡는다
  // (`10초마다 … 1~(2-3)` 에서 10 을 값으로 오인).
  //
  // ⚠ 정규식은 반드시 **리터럴**로 쓴다. 문자열로 만들면 `'\d'` 가 그냥 `d` 가 되어
  //   숫자 대신 알파벳을 찾는데, 아래 상수 승격이 결과를 덮어 테스트는 통과해 버린다.
  t = t
    .replace(/[+\-]?\d+(?:\.\d+)?(\s*~\s*)\x01/g, SLOT + '$1' + SLOT)
    .replace(/\x01(\s*~\s*)[+\-]?\d+(?:\.\d+)?/g, SLOT + '$1' + SLOT)

  let filled = (t.match(/\x01/g) || []).length
  if (slotCount > filled) {
    t = t.replace(/[+\-]?\d+(?:\.\d+)?/g, (m) => (filled < slotCount ? (filled++, SLOT) : m))
  }
  return t.replace(/\x01/g, '#').replace(/[+\-]\s*#/g, '#').replace(/\s+/g, ' ').trim()
}
