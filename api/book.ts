import { callApi, json, QUOTA_MESSAGE, QuotaError, toBookDetail } from './_lib/data4library.js'

// GET /api/book?isbn=9788...
// 상세 페이지 주소로 바로 들어오거나(공유 링크, 새로고침) 검색 결과를 거치지 않았을 때 책 정보를 채운다.
export async function GET(request: Request): Promise<Response> {
  const isbn = new URL(request.url).searchParams.get('isbn') ?? ''
  if (!/^\d{13}$/.test(isbn)) return json({ error: 'ISBN(13자리)을 확인해 주세요.' }, 400)

  try {
    const book = toBookDetail(await callApi('srchDtlList', { isbn13: isbn, loaninfoYN: 'N' }))
    if (!book) return json({ error: '도서 정보를 찾을 수 없어요.' }, 404)
    // 책 정보는 거의 바뀌지 않아서 CDN에 하루 저장한다
    return json({ item: book }, 200, 'max-age=86400, stale-while-revalidate=3600')
  } catch (e) {
    console.error(e)
    if (e instanceof QuotaError) return json({ error: QUOTA_MESSAGE }, 429)
    // 형식만 맞고 실제로 없는 ISBN이면 정보나루가 "ISBN을 확인해 주시기 바랍니다"라고 답한다 → 서버 오류가 아니라 없는 책
    if (e instanceof Error && e.message.includes('ISBN')) return json({ error: '도서 정보를 찾을 수 없어요.' }, 404)
    return json({ error: '도서 정보를 불러오지 못했어요.' }, 502)
  }
}
