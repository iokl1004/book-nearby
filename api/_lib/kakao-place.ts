import type { Library } from './types.js'
import { shortName } from './names.js'

// 카카오 로컬 API로 도서관의 카카오맵 장소 ID를 찾는다.
// 장소 ID가 있으면 "카카오맵 정보보기"가 그 장소가 선택된 화면으로 바로 열린다.
const ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json'
const normalize = (name: string) => name.replace(/\s|\(.*?\)/g, '')

type Doc = { id: string; place_name: string; category_name?: string; distance?: string }

// 정확도순으로 받은 결과에서 고른다 (거리순이면 같은 건물의 식당·주차장이 먼저 나옴).
// 1) 이름이 똑같은 곳
// 2) 100m 안에서 이름이 비슷한 곳
//    - 카카오 이름이 우리 이름 안에 들어 있음 ("마포평생학습관 아현분관" ⊂ "서울특별시교육청마포평생학습관아현분관")
//    - '도서관' 분류이면서 우리 이름을 포함하거나 앞 두 글자가 같음 ("중구구립 가온도서관", "갈산공공도서관")
//      (분류 조건 덕분에 "가온도서관 개방화장실" 같은 곳은 제외)
export function pickPlace(name: string, docs: Doc[]): string | null {
  const target = normalize(name)
  const exact = docs.find((d) => normalize(d.place_name) === target)
  if (exact) return exact.id
  const near = docs.find((d) => {
    const n = normalize(d.place_name)
    if (Number(d.distance) > 100) return false
    if (n.length >= 4 && target.includes(n)) return true
    return !!d.category_name?.includes('도서관') && (n.includes(target) || n.slice(0, 2) === target.slice(0, 2))
  })
  return near?.id ?? null
}

// 정보나루 좌표가 실제 위치와 1~2km 어긋난 도서관이 있어서, 못 찾으면 5km까지 넓혀 이름이 똑같은 곳만 인정한다.
export function pickPlaceFar(name: string, docs: Doc[]): string | null {
  const target = normalize(name)
  return docs.find((d) => normalize(d.place_name) === target && Number(d.distance) <= 5000)?.id ?? null
}

async function search(key: string, query: string, lib: Pick<Library, 'lat' | 'lng'>, radius: string): Promise<Doc[]> {
  const qs = new URLSearchParams({ query, x: String(lib.lng), y: String(lib.lat), radius, sort: 'accuracy', size: '5' })
  const res = await fetch(`${ENDPOINT}?${qs}`, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!res.ok) throw new Error(`카카오 로컬 API ${res.status}`)
  return ((await res.json()) as any).documents ?? []
}

// 앞 단계에서 찾으면 멈춘다 (카카오 호출 최소화)
// 1) 원래 이름으로 1km 안  2) 꾸밈말 뗀 이름("강남구립" 등 제거)으로 1km 안  3) 짧은 이름으로 5km 안에서 이름이 똑같은 곳
async function lookup(key: string, lib: Pick<Library, 'name' | 'lat' | 'lng'>): Promise<string | null> {
  const short = shortName(lib.name)
  const found = pickPlace(lib.name, await search(key, lib.name, lib, '1000'))
  if (found) return found
  if (short !== lib.name) {
    // pickPlace는 "카카오 이름이 우리 이름 안에 들어 있음"도 인정하므로 원래 이름으로 비교한다
    const byShort = pickPlace(lib.name, await search(key, short, lib, '1000'))
    if (byShort) return byShort
  }
  const far = await search(key, short, lib, '5000')
  return pickPlaceFar(short, far) ?? pickPlaceFar(lib.name, far)
}

// 장소 ID는 거의 바뀌지 않아서 찾은 결과(못 찾은 결과 포함)를 메모리에 저장한다.
const cache = new Map<string, Promise<string | null>>()
export const clearPlaceCache = () => cache.clear()

export function findPlaceId(lib: Pick<Library, 'name' | 'lat' | 'lng'>): Promise<string | null> {
  const key = process.env.KAKAO_REST_KEY
  if (!key) return Promise.resolve(null)
  const id = `${lib.name}@${lib.lat},${lib.lng}`
  let hit = cache.get(id)
  if (!hit) {
    hit = lookup(key, lib)
    hit.catch(() => cache.delete(id)) // 실패는 저장하지 않는다
    cache.set(id, hit)
    if (cache.size > 2000) cache.delete(cache.keys().next().value!)
  }
  // 부가 기능이라 실패해도 목록은 그대로 보여주고, 링크는 검색으로 대신한다
  return hit.catch(() => null)
}
