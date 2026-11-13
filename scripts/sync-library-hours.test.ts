import { describe, expect, it } from 'vitest'
import { toRecords, toSpan } from './sync-library-hours'

describe('운영시간 데이터 변환', () => {
  it('시간 형식을 맞추고 운영하지 않는 날은 null', () => {
    expect(toSpan('09:00', '18:00')).toEqual(['09:00', '18:00'])
    expect(toSpan('900', '1800')).toEqual(['09:00', '18:00'])
    expect(toSpan('00:00', '00:00')).toBeNull()
    expect(toSpan('', '')).toBeNull()
  })

  it('API 필드를 매핑하고 좌표 없는 곳은 버린다', () => {
    const items = [
      // 실제 응답 형식 (필드 이름 오타 포함)
      { lbrryNm: '동부도서관', closeDay: '금+1월1일+설 연휴', weekdayOperOpenHhmm: '09:00', weekdayOperColseHhmm: '22:00', satOperOperOpenHhmm: '09:00', satOperCloseHhmm: '18:00', holidayOperOpenHhmm: '00:00', holidayCloseOpenHhmm: '00:00', latitude: '35.100007', longitude: '128.817141' },
      { lbrryNm: '좌표없는도서관', closeDay: '월', latitude: '', longitude: '' },
    ]
    expect(toRecords(items)).toEqual([
      { name: '동부도서관', lat: 35.100007, lng: 128.817141, closeDay: '금+1월1일+설 연휴', weekday: ['09:00', '22:00'], saturday: ['09:00', '18:00'], holiday: null },
    ])
  })
})
