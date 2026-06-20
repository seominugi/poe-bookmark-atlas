const UNIT_LABEL = { divine: 'div', exalted: 'ex' }

/** 소수 정리: 정수는 그대로, 아니면 1자리 반올림 후 trailing zero 제거 */
function trim(n) {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 10) / 10)
}

/**
 * @param {{valueDiv?:number, exaltedPerDivine?:number, value?:number, unit?:'divine'|'exalted'}} p
 * @returns {string} "≈ 2.3 div" | "≈ 80 ex" | ''
 */
export function formatPrice(p) {
  // 폴백 경로: 단위가 고정된 값
  if (typeof p.value === 'number' && p.unit && UNIT_LABEL[p.unit]) {
    return `≈ ${trim(p.value)} ${UNIT_LABEL[p.unit]}`
  }
  // 기본 경로: 디바인값 + 환율로 div/ex 선택
  if (typeof p.valueDiv === 'number' && p.valueDiv > 0) {
    if (p.valueDiv >= 1) return `≈ ${trim(p.valueDiv)} div`
    if (p.exaltedPerDivine > 0) return `≈ ${trim(p.valueDiv * p.exaltedPerDivine)} ex`
    return `≈ ${trim(p.valueDiv)} div`
  }
  return ''
}
