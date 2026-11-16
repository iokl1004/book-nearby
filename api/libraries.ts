import { callApi, callApiTimed, isMock, json, QUOTA_MESSAGE, QuotaError, toAvailability, toLibraries } from './_lib/data4library.js'
import { matchHours, meters } from './_lib/match-hours.js'
import { findPlaceId } from './_lib/kakao-place.js'
import type { Hours, HoursRecord, Library } from './_lib/types.js'
import { homepageKey } from './_lib/names.js'
import { parseOperatingTime } from './_lib/operating-time.js'
import { filterLibraries } from './_lib/library-filter.js'
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

// 도서관마다 대출 여부를 따로 호출하므로(정보나루 하루 한도), 가까운 순으로 정렬한 뒤 3곳씩 나눠 조회한다.
// 처음엔 3곳만, 더 보고 싶으면 "도서관 더 보기"로 다음 3곳 (offset). 상세 화면 1번에 5건 → 3건.
const PAGE_SIZE = 3
const MAX_PAGE_SIZE = 10

// GET /api/libraries?isbn=9788...&region=11[&lat=37.56&lng=126.97][&offset=3][&limit=3][&q=노원][&openOn=20261116]
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const isbn = params.get('isbn') ?? ''
  const region = params.get('region') ?? '11'
  if (!/^\d{13}$/.test(isbn) || !/^\d{2}$/.test(region)) {
    return json({ error: 'ISBN(13자리)과 지역 코드를 확인해 주세요.' }, 400)
  }
  const lat = Number(params.get('lat')), lng = Number(params.get('lng'))
  const here = params.has('lat') && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 ? { lat, lng } : null
  const offset = Math.max(0, Math.floor(Number(params.get('offset')) || 0))
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(params.get('limit')) || PAGE_SIZE)))
  const q = (params.get('q') ?? '').trim().slice(0, 30)
  const openOn = params.get('openOn') ?? ''

  try {
    // 정보나루는 가나다순으로 주기 때문에 전부 받아서 거리순으로 다시 정렬한다.
    // shortcut: 한 지역에 500곳 넘게 소장한 책은 앞 500곳만 본다.
    const all = toLibraries(await callApi('libSrchByBook', { isbn, region, pageSize: '500' }))
    const sorted = here
      ? all.map((lib) => ({ ...lib, distance: Math.round(meters(here, lib)) })).sort((a, b) => a.distance - b.distance)
      : all
    // 이름·동네 검색과 "오늘 여는 곳만"은 대출 여부를 묻기 전에 걸러서 정보나루 호출이 늘지 않는다
    const hoursCache = new Map<string, Hours | null>()
    const hoursOf = (lib: Library) => {
      if (!hoursCache.has(lib.code)) hoursCache.set(lib.code, matchHours(lib, HOURS) ?? fallbackHours(lib))
      return hoursCache.get(lib.code)!
    }
    const nearest = q || openOn ? filterLibraries(sorted, { q, openOn }, hoursOf) : sorted
    const items = await Promise.all(
      nearest.slice(offset, offset + limit).map(async (lib) => {
        const [exist, placeId] = await Promise.all([callApiTimed('bookExist', { libCode: lib.code, isbn13: isbn }), findPlaceId(lib)])
        return {
          ...lib,
          ...toAvailability(exist.raw),
          checkedAt: exist.at, // 대출 여부를 정보나루에서 확인한 시각 (캐시 때문에 최대 1시간 전일 수 있다)
          placeId,
          homepageShared: !!lib.homepage && SHARED_HOMEPAGES.has(homepageKey(lib.homepage)),
          hours: hoursOf(lib),
        }
      }),
    )
    // nextOffset: 다음 묶음의 시작 위치, 더 없으면 null
    // total: 지역 전체, matched: 거른 뒤 남은 수 (거르지 않으면 total과 같다)
    const nextOffset = offset + limit < nearest.length ? offset + limit : null
    return json({ mock: isMock(), total: all.length, matched: nearest.length, items, nextOffset }, 200, 'max-age=3600, stale-while-revalidate=600')
  } catch (e) {
    console.error(e)
    if (e instanceof QuotaError) return json({ error: QUOTA_MESSAGE }, 429)
    return json({ error: '도서관 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502)
  }
}
