import { describe, expect, it } from 'vitest'
import { toggleFavorite } from './favorites'
import type { Book } from './api'

const book = (isbn13: string): Book => ({ isbn13, title: isbn13, authors: '', contributors: [], genre: '', publisher: '', year: '', image: '' })

describe('찜하기', () => {
  it('없으면 맨 앞에 넣고, 있으면 뺀다', () => {
    const a = book('a'), b = book('b')
    expect(toggleFavorite([a], b).map((x) => x.isbn13)).toEqual(['b', 'a'])
    expect(toggleFavorite([b, a], b).map((x) => x.isbn13)).toEqual(['a'])
  })
  it('최대 100권까지만 (오래된 것부터 밀려남)', () => {
    const many = Array.from({ length: 100 }, (_, i) => book(String(i)))
    const next = toggleFavorite(many, book('new'))
    expect(next).toHaveLength(100)
    expect(next[0].isbn13).toBe('new')
    expect(next.at(-1)!.isbn13).toBe('98')
  })
})
