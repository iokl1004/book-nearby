import { describe, expect, it } from 'vitest'
import { checkedAgo } from './api'

describe('대출 정보 기준 시각', () => {
  it('1분 안은 "방금", 1시간 안은 분, 그 뒤는 시간', () => {
    const now = Date.parse('2026-11-16T10:00:00+09:00')
    expect(checkedAgo(now - 30_000, now)).toBe('방금')
    expect(checkedAgo(now - 12 * 60_000, now)).toBe('12분 전')
    expect(checkedAgo(now - 75 * 60_000, now)).toBe('1시간 전')
  })
})
