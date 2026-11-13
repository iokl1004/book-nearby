import type { Availability, Book, Hours, Library } from '../api/_lib/types'
import { districtOf } from '../api/_lib/names'

export type { Book }
export type LibraryWithAvailability = Library & Availability & { hours: Hours | null; distance?: number; placeId?: string | null; homepageShared?: boolean }
type ListResponse<T> = { mock: boolean; items: T[]; total?: number }
export type Coords = { lat: number; lng: number }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `요청 실패 (${res.status})`)
  return body
}

export const searchBooks = (q: string) =>
  getJson<ListResponse<Book>>(`/api/search?${new URLSearchParams({ q })}`)

export const getLibraries = (isbn: string, region: string, here: Coords | null) =>
  getJson<ListResponse<LibraryWithAvailability>>(
    `/api/libraries?${new URLSearchParams({ isbn, region, ...(here && { lat: String(here.lat), lng: String(here.lng) }) })}`,
  )

export const getBook = (isbn: string) =>
  getJson<{ item: Book }>(`/api/book?${new URLSearchParams({ isbn })}`).then((r) => r.item)

export type RegionCount ={ code: string; name: string; count: number }
export const getRegionCounts = (isbn: string) =>
  getJson<{ mock: boolean; items: RegionCount[] }>(`/api/regions?${new URLSearchParams({ isbn })}`)

// 정확한 위치를 서버에 남기지 않고, 근처 사용자끼리 CDN 캐시를 같이 쓰도록 약 1km 단위로 반올림한다.
export function getRoundedPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('이 브라우저는 위치 확인을 지원하지 않아요.'))
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: Math.round(coords.latitude * 100) / 100, lng: Math.round(coords.longitude * 100) / 100 }),
      () => reject(new Error('위치 권한을 허용하면 가까운 도서관을 찾아드려요.')),
      { timeout: 10_000, maximumAge: 600_000 },
    )
  })
}

// 여러 도서관이 같이 쓰는 구·시 통합 사이트면 그렇게 알려준다 (그 도서관만의 사이트로 오해하지 않게)
export const homepageLabel = (lib: { homepageShared?: boolean; address: string }) => {
  if (!lib.homepageShared) return '도서관 홈페이지'
  const district = districtOf(lib.address)
  return district ? `${district} 통합 도서관 홈페이지` : '통합 도서관 홈페이지'
}

// 빈 정보는 빼고 " · "로 잇는다 ("사회평론 ·", "· undefined" 같은 모양이 안 나오게)
export const joinInfo = (...parts: (string | undefined)[]) => parts.filter((p) => p?.trim()).join(' · ')

export const formatDistance = (m: number) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`)

export { REGIONS } from '../api/_lib/names'
