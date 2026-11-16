import { describe, expect, it } from 'vitest'
import { closedForHoliday, openStatus, parseCloseDay } from './hours'
import type { Hours } from '../api/_lib/types'

// 한국 시간 기준 시각을 만든다 (UTC+9)
const kst = (iso: string) => new Date(`${iso}+09:00`)
const hours: Hours = { closeDay: '매주 월요일, 법정공휴일', weekday: ['09:00', '18:00'], saturday: ['09:00', '17:00'], holiday: null }

describe('휴관일 해석', () => {
  it('매주 / 주차 / 숫자 주차 / 마지막 주를 읽는다', () => {
    expect(parseCloseDay('매주 월요일, 법정공휴일')).toEqual([{ day: 1, nth: [] }])
    expect(parseCloseDay('매월 둘째·넷째 화요일')).toEqual([{ day: 2, nth: [2, 4] }])
    expect(parseCloseDay('매월 2,4째주 금요일')).toEqual([{ day: 5, nth: [2, 4] }])
    expect(parseCloseDay('매월 마지막 수요일')).toEqual([{ day: 3, nth: [-1] }])
    expect(parseCloseDay('1월1일, 매주 월요일')).toEqual([{ day: 1, nth: [] }])
    expect(parseCloseDay('법정공휴일')).toEqual([])
  })

  // 전국도서관표준데이터 실제 표기에서 뽑은 예시
  it.each([
    ['금+1월1일+설 연휴+추석 연휴+기타 법정공휴일', [{ day: 5, nth: [] }]],
    ['일+국가지정 공휴일', [{ day: 0, nth: [] }]],
    ['매주 월+공휴일', [{ day: 1, nth: [] }]],
    ['셋째 주 월+법정공휴일', [{ day: 1, nth: [3] }]],
    ['매월 첫 번째, 세 번째 월요일, 일요일을 제외한 법정공휴일', [{ day: 1, nth: [1, 3] }]],
    ['토,일요일 법정공휴일', [{ day: 6, nth: [] }, { day: 0, nth: [] }]],
    ['매주토, 일요일', [{ day: 6, nth: [] }, { day: 0, nth: [] }]],
    ['토일+법정공휴일', [{ day: 6, nth: [] }, { day: 0, nth: [] }]],
    ['주말, 법정공휴일', [{ day: 0, nth: [] }, { day: 6, nth: [] }]],
    ['1)매주일요일 2)매주 월요일 3)국가지정공휴일', [{ day: 0, nth: [] }, { day: 1, nth: [] }]],
    ['일요일을제외한법정공휴일(단,일요일이공휴일인경우휴관)', []],
    ['국가지정공휴일(일요일포함)+공휴일(일 제외)', []],
    ['성북문화재단창립기념일(매년 9월 1일)+연중무휴+휴관중', []],
    ['매주 월요일 및 국가지정 공휴일', [{ day: 1, nth: [] }]],
  ])('%s', (text, expected) => {
    expect(parseCloseDay(text)).toEqual(expected)
  })
})

describe('운영 상태', () => {
  // 2026-11-16 월요일, 11-17 화요일, 11-21 토요일, 11-22 일요일
  it('정기 휴관일이면 휴관', () => {
    expect(openStatus(hours, kst('2026-11-16T10:00:00')).kind).toBe('closed')
  })
  it('개관 전 / 운영 중 / 종료', () => {
    expect(openStatus(hours, kst('2026-11-17T08:30:00')).label).toBe('오늘 09:00 개관')
    expect(openStatus(hours, kst('2026-11-17T10:00:00')).label).toBe('운영 중 · 18:00까지')
    expect(openStatus(hours, kst('2026-11-17T18:00:00')).kind).toBe('after')
  })
  it('토요일은 토요일 시간, 일요일은 공휴일 시간을 쓴다', () => {
    expect(openStatus(hours, kst('2026-11-21T16:30:00')).label).toBe('운영 중 · 17:00까지')
    expect(openStatus(hours, kst('2026-11-22T10:00:00')).kind).toBe('closed')
  })
  it('둘째·넷째 화요일: 넷째 주만 휴관', () => {
    const h = { ...hours, closeDay: '매월 둘째·넷째 화요일' }
    expect(openStatus(h, kst('2026-11-10T10:00:00')).kind).toBe('closed') // 둘째 화
    expect(openStatus(h, kst('2026-11-17T10:00:00')).kind).toBe('open') // 셋째 화
    expect(openStatus(h, kst('2026-11-24T10:00:00')).kind).toBe('closed') // 넷째 화
  })
  it('마지막 주 판정, 정보 없음', () => {
    const h = { ...hours, closeDay: '매월 마지막 월요일' }
    expect(openStatus(h, kst('2026-11-30T10:00:00')).kind).toBe('closed')
    expect(openStatus(h, kst('2026-11-23T10:00:00')).kind).toBe('open')
    expect(openStatus(null).kind).toBe('unknown')
  })
  it('시간 정보 없이 휴관일 글자만 있으면 휴관 여부만 판단한다', () => {
    const onlyText = { closeDay: '매주 월요일 / 법정휴일', weekday: null, saturday: null, holiday: null }
    expect(openStatus(onlyText, kst('2026-11-16T10:00:00')).kind).toBe('closed')
    expect(openStatus(onlyText, kst('2026-11-17T10:00:00')).label).toBe('운영시간 확인 필요')
  })
})

describe('공휴일 휴관', () => {
  // 2026-12-25 금 기독탄신일, 2026-09-25 금 추석, 2026-05-24 일 부처님오신날
  it('법정공휴일 휴관이면 공휴일 이름과 함께 휴관', () => {
    expect(openStatus(hours, kst('2026-12-25T10:00:00')).label).toBe('오늘 휴관 · 기독탄신일')
  })
  it('공휴일에 여는 곳은 휴일 운영시간을 쓴다', () => {
    const h = { ...hours, closeDay: '매주 월요일+설 연휴+추석 연휴', holiday: ['10:00', '17:00'] as [string, string] }
    expect(openStatus(h, kst('2026-12-25T10:30:00')).label).toBe('운영 중 · 17:00까지')
    expect(openStatus(h, kst('2026-09-25T10:30:00')).label).toBe('오늘 휴관 · 추석')
  })
  it('"일요일을 제외한 법정공휴일"은 일요일 공휴일에 연다 (겹치면 휴관이라 적힌 곳은 닫음)', () => {
    expect(closedForHoliday('매주 월요일+일요일을 제외한 법정공휴일', '부처님오신날', 0)).toBe(false)
    expect(closedForHoliday('월+공휴일(일 제외)', '부처님오신날', 0)).toBe(false)
    expect(closedForHoliday('월+국가지정공휴일(일요일제외, 단 일요일이 다른 법정공휴일과 겹치는 경우에는 휴관함)', '부처님오신날', 0)).toBe(true)
    expect(closedForHoliday('매주 월요일+일요일을 제외한 법정공휴일', '기독탄신일', 5)).toBe(true)
  })
  it('명절·신정·선거일만 적힌 곳은 그날만 휴관', () => {
    expect(closedForHoliday('1월1일+설날+추석+매주일요일', '설날', 2)).toBe(true)
    expect(closedForHoliday('1월1일+설날+추석+매주일요일', '1월1일', 4)).toBe(true)
    expect(closedForHoliday('1월1일+설날+추석+매주일요일', '삼일절', 0)).toBe(false)
    expect(closedForHoliday('매월 셋째 월요일, 신정, 설 연휴, 추석 연휴, 선거일', '전국동시지방선거', 3)).toBe(true)
  })
})
