import { describe, expect, it } from 'vitest'
import { districtOf, homepageKey, regionCodeOf, sharedHomepages, shortName } from './names.js'

describe('시·도 이름 → 지역 코드', () => {
  it.each([
    ['서울특별시', '11'], ['경기도', '31'], ['강원특별자치도', '32'], ['강원도', '32'],
    ['충청북도', '33'], ['충청남도', '34'], ['전북특별자치도', '35'], ['전라남도', '36'],
    ['경상북도', '37'], ['경상남도', '38'], ['세종특별자치시', '29'], ['제주특별자치도', '39'],
  ])('%s → %s', (name, code) => {
    expect(regionCodeOf(name)).toBe(code)
  })
  it('모르는 이름은 null', () => {
    expect(regionCodeOf('도쿄도')).toBeNull()
  })
})

describe('홈페이지 주소', () => {
  it('같은 사이트의 다른 표기를 하나로 맞춘다', () => {
    for (const url of ['https://www.junggulib.or.kr/index.do', 'http://junggulib.or.kr/', 'junggulib.or.kr', 'HTTPS://JUNGGULIB.OR.KR']) {
      expect(homepageKey(url)).toBe('junggulib.or.kr')
    }
    expect(homepageKey('https://mplib.mapo.go.kr/libsmall/')).toBe('mplib.mapo.go.kr/libsmall')
  })
  it('2곳 이상이 쓰는 주소만 통합 사이트로 본다', () => {
    expect(sharedHomepages([
      'https://www.nowonlib.kr/', 'http://nowonlib.kr', // 노원구 작은도서관 두 곳
      'https://lib.yangcheon.or.kr/libgalsan', 'https://lib.yangcheon.or.kr/libmokdong', // 같은 도메인이어도 경로가 다르면 각자 사이트
      '',
    ])).toEqual(['nowonlib.kr'])
  })
  it('주소에서 구·시 이름을 꺼낸다', () => {
    expect(districtOf('서울특별시 중구 동호로14길 18')).toBe('중구')
    expect(districtOf('경기도 수원시 팔달구 …')).toBe('수원시')
    expect(districtOf('')).toBe('')
  })
})

describe('도서관 짧은 이름', () => {
  it.each([
    ['강남구립도곡정보문화도서관', '도곡정보문화도서관'],
    ['중구구립 가온도서관', '가온도서관'],
    ['중랑구립상봉도서관', '상봉도서관'],
    ['구립응암도서관', '응암도서관'],
    ['서울특별시교육청마포평생학습관', '마포평생학습관'],
    ['논현문화마루도서관(분관)', '논현문화마루도서관'],
    ['마포중앙도서관', '마포중앙도서관'],
    ['용강동작은도서관', '용강동작은도서관'],
  ])('%s → %s', (name, expected) => {
    expect(shortName(name)).toBe(expected)
  })
})
