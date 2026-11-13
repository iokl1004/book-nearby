import type { Hours, HoursRecord, Library } from './types.js'

// 정보나루와 표준데이터는 도서관 코드가 달라서 좌표 + 이름으로 짝을 찾는다.
const normalize = (name: string) => name.replace(/\s|\(.*?\)|\[.*?\]/g, '')

export function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.hypot(x, y) * 6_371_000
}

// 300m 안에서 이름이 겹치는 곳을 먼저 고르고, 이름이 달라도 100m 안이면 같은 도서관으로 본다.
// (같은 건물에 어린이도서관이 붙어 있는 경우를 이름으로 가려내기 위해)
export function matchHours(lib: Library, records: HoursRecord[]): Hours | null {
  const name = normalize(lib.name)
  const near = records
    .map((r) => ({ r, d: meters(lib, r) }))
    .filter((x) => x.d <= 300)
    .sort((a, b) => a.d - b.d)
  const byName = near.find(({ r }) => {
    const n = normalize(r.name)
    return n.includes(name) || name.includes(n)
  })
  const hit = byName ?? near.find((x) => x.d <= 100)
  if (!hit) return null
  const { closeDay, weekday, saturday, holiday } = hit.r
  return { closeDay, weekday, saturday, holiday }
}
