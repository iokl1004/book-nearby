import { closeReason, dayParts } from './close-day.js'
import type { Hours, Library } from './types.js'

// 소장 도서관 목록 거르기. 대출 여부를 묻기 "전에" 거르므로 정보나루 호출이 늘지 않는다.
// q: 도서관 이름이나 주소(구·동)에 들어 있는 말 ("노원", "도곡")
// openOn: "20261116" 그날 휴관이 아닌 곳만. 휴관일 정보가 없는 곳은 알 수 없으니 남겨 둔다.
export function filterLibraries<T extends Library>(
  libs: T[],
  { q, openOn }: { q?: string; openOn?: string },
  hoursOf: (lib: T) => Hours | null,
): T[] {
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const date = openOn && /^\d{8}$/.test(openOn) ? dayParts(openOn) : null
  return libs.filter((lib) => {
    const text = `${lib.name} ${lib.address}`.toLowerCase().replace(/\s/g, '')
    if (!words.every((w) => text.includes(w))) return false
    if (!date) return true
    const hours = hoursOf(lib)
    return !hours?.closeDay || closeReason(hours.closeDay, date) === null
  })
}
