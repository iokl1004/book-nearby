import { describe, expect, it } from 'vitest'
import { addRecent, findSuggestions, type Suggestion } from './suggest'

// 인기 순서대로
const list: Suggestion[] = [
  ['나미야 잡화점의 기적', '히가시노 게이고'],
  ['소년이 온다', '한강'],
  ['데미안', '헤르만 헤세'],
  ['어린 왕자', '생텍쥐페리'],
  ['꽃을 든 어린 왕자', '김아무개'],
  ['싯다르타', '헤르만 헤세'],
]

describe('검색창 미리보기', () => {
  it('띄어쓰기 없이 입력해도 찾고, 제목이 검색어로 시작하는 책을 먼저', () => {
    expect(findSuggestions(list, '어린왕자')).toEqual([['어린 왕자', '생텍쥐페리'], ['꽃을 든 어린 왕자', '김아무개']])
  })
  it('한글 입력 중 끝에 남은 낱자는 빼고 찾는다 ("어린왕ㅈ")', () => {
    expect(findSuggestions(list, '어린왕ㅈ')[0]).toEqual(['어린 왕자', '생텍쥐페리'])
  })
  it('저자로도 찾고, 같은 순위면 인기 순', () => {
    expect(findSuggestions(list, '헤세')).toEqual([['데미안', '헤르만 헤세'], ['싯다르타', '헤르만 헤세']])
  })
  it('빈 검색어나 낱자만 있으면 아무것도 보여주지 않는다', () => {
    expect(findSuggestions(list, '')).toEqual([])
    expect(findSuggestions(list, 'ㅇ')).toEqual([])
  })
  it('최대 개수를 지킨다', () => {
    expect(findSuggestions(list, '이', 2)).toHaveLength(2)
  })
})

describe('최근 검색어', () => {
  it('맨 앞에 추가하고, 같은 검색어는 한 번만, 최대 6개', () => {
    expect(addRecent(['토지', '데미안'], '데미안')).toEqual(['데미안', '토지'])
    expect(addRecent(['1', '2', '3', '4', '5', '6'], '7')).toEqual(['7', '1', '2', '3', '4', '5'])
  })
})
