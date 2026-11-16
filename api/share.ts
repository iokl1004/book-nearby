import { searchKakaoBooks, kakaoBookEnabled } from './_lib/kakao-book.js'
import { withBookMeta } from './_lib/share-meta.js'

// GET /book/9788... (vercel.json에서 /api/share?isbn=…로 연결)
// 공유 미리보기 카드용: index.html에 그 책의 제목·표지 og 태그를 넣어 돌려준다. 화면은 평소처럼 뜬다.
// 책 정보는 카카오 ISBN 검색으로 찾는다 (정보나루 호출 한도를 쓰지 않는다).
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const isbn = url.searchParams.get('isbn') ?? url.pathname.split('/').pop() ?? ''
  let html = await (await fetch(new URL('/index.html', url))).text()

  if (/^\d{13}$/.test(isbn) && kakaoBookEnabled()) {
    try {
      const { books } = await searchKakaoBooks(isbn, 'isbn')
      const book = books.find((b) => b.isbn13 === isbn)
      if (book) html = withBookMeta(html, book, `${url.origin}/book/${isbn}`)
    } catch (e) {
      console.error(e) // 책을 못 찾아도 기본 카드로 화면은 그대로 보여준다
    }
  }
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      // 같은 책 링크는 CDN이 하루 저장한다. 새로 배포하면 Vercel이 캐시를 비워서 옛 화면 파일을 가리키지 않는다
      'Vercel-CDN-Cache-Control': 'max-age=86400, stale-while-revalidate=3600',
    },
  })
}
