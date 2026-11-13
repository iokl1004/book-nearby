import { describe, expect, it } from 'vitest'
import { matchHours } from './match-hours.js'
import type { HoursRecord, Library } from './types.js'

const lib = (name: string, lat: number, lng: number) => ({ code: 'x', name, address: '', tel: '', homepage: '', lat, lng }) as Library
const rec = (name: string, lat: number, lng: number, closeDay: string): HoursRecord =>
  ({ name, lat, lng, closeDay, weekday: ['09:00', '18:00'], saturday: null, holiday: null })

describe('도서관 매칭', () => {
  const records = [
    rec('마포구립서강도서관', 37.5500, 126.9300, '매주 월요일'),
    rec('마포어린이도서관', 37.5501, 126.9301, '매주 화요일'), // 바로 옆 건물
    rec('먼도서관', 37.6, 127.0, '매주 수요일'),
  ]

  it('가까운 곳 중 이름이 겹치는 도서관을 고른다', () => {
    expect(matchHours(lib('마포 어린이 도서관', 37.5500, 126.9300), records)?.closeDay).toBe('매주 화요일')
  })
  it('이름이 달라도 100m 안이면 가장 가까운 곳', () => {
    expect(matchHours(lib('서강도서관(마포)', 37.55, 126.93), records)?.closeDay).toBe('매주 월요일')
  })
  it('300m 밖은 매칭하지 않는다', () => {
    expect(matchHours(lib('먼도서관', 37.58, 126.96), records)).toBeNull()
  })
})
