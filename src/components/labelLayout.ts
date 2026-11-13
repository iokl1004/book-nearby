// 지도 이름표가 다른 이름표나 다른 마커를 덮지 않도록 자리를 정한다.
// 이름표는 마커보다 위에 그려져서, 덮으면 그 아래 마커를 누를 수 없기 때문이다.

export type Pin = { code: string; x: number; y: number; w: number; h: number } // x,y = 마커 끝(뾰족한 곳)의 화면 좌표, w,h = 이름표 크기
export type Placement = { dx: number; dy: number } | null // 마커 끝 기준 이름표 왼쪽 위 위치, null = 숨김

type Rect = { l: number; t: number; r: number; b: number }
const overlaps = (a: Rect, b: Rect) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b

const PIN_W = 28, PIN_H = 40, GAP = 3

// 마커 그림이 차지하는 영역 (끝이 아래쪽 가운데)
const pinRect = (p: Pin): Rect => ({ l: p.x - PIN_W / 2, t: p.y - PIN_H, r: p.x + PIN_W / 2, b: p.y })

// 우선순위: 마커 아래 → 오른쪽 → 왼쪽 → 위
const candidates = (p: Pin): Placement[] => [
  { dx: -p.w / 2, dy: GAP },
  { dx: PIN_W / 2 + GAP, dy: -PIN_H + (PIN_H - p.h) / 2 },
  { dx: -PIN_W / 2 - GAP - p.w, dy: -PIN_H + (PIN_H - p.h) / 2 },
  { dx: -p.w / 2, dy: -PIN_H - GAP - p.h },
]

// pins는 우선순위 순서(선택된 도서관 먼저)로 받는다. 앞의 이름표가 좋은 자리를 먼저 가져간다.
export function layoutLabels(pins: Pin[]): Map<string, Placement> {
  const placed: Rect[] = []
  const result = new Map<string, Placement>()
  for (const p of pins) {
    const blockers = [...placed, ...pins.filter((o) => o.code !== p.code).map(pinRect)]
    const spot = candidates(p).find((c) => {
      const rect = { l: p.x + c!.dx, t: p.y + c!.dy, r: p.x + c!.dx + p.w, b: p.y + c!.dy + p.h }
      return !blockers.some((b) => overlaps(rect, b))
    }) ?? null
    if (spot) placed.push({ l: p.x + spot.dx, t: p.y + spot.dy, r: p.x + spot.dx + p.w, b: p.y + spot.dy + p.h })
    result.set(p.code, spot)
  }
  return result
}
