import { describe, expect, it } from 'vitest'
import { mainAuthor, mainTitle, toSuggestions } from './sync-popular-books'

describe('인기 도서 목록 만들기', () => {
  it('부제를 떼고 대표 저자 한 명만, 판본 중복은 한 번만', () => {
    expect(mainTitle('나미야 잡화점의 기적 :히가시노 게이고 장편소설 ')).toBe('나미야 잡화점의 기적')
    expect(mainAuthor('지은이: 히가시노 게이고 ;옮긴이: 양윤옥')).toBe('히가시노 게이고')
    expect(mainAuthor('강민경 글 ;이영림 그림')).toBe('강민경')
    expect(toSuggestions([
      { bookname: '데미안 :헤르만 헤세 장편소설', authors: '헤르만 헤세 지음;전영애 옮김' },
      { bookname: '데미안', authors: '지은이: 헤르만 헤세 ;옮긴이: 안인희' }, // 다른 판본
      { bookname: '데미안', authors: '고정욱 지음' }, // 같은 제목, 다른 책
    ])).toEqual([['데미안', '헤르만 헤세'], ['데미안', '고정욱']])
  })
})
