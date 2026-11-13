import { callApi, isMock, json, QUOTA_MESSAGE, QuotaError } from './_lib/data4library.js'
import { REGIONS } from './_lib/names.js'

// GET /api/regions?isbn=9788...
// 고른 지역에 이 판본이 없을 때, 어느 지역에 몇 곳 있는지 알려준다.
// 정보나루는 지역을 꼭 지정해야 해서 17개 시·도를 동시에 묻는다. 개수만 필요하니 pageSize=1로 가볍게 받는다.
// (같은 책은 서버 메모리·CDN에 하루 저장되므로 다시 물어보지 않는다)
export async function GET(request: Request): Promise<Response> {
  const isbn = new URL(request.url).searchParams.get('isbn') ?? ''
  if (!/^\d{13}$/.test(isbn)) return json({ error: 'ISBN(13자리)을 확인해 주세요.' }, 400)

  try {
    const counts = await Promise.all(
      REGIONS.map(async ([code, name]) => {
        const raw: any = await callApi('libSrchByBook', { isbn, region: code, pageSize: '1' })
        const count = Number(raw?.response?.numFound ?? raw?.response?.libs?.length ?? 0)
        return { code, name, count }
      }),
    )
    const items = counts.filter((r) => r.count > 0).sort((a, b) => b.count - a.count)
    return json({ mock: isMock(), items }, 200, 'max-age=86400, stale-while-revalidate=3600')
  } catch (e) {
    console.error(e)
    if (e instanceof QuotaError) return json({ error: QUOTA_MESSAGE }, 429)
    return json({ error: '다른 지역 정보를 불러오지 못했어요.' }, 502)
  }
}
