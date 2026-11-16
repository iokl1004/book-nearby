import type { Book } from './types.js'

// 카카오 책 검색 API
// 정보나루 도서 검색(srchBooks)은 등록된 서버 IP에서만 허용돼서, 고정 IP가 없는 Vercel에서는 "인증정보 불일치"로 거절된다.
// 그래서 검색은 IP 제한이 없는 카카오로 하고, 소장 도서관·대출 여부는 계속 정보나루를 쓴다 (ISBN이 같아서 그대로 이어진다).
const ENDPOINT = 'https://dapi.kakao.com/v3/search/book'

export const kakaoBookEnabled = () => !!process.env.KAKAO_REST_KEY

type KakaoDoc = {
  title: string
  authors: string[]
  translators: string[]
  publisher: string
  datetime: string
  isbn: string // "10자리 13자리" 공백으로 구분, 한쪽이 빈 경우도 있다
  thumbnail: string
}

export function toKakaoBook(doc: KakaoDoc): Book | null {
  const isbn13 = doc.isbn.split(/\s+/).find((s) => /^\d{13}$/.test(s))
  if (!isbn13) return null // 소장 도서관은 ISBN13으로 찾으므로 없으면 쓸 수 없다
  const authors = doc.authors.filter(Boolean)
  const translators = doc.translators.filter(Boolean)
  return {
    isbn13,
    title: doc.title.replace(/\s+/g, ' ').trim(),
    authors: authors.join(', '),
    // 카카오는 글·그림을 나누지 않고 이름만 준다. 옮긴이는 따로 와서 구분할 수 있다
    contributors: [
      ...(authors.length ? [{ role: '저자' as const, names: authors }] : []),
      ...(translators.length ? [{ role: '옮김' as const, names: translators }] : []),
    ],
    genre: '', // 카카오에는 주제 분류가 없다 (상세 화면에서 정보나루로 채운다)
    publisher: doc.publisher.trim(),
    year: /^\d{4}/.test(doc.datetime) ? doc.datetime.slice(0, 4) : '',
    image: doc.thumbnail.replace(/^http:/, 'https:'),
  }
}

export type KakaoTarget = 'title' | 'person'

// target: title(제목) / person(저자·옮긴이) / 비우면 전체. page는 1부터 (카카오 최대 50)
export async function searchKakaoBooks(query: string, target?: KakaoTarget, page = 1): Promise<{ total: number; isEnd: boolean; books: Book[] }> {
  const qs = new URLSearchParams({ query, sort: 'accuracy', size: '20', page: String(page), ...(target && { target }) })
  const res = await fetch(`${ENDPOINT}?${qs}`, { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` } })
  if (!res.ok) throw new Error(`카카오 책 검색 실패 (${res.status})`)
  const body = (await res.json()) as { meta?: { total_count?: number; is_end?: boolean }; documents?: KakaoDoc[] }
  return {
    total: body.meta?.total_count ?? 0,
    isEnd: body.meta?.is_end ?? true,
    books: (body.documents ?? []).map(toKakaoBook).filter((b): b is Book => b !== null),
  }
}
