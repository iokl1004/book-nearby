import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { loadPopular, type Suggestion } from '../suggest'
import { Link, useSearchParams } from 'react-router-dom'
import { searchBooks } from '../api'
import BookInfo from '../components/BookInfo'
import Cover from '../components/Cover'
import SearchBox from '../components/SearchBox'

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  // 첫 화면 추천: 인기 대출 도서 상위 5권 (검색창 미리보기와 같은 파일이라 한 번만 받는다)
  const [top, setTop] = useState<Suggestion[]>([])
  useEffect(() => {
    if (!q) loadPopular().then((list) => setTop(list.slice(0, 5)))
  }, [q])
  const { data, isFetching, error } = useQuery({
    queryKey: ['search', q],
    queryFn: () => searchBooks(q),
    enabled: q.length > 0,
  })

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
    </>
  )
}
