import { describe, expect, it } from 'vitest'
import { searchQuery } from './KakaoMap'
import { homepageLabel, joinInfo } from '../api'

describe('책 정보 잇기', () => {
  it('빈 값은 빼고 잇는다', () => {
    expect(joinInfo('글: 정상민,주성윤', '사회평론', '')).toBe('글: 정상민,주성윤 · 사회평론')
    expect(joinInfo('사회평론', undefined)).toBe('사회평론')
    expect(joinInfo('', ' ')).toBe('')
  })
})

describe('홈페이지 이름표', () => {
  it('통합 사이트면 구 이름을 붙여 알려준다', () => {
    expect(homepageLabel({ homepageShared: true, address: '서울특별시 중구 동호로14길 18' })).toBe('중구 통합 도서관 홈페이지')
    expect(homepageLabel({ homepageShared: true, address: '' })).toBe('통합 도서관 홈페이지')
    expect(homepageLabel({ homepageShared: false, address: '서울특별시 마포구 성산로 128' })).toBe('도서관 홈페이지')
  })
})

describe('카카오맵 정보보기 검색어', () => {
  it('주소의 구를 앞에 붙인다', () => {
    expect(searchQuery({ name: '동부도서관', address: '경상남도 창원시 진해구 용재로 66' })).toBe('창원시 동부도서관')
  })
  it('"강남구립" 같은 운영 기관 이름은 떼고 구를 붙인다', () => {
    expect(searchQuery({ name: '강남구립도곡정보문화도서관', address: '서울특별시 강남구 도곡로18길 57' })).toBe('강남구 도곡정보문화도서관')
  })
  it('짧은 이름에 이미 구가 들어 있으면 그대로 쓴다', () => {
    expect(searchQuery({ name: '마포구평생학습관', address: '서울특별시 마포구 독막로 165' })).toBe('마포구평생학습관')
  })
  it('주소가 비어 있으면 이름만', () => {
    expect(searchQuery({ name: '갈산도서관', address: '' })).toBe('갈산도서관')
  })
})
