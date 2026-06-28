import { describe, it, expect } from 'vitest'
import { topIcon } from '../src/lib/topIcon.js'
import { isAllowedIconUrl } from '../src/store/store.js'

describe('topIcon', () => {
  it('가장 많이 나온(최빈) 아이콘, 빈/널 안전', () => {
    expect(topIcon(['a', 'a', 'b'])).toBe('a')
    expect(topIcon(['a', 'b', 'b', 'b'])).toBe('b')
    expect(topIcon([])).toBeNull()
    expect(topIcon(['a', null, undefined, 'a'])).toBe('a')
  })
})

describe('isAllowedIconUrl', () => {
  it('web.poecdn.com https만 허용 (악성·트래킹 차단)', () => {
    expect(isAllowedIconUrl('https://web.poecdn.com/gen/image/x.png')).toBe(true)
    expect(isAllowedIconUrl('http://web.poecdn.com/x.png')).toBe(false)
    expect(isAllowedIconUrl('https://evil.example/x.png')).toBe(false)
    expect(isAllowedIconUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedIconUrl(undefined)).toBe(false)
  })
})
