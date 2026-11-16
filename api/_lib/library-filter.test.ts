import { describe, expect, it } from 'vitest'
import { filterLibraries } from './library-filter.js'
import type { Hours, Library } from './types.js'

const lib = (name: string, address: string, closeDay = ''): Library & { closeDay: string } => ({
  code: name, name, address, tel: '', lat: 37.5, lng: 127, homepage: '', closed: '', operatingTime: '', closeDay,
})
const hoursOf = (l: { closeDay: string }): Hours | null =>
  l.closeDay ? { closeDay: l.closeDay, weekday: ['09:00', '18:00'], saturday: null, holiday: null } : null

const libs = [
  lib('노원중앙도서관', '서울특별시 노원구 노원로 34', '매주 월요일'),
  lib('도곡정보문화도서관', '서울특별시 강남구 도곡로 18길 57', '매주 금요일+법정공휴일'),
  lib('가온도서관', '서울특별시 중구 동호로 5'),
]
const names = (list: { name: string }[]) => list.map((l) => l.name)

describe('소장 도서관 거르기', () => {
  it('이름이나 주소에 검색어가 들어간 곳만 (띄어쓰기·대소문자 무시, 여러 단어는 모두 포함)', () => {
    expect(names(filterLibraries(libs, { q: '노원' }, hoursOf))).toEqual(['노원중앙도서관'])
    expect(names(filterLibraries(libs, { q: '강남구 도곡' }, hoursOf))).toEqual(['도곡정보문화도서관'])
    expect(names(filterLibraries(libs, { q: '동호로5' }, hoursOf))).toEqual(['가온도서관'])
    expect(filterLibraries(libs, { q: '  ' }, hoursOf)).toHaveLength(3)
  })
  it('그날 휴관인 곳은 빼고, 휴관일 정보가 없는 곳은 남긴다', () => {
    // 2026-11-16 월요일 → 노원 휴관
    expect(names(filterLibraries(libs, { openOn: '20261116' }, hoursOf))).toEqual(['도곡정보문화도서관', '가온도서관'])
    // 2026-12-25 금요일 크리스마스 → 도곡 휴관
    expect(names(filterLibraries(libs, { openOn: '20261225' }, hoursOf))).toEqual(['노원중앙도서관', '가온도서관'])
  })
  it('날짜 형식이 아니면 휴관 필터는 무시', () => {
    expect(filterLibraries(libs, { openOn: 'today' }, hoursOf)).toHaveLength(3)
  })
})
