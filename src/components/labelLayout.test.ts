import { describe, expect, it } from 'vitest'
import { layoutLabels, type Pin } from './labelLayout'

const pin = (code: string, x: number, y: number, w = 100, h = 22): Pin => ({ code, x, y, w, h })

describe('지도 이름표 배치', () => {
  it('멀리 떨어져 있으면 모두 마커 아래', () => {
    const r = layoutLabels([pin('a', 100, 100), pin('b', 400, 300)])
    expect(r.get('a')).toEqual({ dx: -50, dy: 3 })
    expect(r.get('b')).toEqual({ dx: -50, dy: 3 })
  })

  it('바로 아래에 다른 마커가 있으면 그 마커를 덮지 않게 다른 쪽으로 옮긴다', () => {
    // 스크린샷 상황: KB(선택됨)가 가온 바로 아래 → KB 이름표는 아래, 가온 이름표는 아래로 가면 KB 마커를 덮음
    const r = layoutLabels([pin('kb', 320, 190), pin('gaon', 316, 160)])
    expect(r.get('kb')).toEqual({ dx: -50, dy: 3 })
    const g = r.get('gaon')!
    expect(g.dy).not.toBe(3) // 아래가 아닌 다른 자리
    // 가온 이름표가 KB 마커 영역(306~334, 150~190)을 덮지 않는다
    const rect = { l: 316 + g.dx, r: 316 + g.dx + 100, t: 160 + g.dy, b: 160 + g.dy + 22 }
    expect(rect.l >= 334 || rect.r <= 306 || rect.b <= 150 || rect.t >= 190).toBe(true)
  })

  it('네 방향이 모두 막히면 숨긴다 (마커는 그대로 누를 수 있음)', () => {
    const crowded = [pin('a', 200, 200), pin('b', 202, 200), pin('c', 200, 202), pin('d', 198, 199), pin('e', 201, 198)]
    const r = layoutLabels(crowded)
    expect(r.get('a')).not.toBeNull() // 우선순위가 가장 높은 것은 자리를 받는다
    expect([...r.values()].some((p) => p === null)).toBe(true)
  })
})
