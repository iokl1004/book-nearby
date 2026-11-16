import { callApi, isMock, json, mergeBooks, QUOTA_MESSAGE, QuotaError, toBooks } from './_lib/data4library.js'
import { kakaoBookEnabled, searchKakaoBooks, type KakaoTarget } from './_lib/kakao-book.js'
import type { Book } from './_lib/types.js'

const PAGE = { pageNo: '1', pageSize: '20' }
const MAX_PAGE = 50 // 카카오가 허용하는 최대 페이지
const found = (raw: any) => Number(raw?.response?.numFound ?? 0)

type Result = { books: Book[]; next: string | null }

// GET /api/search?q=키워드[&next=title:2]
// 제목 검색과 저자 검색을 함께 하고 결과가 더 많은 쪽(= 사용자가 의도한 쪽)을 위에 보여준다.
//   "어린 왕자": 제목 결과가 압도적 → 제목 먼저,  "헤르만 헤세": 저자 결과가 많음 → 저자 먼저
// 1순위 카카오 책 검색: 정보나루 도서 검색은 등록된 IP에서만 허용돼서 배포 서버(Vercel, 고정 IP 없음)에서 거절된다.
// 2순위 정보나루: 카카오 키가 없거나 카카오가 실패할 때 (IP를 등록한 개발 환경 등)
// "검색 결과 더 보기"는 next(어느 쪽의 몇 페이지인지)를 그대로 돌려받아 그 쪽의 다음 페이지를 준다. 카카오만 지원.
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const q = params.get('q')?.trim() ?? ''
  if (!q || q.length > 100) return json({ error: '검색어는 1~100자로 입력해 주세요.' }, 400)
  const next = parseNext(params.get('next'))
  if (params.has('next') && !next) return json({ error: '잘못된 요청이에요.' }, 400)

  if (kakaoBookEnabled()) {
    try {
      return ok(next ? await nextKakaoPage(q, next.target, next.page) : await searchWithKakao(q))
    } catch (e) {
      console.warn('카카오 책 검색 실패, 정보나루로 대신함:', e instanceof Error ? e.message : e)
      if (next) return json({ error: '더 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502)
    }
  }

  try {
    return ok({ books: await searchWithLibrary(q), next: null })
  } catch (e) {
    console.error(e)
    if (e instanceof QuotaError) return json({ error: QUOTA_MESSAGE }, 429)
    return json({ error: '도서 검색에 실패했어요. 잠시 후 다시 시도해 주세요.' }, 502)
  }
}

const ok = ({ books, next }: Result) =>
  json({ mock: isMock(), items: books, next }, 200, 'max-age=86400, stale-while-revalidate=3600')

// "title:2" → { target: 'title', page: 2 }. 형식이 틀리면 null
export function parseNext(raw: string | null): { target: KakaoTarget | 'all'; page: number } | null {
  const m = raw?.match(/^(title|person|all):(\d{1,2})$/)
  if (!m) return null
  const page = Number(m[2])
  return page >= 2 && page <= MAX_PAGE ? { target: m[1] as KakaoTarget | 'all', page } : null
}

const nextToken = (target: KakaoTarget | 'all', page: number, isEnd: boolean) =>
  !isEnd && page < MAX_PAGE ? `${target}:${page + 1}` : null

async function searchWithKakao(q: string): Promise<Result> {
  const [byTitle, byPerson] = await Promise.all([searchKakaoBooks(q, 'title'), searchKakaoBooks(q, 'person')])
  const personFirst = byPerson.total > byTitle.total
  const [primary, secondary] = personFirst ? [byPerson, byTitle] : [byTitle, byPerson]
  const books = mergeBooks([primary.books, secondary.books]).slice(0, 20)
  if (books.length) return { books, next: nextToken(personFirst ? 'person' : 'title', 1, primary.isEnd) }
  // 둘 다 없으면(출판사 이름 등) 전체 검색으로 한 번 더
  const all = await searchKakaoBooks(q)
  return { books: all.books, next: nextToken('all', 1, all.isEnd) }
}

async function nextKakaoPage(q: string, target: KakaoTarget | 'all', page: number): Promise<Result> {
  const r = await searchKakaoBooks(q, target === 'all' ? undefined : target, page)
  return { books: r.books, next: nextToken(target, page, r.isEnd) }
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
