import { callApi, isMock, json, mergeBooks, QUOTA_MESSAGE, QuotaError, toBooks } from './_lib/data4library.js'
import { kakaoBookEnabled, searchKakaoBooks } from './_lib/kakao-book.js'
import type { Book } from './_lib/types.js'

const PAGE = { pageNo: '1', pageSize: '20' }
const found = (raw: any) => Number(raw?.response?.numFound ?? 0)

// GET /api/search?q=키워드
// 제목 검색과 저자 검색을 함께 하고 결과가 더 많은 쪽(= 사용자가 의도한 쪽)을 위에 보여준다.
//   "어린 왕자": 제목 결과가 압도적 → 제목 먼저,  "헤르만 헤세": 저자 결과가 많음 → 저자 먼저
// 1순위 카카오 책 검색: 정보나루 도서 검색은 등록된 IP에서만 허용돼서 배포 서버(Vercel, 고정 IP 없음)에서 거절된다.
// 2순위 정보나루: 카카오 키가 없거나 카카오가 실패할 때 (IP를 등록한 개발 환경 등)
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (!q || q.length > 100) return json({ error: '검색어는 1~100자로 입력해 주세요.' }, 400)

  if (kakaoBookEnabled()) {
    try {
      return ok(await searchWithKakao(q))
    } catch (e) {
      console.warn('카카오 책 검색 실패, 정보나루로 대신함:', e instanceof Error ? e.message : e)
    }
  }

  try {
    return ok(await searchWithLibrary(q))
  } catch (e) {
    console.error(e)
    if (e instanceof QuotaError) return json({ error: QUOTA_MESSAGE }, 429)
    return json({ error: '도서 검색에 실패했어요. 잠시 후 다시 시도해 주세요.' }, 502)
  }
}

const ok = (books: Book[]) => json({ mock: isMock(), items: books }, 200, 'max-age=86400, stale-while-revalidate=3600')

async function searchWithKakao(q: string): Promise<Book[]> {
  const [byTitle, byPerson] = await Promise.all([searchKakaoBooks(q, 'title'), searchKakaoBooks(q, 'person')])
  const ordered = byPerson.total > byTitle.total ? [byPerson, byTitle] : [byTitle, byPerson]
  const books = mergeBooks(ordered.map((r) => r.books)).slice(0, 20)
  // 둘 다 없으면(출판사 이름 등) 전체 검색으로 한 번 더
  return books.length ? books : (await searchKakaoBooks(q)).books
}

async function searchWithLibrary(q: string): Promise<Book[]> {
  const [byTitle, byAuthor] = await Promise.all([
    callApi('srchBooks', { title: q, ...PAGE }),
    callApi('srchBooks', { author: q, ...PAGE }),
  ])
  const ordered = found(byAuthor) > found(byTitle) ? [byAuthor, byTitle] : [byTitle, byAuthor]
  const books = mergeBooks(ordered.map(toBooks)).slice(0, 20)
  // 둘 다 없으면(출판사·주제어 등으로 찾은 경우) 키워드 검색으로 한 번 더
  return books.length ? books : toBooks(await callApi('srchBooks', { keyword: q, ...PAGE }))
}
