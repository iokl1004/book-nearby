import { regionCodeOf } from '../../api/_lib/names'

// 카카오맵 SDK 불러오기와 좌표 → 지역 변환. 지도 화면과 "내 위치" 버튼이 함께 쓴다.

declare global {
  interface Window { kakao: any }
}

export const KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined
let sdk: Promise<void> | undefined

// libraries=services: 좌표 → 행정구역 변환(지역 자동 선택)에 쓴다. 브라우저에서 처리돼 서버 호출이 늘지 않는다
export function loadSdk() {
  sdk ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&libraries=services&autoload=false`
    script.onload = () => window.kakao.maps.load(() => resolve())
    script.onerror = () => reject(new Error('카카오맵을 불러오지 못했어요. 키와 등록 도메인을 확인해 주세요.'))
    document.head.append(script)
  })
  return sdk
}

// 좌표가 속한 시·도의 정보나루 지역 코드 ("경기도" → "31"). 알 수 없으면 null
export async function regionCodeAt(lat: number, lng: number): Promise<string | null> {
  if (!KEY) return null
  try {
    await loadSdk()
    const geocoder = new window.kakao.maps.services.Geocoder()
    const name = await new Promise<string | null>((resolve) =>
      geocoder.coord2RegionCode(lng, lat, (result: { region_1depth_name: string }[], status: string) =>
        resolve(status === window.kakao.maps.services.Status.OK ? result[0]?.region_1depth_name ?? null : null)))
    return name ? regionCodeOf(name) : null
  } catch {
    return null // 지역을 못 알아내도 위치 정렬은 그대로 동작
  }
}

