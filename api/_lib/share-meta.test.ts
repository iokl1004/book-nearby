import { describe, expect, it } from 'vitest'
import { largeCover, withBookMeta } from './share-meta.js'

const html = `<html><head>
    <meta name="description" content="기본 설명" />
    <meta property="og:title" content="책있나" />
    <title>책있나 — 근처 도서관 대출 가능 여부</title>
  </head><body></body></html>`
const book = { isbn13: '9788936434120', title: '소년이 온다', authors: '한강', contributors: [], genre: '', publisher: '창비', year: '2014', image: 'https://img/1.jpg' }

describe('공유 미리보기 og 태그', () => {
  it('책 제목·표지·주소를 넣고 기본 og 태그는 뺀다', () => {
    const out = withBookMeta(html, book, 'https://book-nearby.vercel.app/book/9788936434120')
    expect(out).toContain('<title>소년이 온다 — 책있나</title>')
    expect(out).toContain('<meta property="og:title" content="소년이 온다 — 책있나" />')
    expect(out).toContain('<meta property="og:image" content="https://img/1.jpg" />')
    expect(out).toContain('content="한강 · 창비. 근처 도서관에')
    expect(out.match(/og:title/g)).toHaveLength(1)
  })
  it('제목에 들어 있는 따옴표·태그는 이스케이프한다', () => {
    const out = withBookMeta(html, { ...book, title: '"><script>alert(1)</script>', image: '' }, 'https://x/book/1')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&#34;&#62;&#60;script&#62;')
    expect(out).toContain('<meta property="og:image" content="https://x/og.png" />') // 표지 없으면 대표 이미지
  })
  it('카카오 썸네일 주소에서 원본 표지를 꺼낸다', () => {
    expect(largeCover('https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F532683%3Ftimestamp%3D1'))
      .toBe('https://t1.daumcdn.net/lbook/image/532683?timestamp=1')
    expect(largeCover('https://img/1.jpg')).toBe('https://img/1.jpg')
  })
})
