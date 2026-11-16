import { describe, expect, it } from 'vitest'
import { toKakaoBook } from './kakao-book.js'

// 카카오 책 검색 실제 응답 형식
const doc = {
  title: '어린 왕자',
  authors: ['앙투안 드 생텍쥐페리'],
  translators: ['황현산'],
  publisher: '열린책들',
  datetime: '2015-10-20T00:00:00.000+09:00',
  isbn: '8932917248 9788932917245',
  thumbnail: 'http://search1.kakaocdn.net/thumb/x.jpg',
}

describe('카카오 책 검색 결과 정리', () => {
  it('ISBN13, 저자·옮김, 출판연도, https 표지로 바꾼다', () => {
    expect(toKakaoBook(doc)).toEqual({
      isbn13: '9788932917245',
      title: '어린 왕자',
      authors: '앙투안 드 생텍쥐페리',
      contributors: [{ role: '저자', names: ['앙투안 드 생텍쥐페리'] }, { role: '옮김', names: ['황현산'] }],
      genre: '',
      publisher: '열린책들',
      year: '2015',
      image: 'https://search1.kakaocdn.net/thumb/x.jpg',
    })
  })

  it('ISBN13이 없으면 버린다 (소장 도서관을 찾을 수 없어서)', () => {
    expect(toKakaoBook({ ...doc, isbn: '8932917248 ' })).toBeNull()
  })

  it('ISBN13만 있거나, 옮긴이·날짜가 없어도 처리한다', () => {
    const b = toKakaoBook({ ...doc, isbn: ' 9788932917245', translators: [], datetime: '' })!
    expect(b.isbn13).toBe('9788932917245')
    expect(b.contributors).toEqual([{ role: '저자', names: ['앙투안 드 생텍쥐페리'] }])
    expect(b.year).toBe('')
  })
})
