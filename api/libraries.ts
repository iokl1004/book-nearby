import { callApi, isMock, json, QUOTA_MESSAGE, QuotaError, toAvailability, toLibraries } from './_lib/data4library.js'
import { matchHours, meters } from './_lib/match-hours.js'
import { findPlaceId } from './_lib/kakao-place.js'
import type { Hours, HoursRecord, Library } from './_lib/types.js'
import { homepageKey } from './_lib/names.js'
import { parseOperatingTime } from './_lib/operating-time.js'
import hoursData from './_data/library-hours.json' with { type: 'json' }
import sharedData from './_data/shared-homepages.json' with { type: 'json' }

// 운영시간은 1년 단위 데이터라 미리 받아둔 파일에서 찾는다 (scripts/sync-library-hours.ts)
const HOURS = hoursData as HoursRecord[]
// 여러 도서관이 같이 쓰는 구·시 통합 홈페이지 (scripts/sync-shared-homepages.ts)
const SHARED_HOMEPAGES = new Set(sharedData as string[])

// 표준데이터에 없는 곳(평생학습관, 일부 작은도서관)은 정보나루의 휴관일·운영시간 글자로 대신한다.
// 운영시간 글자가 깔끔하면 시간으로 해석하고, 애매하면 원문(text)만 넘겨 화면에 그대로 보여준다.
export function fallbackHours(lib: Pick<Library, 'closed' | 'operatingTime'>): Hours | null {
  if (!lib.closed && !lib.operatingTime) return null
  const parsed = parseOperatingTime(lib.operatingTime)
  return {
    closeDay: lib.closed,
    weekday: parsed?.weekday ?? null,
    saturday: parsed?.weekend ?? null,
    holiday: parsed?.weekend ?? null, // 일요일도 주말 시간
    ...(!parsed && lib.operatingTime && { text: lib.operatingTime }),
  }
}

// 도서관마다 대출 여부를 따로 호출하므로(정보나루 하루 한도), 가까운 순으로 정렬한 뒤 앞 5곳만 조회한다.
const MAX_LIBRARIES = 5

// GET /api/libraries?isbn=9788...&region=11[&lat=37.56&lng=126.97]
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const isbn = params.get('isbn') ?? ''
  const region = params.get('region') ?? '11'
  if (!/^\d{13}$/.test(isbn) || !/^\d{2}$/.test(region)) {
    return json({ error: 'ISBN(13자리)과 지역 코드를 확인해 주세요.' }, 400)
  }
  const lat = Number(params.get('lat')), lng = Number(params.get('lng'))
  const here = params.has('lat') && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 ? { lat, lng } : null

  try {
    // 정보나루는 가나다순으로 주기 때문에 전부 받아서 거리순으로 다시 정렬한다.
    // shortcut: 한 지역에 500곳 넘게 소장한 책은 앞 500곳만 본다.
    const all = toLibraries(await callApi('libSrchByBook', { isbn, region, pageSize: '500' }))
    const nearest = here
      ? all.map((lib) => ({ ...lib, distance: Math.round(meters(here, lib)) })).sort((a, b) => a.distance - b.distance)
      : all
    const items = await Promise.all(
      nearest.slice(0, MAX_LIBRARIES).map(async (lib) => {
        const [exist, placeId] = await Promise.all([callApi('bookExist', { libCode: lib.code, isbn13: isbn }), findPlaceId(lib)])
        return {
          ...lib,
          ...toAvailability(exist),
          placeId,
          homepageShared: !!lib.homepage && SHARED_HOMEPAGES.has(homepageKey(lib.homepage)),
          hours: matchHours(lib, HOURS) ?? fallbackHours(lib),
        }
      }),
    )
    return json({ mock: isMock(), total: all.length, items }, 200, 'max-age=3600, stale-while-revalidate=600')
  } catch (e) {
    console.error(e)
    if (e instanceof QuotaError) return json({ error: QUOTA_MESSAGE }, 429)
    return json({ error: '도서관 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502)
  }
}
