import { callApi, isMock, json, mergeBooks, QUOTA_MESSAGE, QuotaError, toBooks } from './_lib/data4library.js'

const PAGE = { pageNo: '1', pageSize: '20' }
const found = (raw: any) => Number(raw?.response?.numFound ?? 0)

// GET /api/search?q=키워드
// 정보나루 키워드 검색은 "어린 왕자"에 "어린"·"왕자"가 들어간 아무 책이나 섞여서(1,104권 중 『어린 왕자』 없음),
// 제목 검색과 저자 검색을 함께 하고 결과가 더 많은 쪽(= 사용자가 의도한 쪽)을 위에 보여준다.
//   "어린 왕자": 제목 964 / 저자 0 → 제목 먼저,  "헤르만 헤세": 제목 124 / 저자 832 → 저자 먼저
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (!q || q.length > 100) return json({ error: '검색어는 1~100자로 입력해 주세요.' }, 400)

  try {
    const [byTitle, byAuthor] = await Promise.all([
      callApi('srchBooks', { title: q, ...PAGE }),
      callApi('srchBooks', { author: q, ...PAGE }),
    ])
    const ordered = found(byAuthor) > found(byTitle) ? [byAuthor, byTitle] : [byTitle, byAuthor]
    let books = mergeBooks(ordered.map(toBooks)).slice(0, 20)
    // 둘 다 없으면(출판사·주제어 등으로 찾은 경우) 키워드 검색으로 한 번 더
    if (books.length === 0) books = toBooks(await callApi('srchBooks', { keyword: q, ...PAGE }))
    return json({ mock: isMock(), items: books }, 200, 'max-age=86400, stale-while-revalidate=3600')
  } catch (e) {
    console.error(e)
    if (e instanceof QuotaError) return json({ error: QUOTA_MESSAGE }, 429)
    return json({ error: '도서 검색에 실패했어요. 잠시 후 다시 시도해 주세요.' }, 502)
  }
}
