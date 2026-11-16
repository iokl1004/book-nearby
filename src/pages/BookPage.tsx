import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { checkedAgo, getBook, getLibraries, getRegionCounts, getRoundedPosition, REGIONS, type Book, type Coords } from '../api'
import BookInfo from '../components/BookInfo'
import KakaoMap, { type Place } from '../components/KakaoMap'
import { regionCodeAt } from '../components/kakaoSdk'
import Cover from '../components/Cover'
import LibraryItem from '../components/LibraryItem'
import { openStatus, todayYmd } from '../hours'
import { useFavorites } from '../favorites'

// 마지막에 고른 지역을 기억해 둔다 (경기도 사용자가 매번 "서울"에서 바꾸지 않게)
const REGION_KEY = 'book-nearby:region'
const isRegion = (code: string | null): code is string => REGIONS.some(([c]) => c === code)
function savedRegion() {
  try {
    const code = localStorage.getItem(REGION_KEY)
    return isRegion(code) ? code : '11'
  } catch {
    return '11' // 저장소를 막아 둔 브라우저
  }
}

export default function BookPage() {
  const { isbn = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // 검색 결과에서 왔으면 넘겨받은 책 정보를 바로 보여주고,
  // 정보나루 상세 정보로 분야와 글·그림 구분을 채운다 (검색은 카카오라 분야가 없고 저자를 역할별로 나누지 않음).
  // 주소로 바로 들어왔으면(공유 링크·새로고침) 상세 정보만으로 보여준다. 같은 책은 서버에서 하루 저장돼 다시 부르지 않는다.
  const fromSearch = (location.state as { book?: Book } | null)?.book
  const detail = useQuery({ queryKey: ['book', isbn], queryFn: () => getBook(isbn), retry: false, staleTime: 24 * 60 * 60 * 1000 })
  const book = useMemo<Book | undefined>(() => fromSearch
    ? {
        ...fromSearch,
        genre: fromSearch.genre || detail.data?.genre || '',
        contributors: detail.data?.contributors.length ? detail.data.contributors : fromSearch.contributors,
      }
    : detail.data, [fromSearch, detail.data])

  const favorites = useFavorites()

  // 브라우저 탭·공유 미리보기에 책 제목이 보이게
  useEffect(() => {
    if (book) document.title = `${book.title} — 책있나`
    return () => { document.title = '책있나 — 근처 도서관 대출 가능 여부' }
  }, [book])

  // 주소로 바로 들어오면 "뒤로"가 이 사이트 밖(또는 빈 페이지)으로 나가 버려서, 그때는 같은 제목 검색으로 보낸다.
  // (지역을 바꾸면 주소가 바뀌어 location.key로는 알 수 없어서, 라우터가 history에 남기는 순번을 본다)
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) return navigate(-1)
    navigate(searchTitle ? `/?q=${encodeURIComponent(searchTitle)}` : '/')
  }
  // 지역·검색어·오늘 여는 곳만은 주소(?region=31&q=노원&open=1)에 담는다.
  // 새로고침하거나 링크를 공유해도 같은 화면이 나온다. 위치는 개인 정보라 주소에 넣지 않는다.
  const [params, setParams] = useSearchParams()
  const updateParams = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    }, { replace: true, state: location.state }) // replace: 지역을 바꿀 때마다 뒤로 가기 기록이 쌓이지 않게, state: 검색 결과에서 받은 책 정보 유지
  const region = isRegion(params.get('region')) ? params.get('region')! : savedRegion()
  const setRegion = (code: string) => {
    try { localStorage.setItem(REGION_KEY, code) } catch { /* 저장 못 해도 이번 화면은 동작 */ }
    updateParams({ region: code })
  }
  const [here, setHere] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  // 소장 도서관 거르기: 이름·동네 검색어(입력 후 찾기를 눌렀을 때만 조회)와 "오늘 여는 곳만"
  const query = params.get('q') ?? ''
  const openToday = params.get('open') === '1'
  const [filterText, setFilterText] = useState(query)
  const setQuery = (q: string) => updateParams({ q: q || null })
  const setOpenToday = (on: boolean) => updateParams({ open: on ? '1' : null })
  const openOn = openToday ? todayYmd() : ''
  const filtered = !!query || openToday
  const clearFilters = () => { setFilterText(''); updateParams({ q: null, open: null }) }
  // 도서관마다 대출 여부를 따로 물어야 해서(정보나루 호출) 가까운 3곳만 먼저, 나머지는 "도서관 더 보기"로 3곳씩
  const libs = useInfiniteQuery({
    queryKey: ['libraries', isbn, region, here, query, openOn],
    queryFn: ({ pageParam }) => getLibraries(isbn, region, here, pageParam, { q: query, openOn }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  })
  const { isFetching, error } = libs
  const data = useMemo(() => {
    const pages = libs.data?.pages
    return pages && { mock: pages[0].mock, total: pages[0].total ?? 0, matched: pages[0].matched ?? pages[0].total ?? 0, items: pages.flatMap((p) => p.items) }
  }, [libs.data])
  const remaining = data ? data.matched - data.items.length : 0
  // 대출 여부는 서버가 최대 1시간 저장해 두므로, 가장 오래된 확인 시각을 알려 준다 (헛걸음 방지)
  const checkedAt = data?.items.reduce<number | null>((min, lib) => (lib.checkedAt && (!min || lib.checkedAt < min) ? lib.checkedAt : min), null)

  // 위치를 받으면 그 위치의 시·도로 지역도 맞춘다 (경기도에 있는데 "서울"로 찾는 일이 없게).
  // 지역과 위치를 한 번에 바꿔서 도서관 조회도 한 번만 일어난다.
  const locate = async () => {
    setLocating(true)
    setLocationError('')
    try {
      const pos = await getRoundedPosition()
      const code = await regionCodeAt(pos.lat, pos.lng)
      if (code) setRegion(code)
      setHere(pos)
    } catch (e) {
      setLocationError((e as Error).message)
    } finally {
      setLocating(false)
    }
  }
  const places = useMemo<Place[]>(
    () => (data?.items ?? []).map((lib) => ({
      code: lib.code, name: lib.name, lat: lib.lat, lng: lib.lng, address: lib.address, tel: lib.tel, homepage: lib.homepage, homepageShared: lib.homepageShared, placeId: lib.placeId,
      available: lib.loanAvailable, status: openStatus(lib.hours), distance: lib.distance,
    })),
    [data],
  )
  // 대출 가능해도 오늘 휴관이거나 이미 문을 닫았으면 "오늘 빌릴 수 있는 곳"에서 뺀다
  const available = places.filter((p) => p.available && !['closed', 'after'].includes(p.status.kind)).length

  // 지도와 목록이 같은 선택 상태를 공유한다
  const [selected, setSelected] = useState<string | null>(null)
  const mapBox = useRef<HTMLDivElement>(null)
  const listBox = useRef<HTMLElement>(null)
  // 다른 책·지역·위치로 바뀔 때만 선택을 푼다 ("더 보기"로 목록이 늘어날 때는 선택 유지)
  useEffect(() => setSelected(null), [isbn, region, here, query, openOn])
  // 마커를 눌렀을 때만 목록을 그 항목까지 스크롤한다.
  // 목록에서 눌렀을 때도 스크롤하면 아래의 "지도로 올라가기" 스크롤을 취소해 버린다.
  const fromList = useRef(false)
  useEffect(() => {
    if (selected && !fromList.current) document.getElementById(`lib-${selected}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    fromList.current = false
  }, [selected])
  const selectFromList = (code: string) => {
    fromList.current = true
    setSelected(code)
    // 모바일에서는 지도가 목록 위에 있어서, 눌렀을 때 지도가 보이도록 올려준다
    if (window.matchMedia('(max-width: 820px)').matches) mapBox.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const regionName = REGIONS.find(([code]) => code === region)?.[1]
  // 이 지역에 이 판본이 아예 없는 것과, 거르는 조건에 맞는 곳이 없는 것을 구분한다
  const noLibraries = !!data && data.total === 0
  const filteredEmpty = !!data && !noLibraries && data.items.length === 0
  const filterLabel = [query && `‘${query}’`, openToday && '오늘 여는 곳'].filter(Boolean).join(' · ')
  // 휴대폰에서는 지도가 목록 위에 있어서, 목록을 내려 보다가 지도로 돌아가려면 한참 올려야 했다.
  // 화면 아래에 떠 있는 버튼으로 지도 ↔ 목록을 오간다 (지도가 보이면 "목록 보기", 안 보이면 "지도 보기")
  const showMap = !noLibraries && !filteredEmpty
  const [mapInView, setMapInView] = useState(true)
  useEffect(() => {
    const el = mapBox.current
    if (!showMap || !el) return
    // 위쪽 고정 헤더에 가려진 부분은 안 보이는 것으로 친다
    const io = new IntersectionObserver(([entry]) => setMapInView(entry.isIntersecting), { threshold: 0.3, rootMargin: '-72px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [showMap])
  const toggleView = () => (mapInView ? listBox : mapBox).current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  // 다른 지역 소장 현황은 17개 시·도를 묻는 비싼 조회(정보나루 17건)라, 자동으로 하지 않고 버튼을 눌렀을 때만 묻는다
  const [askOthers, setAskOthers] = useState(false)
  useEffect(() => setAskOthers(false), [isbn])
  const others = useQuery({
    queryKey: ['regions', isbn],
    queryFn: () => getRegionCounts(isbn),
    enabled: noLibraries && askOthers,
    staleTime: 60 * 60 * 1000,
  })
  const otherRegions = others.data?.items.filter((r) => r.code !== region) ?? []
  // 다른 판본 검색어: 부제와 권 번호를 뗀 제목 ("토지: 박경리 대하소설 1권" → "토지")
  const searchTitle = book?.title.split(':')[0].replace(/\s*\d+권$/, '').trim()

  return (
    <>
      <button type="button" className="back" onClick={goBack}>← 검색 결과로</button>

      <div className="book-head">
        <Cover src={book?.image} title={book?.title} large />
        <div>
          {book ? (
            <>
              <div className="title-row">
                <h1>{book.title}</h1>
                <button
                  type="button"
                  className={favorites.has(book.isbn13) ? 'fav-btn on' : 'fav-btn'}
                  aria-pressed={favorites.has(book.isbn13)}
                  onClick={() => favorites.toggle(book)}
                >
                  {favorites.has(book.isbn13) ? '♥ 찜함' : '♡ 찜하기'}
                </button>
              </div>
              <BookInfo book={book} />
            </>
          ) : detail.isFetching ? (
            <>
              <div className="skeleton" style={{ width: 240, height: 34, marginBottom: 10 }} />
              <div className="skeleton" style={{ width: 180, height: 60 }} />
            </>
          ) : (
            // 정보나루에 상세 정보가 없어도 소장 도서관은 ISBN으로 찾을 수 있으니 아래 목록은 그대로 보여준다
            <>
              <h1>도서 정보</h1>
              <p className="meta">ISBN {isbn} · {detail.error?.message ?? '도서 정보를 찾을 수 없어요.'}</p>
            </>
          )}
        </div>
      </div>

      {data?.mock && <p className="notice">정보나루 키 승인 전이라 목업 데이터를 보여주고 있어요.</p>}

      <div className={noLibraries || filteredEmpty ? 'detail single' : 'detail'}>
        <section className="panel" aria-labelledby="libs-title" ref={listBox}>
          <div className="panel-head">
            <h2 id="libs-title">소장 도서관</h2>
            <label>
              <span className="sr-only">지역</span>
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                {REGIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </label>
          </div>

          {/* 3곳 이하면 거를 필요가 없어서 숨긴다 (거르는 중이면 계속 보여서 지울 수 있게) */}
          {!noLibraries && (filtered || (data?.total ?? 0) > 3) && (
            <div className="lib-filter">
              <form role="search" aria-label="소장 도서관 거르기" onSubmit={(e) => { e.preventDefault(); setQuery(filterText.trim()) }}>
                <input
                  type="search"
                  value={filterText}
                  onChange={(e) => { setFilterText(e.target.value); if (!e.target.value) setQuery('') }}
                  placeholder="도서관 이름이나 동네로 찾기"
                  aria-label="도서관 이름이나 동네"
                  maxLength={30}
                />
                <button type="submit" className="btn-ghost">찾기</button>
              </form>
              <label className="open-only">
                <input type="checkbox" checked={openToday} onChange={(e) => setOpenToday(e.target.checked)} />
                오늘 여는 곳만
              </label>
            </div>
          )}

          {noLibraries ? null : here ? (
            <p className="locate-row">📍 내 위치({regionName})에서 가까운 순</p>
          ) : (
            <div className="locate-row">
              <button type="button" className="btn-ghost" onClick={locate} disabled={locating}>
                {locating ? '위치 확인 중…' : '📍 내 위치에서 가까운 순으로 보기'}
              </button>
            </div>
          )}
          {locationError && <p className="alert" role="alert">{locationError}</p>}

          {data && data.items.length > 0 && (
            <p className="summary">
              {regionName}에서 이 책을 가진 {data.total}곳
              {filtered
                ? ` 중 ${filterLabel} ${data.matched}곳`
                // 일부만 보여줄 때만 "중 N곳"을 붙인다 ("5곳 중 5곳"은 어색해서)
                : data.total > data.items.length && (here ? ` 중 가까운 ${data.items.length}곳` : ` 중 ${data.items.length}곳`)}
              {' · '}<b>{available}곳</b>에서 오늘 빌릴 수 있어요
            </p>
          )}
          {checkedAt && <p className="checked-at">대출 정보는 {checkedAgo(checkedAt)}{checkedAgo(checkedAt) === '방금' ? '' : '에'} 확인했어요. 가기 전에 전화로 한 번 더 확인하면 좋아요.</p>}
          {error && <p className="alert" role="alert">{error.message}</p>}
          {isFetching && !data && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 56, margin: '10px 0' }} />)}
          {noLibraries && (
            // 오류가 아니라 이 "판본"을 가진 도서관이 없는 것. 할 수 있는 일(지역 바꾸기, 다른 판본 찾기)을 알려준다.
            <div className="empty-state">
              <p><b>{regionName}</b>에는 이 판본을 가진 도서관이 없어요.</p>

              {/* 지역을 하나씩 바꿔 보지 않아도 되게, 버튼 하나로 이 판본이 있는 지역을 보여준다 */}
              {!askOthers && (
                <button type="button" className="btn-ghost" onClick={() => setAskOthers(true)}>
                  🔎 다른 지역에서 찾아보기
                </button>
              )}
              {others.isFetching && <p className="meta">다른 지역에서 찾는 중…</p>}
              {otherRegions.length > 0 && (
                <>
                  <p className="meta">이 판본은 이런 지역 도서관에 있어요.</p>
                  <div className="region-chips">
                    {otherRegions.map((r) => (
                      <button key={r.code} type="button" className="chip region-chip" onClick={() => setRegion(r.code)}>
                        {r.name} <b>{r.count}곳</b>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {others.data && otherRegions.length === 0 && (
                <p className="meta">전국 어느 도서관에도 이 판본이 없어요. 같은 제목의 다른 판본을 찾아보세요.</p>
              )}
              {others.error && <p className="meta">위에서 지역을 바꾸거나, 같은 제목의 다른 판본을 찾아보세요.</p>}

              {searchTitle && (
                <Link className="btn-ghost" to={`/?q=${encodeURIComponent(searchTitle)}`}>
                  ‘{searchTitle}’ 다른 판본 찾기
                </Link>
              )}
            </div>
          )}

          {filteredEmpty && (
            <div className="empty-state">
              <p>{regionName}에서 이 책을 가진 {data.total}곳 중 <b>{filterLabel}</b> 조건에 맞는 도서관이 없어요.</p>
              <button type="button" className="btn-ghost" onClick={clearFilters}>조건 지우기</button>
            </div>
          )}

          <ul className="libraries">
            {data?.items.map((lib) => (
              <LibraryItem key={lib.code} lib={lib} active={selected === lib.code} onSelect={() => selectFromList(lib.code)} />
            ))}
          </ul>
          {libs.hasNextPage && (
            <button type="button" className="btn-ghost more-btn" onClick={() => libs.fetchNextPage()} disabled={libs.isFetchingNextPage}>
              {libs.isFetchingNextPage ? '불러오는 중…' : `도서관 더 보기 (${Math.min(3, remaining)}곳 / 남은 ${remaining}곳)`}
            </button>
          )}
        </section>

        {/* 도서관이 없으면 빈 지도 상자를 보여주지 않는다 (고장 난 것처럼 보여서) */}
        {showMap && (
          <button type="button" className="view-toggle" onClick={toggleView}>
            {mapInView ? '☰ 목록 보기' : '🗺️ 지도 보기'}
          </button>
        )}
        {showMap && (
          <div className="map-wrap" ref={mapBox}>
            {places.length > 0
              ? <KakaoMap places={places} selected={selected} onSelect={setSelected} />
              : <div className={isFetching ? 'map skeleton' : 'map'} aria-hidden="true" />}
          </div>
        )}
      </div>
    </>
  )
}
