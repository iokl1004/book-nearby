import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { Suggestion } from '../suggest'
import popularTop from '../popular-top.json'
import { Link, useSearchParams } from 'react-router-dom'
import { searchBooks } from '../api'
import BookInfo from '../components/BookInfo'
import Cover from '../components/Cover'
import SearchBox from '../components/SearchBox'
import { useFavorites } from '../favorites'

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const favorites = useFavorites()
  // 첫 화면 추천: 인기 대출 도서 상위 5권. 화면 코드에 넣어 두어 바로 보인다
  // (따로 받아 오면 늦게 나타나며 아래 내용을 밀어내서 화면이 덜컹였다 — Lighthouse CLS 0.17)
  const top = popularTop as Suggestion[]
  // 20권씩. "검색 결과 더 보기"는 서버가 알려준 next로 다음 페이지를 받는다 (카카오 검색이라 정보나루 호출 없음)
  const search = useInfiniteQuery({
    queryKey: ['search', q],
    queryFn: ({ pageParam }) => searchBooks(q, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: q.length > 0,
  })
  const { isFetching, error } = search
  // 페이지가 바뀌며 같은 책이 다시 나올 수 있어 ISBN으로 한 번만
  const data = useMemo(() => {
    const pages = search.data?.pages
    if (!pages) return undefined
    const seen = new Set<string>()
    const items = pages.flatMap((p) => p.items).filter((b) => !seen.has(b.isbn13) && seen.add(b.isbn13))
    return { mock: pages[0].mock, items }
  }, [search.data])

  const form = <SearchBox initial={q} onSearch={(value) => setParams({ q: value })} autoFocus={!q} />

  if (!q) {
    return (
      <section className="intro">
        <h1>그 책, 근처 도서관에<br /><em>지금</em> 있을까?</h1>
        <p>책을 검색하면 우리 동네 도서관의 소장 여부와 대출 가능 여부를 지도로 보여드려요.</p>
        {form}
        {/* 이름표가 없으면 "이 버튼들이 뭐지?" 싶어서, 무엇인지 밝히고 실제 인기 대출 순위를 쓴다 */}
        {top.length > 0 && (
          <div className="popular">
            <p className="popular-label">📚 요즘 도서관에서 많이 빌리는 책</p>
            <div className="chips">
              {top.map(([title, author], i) => (
                <Link key={title} className="chip" to={`/?q=${encodeURIComponent(title)}`} title={`${title} — ${author}`}>
                  <span className="chip-rank">{i + 1}</span>{title}
                </Link>
              ))}
            </div>
          </div>
        )}
        {/* 찜한 책: 이 브라우저에 저장된 목록이라 API 호출 없이 바로 그린다 */}
        {favorites.list.length > 0 && (
          <div className="favorites">
            <p className="popular-label">♥ 찜한 책 {favorites.list.length}권</p>
            <ul className="fav-list">
              {favorites.list.slice(0, 8).map((book) => (
                <li key={book.isbn13}>
                  <Link className="fav-card" to={`/book/${book.isbn13}`} state={{ book }}>
                    <Cover src={book.image} title={book.title} />
                    <span>{book.title}</span>
                  </Link>
                  <button type="button" className="fav-remove" aria-label={`${book.title} 찜 해제`} onClick={() => favorites.toggle(book)}>×</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ol className="steps">
          <li><span className="num">1</span><b>책 검색</b><span>제목이나 저자로 찾아요</span></li>
          <li><span className="num">2</span><b>지역 선택</b><span>그 책을 가진 도서관을 모아요</span></li>
          <li><span className="num">3</span><b>대출 확인</b><span>빌릴 수 있는 곳을 지도로 봐요</span></li>
        </ol>
      </section>
    )
  }

  return (
    <>
      {/* 스크롤해도 무엇을 검색했는지 보이도록 검색창과 검색어를 헤더 아래에 고정한다 */}
      <div className="search-sticky">
        {form}
        <div className="results-head">
          <h2>‘{q}’ 검색 결과</h2>
          {data && <span>{data.items.length}권</span>}
        </div>
      </div>
      {data?.mock && <p className="notice">정보나루 키 승인 전이라 목업 데이터를 보여주고 있어요.</p>}
      {error && <p className="alert" role="alert">{error.message}</p>}

      {isFetching && !data && (
        <ul className="books" aria-label="검색 중">
          {[0, 1, 2].map((i) => <li key={i} className="skeleton" style={{ height: 124 }} />)}
        </ul>
      )}
      {data && data.items.length === 0 && <p className="empty">검색 결과가 없어요. 다른 검색어로 찾아보세요.</p>}

      <ul className="books">
        {data?.items.map((book) => (
          <li key={book.isbn13}>
            <Link className="book-card" to={`/book/${book.isbn13}`} state={{ book }}>
              <Cover src={book.image} title={book.title} />
              <div>
                <strong>{book.title}</strong>
                <BookInfo book={book} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {search.hasNextPage && (
        <button type="button" className="btn-ghost more-btn" onClick={() => search.fetchNextPage()} disabled={search.isFetchingNextPage}>
          {search.isFetchingNextPage ? '불러오는 중…' : '검색 결과 더 보기'}
        </button>
      )}
    </>
  )
}
