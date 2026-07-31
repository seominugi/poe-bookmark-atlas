import { describe, it, expect } from 'vitest'
import { buildLeagueMap, leagueDisplayName } from '../src/lib/leagueMap.js'
import { leagueInfo } from '../src/content/panel/renderList.js'

// 거래소 /data/leagues 응답 형태 — 영구 리그·챌린지 본명만 한글, 하드코어·무자비 변형은 영문 그대로 온다.
const payload = {
  result: [
    { id: 'Allflame', text: '올플레임' },
    { id: 'Hardcore Allflame', text: 'Hardcore Allflame' },
    { id: 'Ruthless Allflame', text: 'Ruthless Allflame' },
    { id: 'HC Ruthless Allflame', text: 'HC Ruthless Allflame' },
    { id: 'Standard', text: '스탠다드' },
    { id: 'Hardcore', text: '하드코어' },
    { id: 'Ruthless', text: '무자비' },
    { id: 'Hardcore Ruthless', text: 'Hardcore Ruthless' },
  ],
}

describe('leagueDisplayName — 하드코어·무자비 변형 리그명 한글화', () => {
  const map = buildLeagueMap(payload)
  const of = (id) => leagueDisplayName(id, map[id], map)

  it('하드코어/무자비 접두를 한글로 + 베이스는 API 한글명', () => {
    expect(of('Hardcore Allflame')).toBe('하드코어 올플레임')
    expect(of('Ruthless Allflame')).toBe('무자비 올플레임')
    expect(of('HC Ruthless Allflame')).toBe('하드코어 무자비 올플레임')
  })
  it('베이스 없는 영구 변형 리그', () => {
    expect(of('Hardcore Ruthless')).toBe('하드코어 무자비')
  })
  it('이미 한글이면 그대로 둔다', () => {
    expect(of('스탠다드')).toBe('스탠다드')
    expect(of('Allflame')).toBe('올플레임')
    expect(of('Hardcore')).toBe('하드코어')
  })
  it('POE2식 HC 접두도 한글화', () => {
    const m = { 'Rise of the Abyssal': '심연의 부상', 'HC Rise of the Abyssal': 'HC Rise of the Abyssal' }
    expect(leagueDisplayName('HC Rise of the Abyssal', m['HC Rise of the Abyssal'], m)).toBe('하드코어 심연의 부상')
  })
  it('모르는 리그는 거래소 표기 그대로 (임의 번역 안 함)', () => {
    expect(leagueDisplayName('Mirage', 'Mirage', {})).toBe('Mirage')
    expect(leagueDisplayName('SSF Allflame', 'SSF Allflame', {})).toBe('SSF Allflame')
  })
  it('베이스 리그가 목록에 없으면 id 그대로 붙인다', () => {
    expect(leagueDisplayName('Hardcore Mirage', 'Hardcore Mirage', {})).toBe('하드코어 Mirage')
  })
})

describe('leagueInfo — 표시만 한글화하고 리그 생존 판정은 원본 기준', () => {
  const lg = leagueInfo(buildLeagueMap(payload))

  it('id로도, 거래소 표기(옛 레코드가 저장한 값)로도 한글 표시명', () => {
    expect(lg.name('Hardcore Allflame')).toBe('하드코어 올플레임')
    expect(lg.name('올플레임')).toBe('올플레임')
  })
  it('한글화해도 살아있는 리그 판정은 그대로 (이관 오탐 방지)', () => {
    expect(lg.isDead('Hardcore Allflame')).toBe(false)
    expect(lg.isDead('HC Ruthless Allflame')).toBe(false)
    expect(lg.isLive('Hardcore Ruthless')).toBe(true)
    expect(lg.isDead('Mirage')).toBe(true) // 끝난 리그는 여전히 죽은 것으로
  })
})
