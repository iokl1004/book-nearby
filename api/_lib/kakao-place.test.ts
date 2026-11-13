import { describe, expect, it } from 'vitest'
import { pickPlace, pickPlaceFar } from './kakao-place.js'

describe('카카오맵 장소 고르기', () => {
  // 실제 검색 결과 순서 (같은 건물 안의 장소가 섞여 나옴)
  const docs = [
    { id: '1053216489', place_name: '마포진로직업체험지원센터' },
    { id: '737484694', place_name: '트립티 마포중앙도서관 구내식당' },
    { id: '840868167', place_name: '마포중앙도서관 마중홀' },
    { id: '2019177712', place_name: '마포중앙도서관' },
  ]

  it('이름이 똑같은 장소를 고른다', () => {
    expect(pickPlace('마포중앙도서관', docs)).toBe('2019177712')
  })
  it('띄어쓰기 차이는 무시한다', () => {
    expect(pickPlace('서울특별시교육청마포평생학습관', [{ id: '7870320', place_name: '서울특별시교육청 마포평생학습관' }])).toBe('7870320')
  })
  it('똑같은 이름이 없으면 100m 안의 비슷한 이름 도서관', () => {
    const galsan = [
      { id: '1', place_name: '갈산공공도서관', category_name: '교육,학문 > 학습시설 > 도서관 > 국공립도서관', distance: '19' },
      { id: '2', place_name: '갈산도서관 개방화장실', category_name: '사회,공공기관 > 화장실', distance: '18' },
    ]
    expect(pickPlace('갈산도서관', galsan)).toBe('1')
  })
  it('카카오 이름 앞에 "중구구립"처럼 글자가 붙은 경우', () => {
    // 실제 검색 결과 (정보나루 이름: 가온도서관)
    const gaon = [
      { id: '1563225293', place_name: '중구구립 가온도서관', category_name: '교육,학문 > 학습시설 > 도서관 > 국공립도서관', distance: '12' },
      { id: '26332130', place_name: '중구구립가온도서관 개방화장실', category_name: '가정,생활 > 화장실', distance: '11' },
    ]
    expect(pickPlace('가온도서관', gaon)).toBe('1563225293')
  })
  it('같은 건물의 다른 도서관 시설이나 멀리 있는 곳은 고르지 않는다', () => {
    const hall = [{ id: '9', place_name: '마중홀', category_name: '교육,학문 > 학습시설 > 도서관', distance: '3' }]
    expect(pickPlace('마포중앙도서관', hall)).toBeNull()
    const far = [{ id: '8', place_name: '갈산공공도서관', category_name: '도서관', distance: '450' }]
    expect(pickPlace('갈산도서관', far)).toBeNull()
  })
  it('카카오 이름이 우리 이름 안에 들어 있으면 분류가 달라도 인정', () => {
    const ahyeon = [{ id: '5', place_name: '마포평생학습관 아현분관', category_name: '교육,학문 > 교육기관 > 평생교육원,사회교육원', distance: '4' }]
    expect(pickPlace('서울특별시교육청마포평생학습관아현분관', ahyeon)).toBe('5')
  })
  it('좌표가 어긋난 경우: 5km 안에서 이름이 똑같은 곳만', () => {
    expect(pickPlaceFar('강동중앙도서관', [{ id: '7', place_name: '강동중앙도서관', distance: '1857' }])).toBe('7')
    expect(pickPlaceFar('강동중앙도서관', [{ id: '7', place_name: '강동구립중앙도서관', distance: '1857' }])).toBeNull()
    expect(pickPlaceFar('강동중앙도서관', [{ id: '7', place_name: '강동중앙도서관', distance: '30000' }])).toBeNull()
  })
  it('찾지 못하면 null (검색 링크로 대신)', () => {
    expect(pickPlace('없는도서관', docs)).toBeNull()
  })
})
