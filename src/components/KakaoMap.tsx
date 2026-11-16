import { useEffect, useRef, useState } from 'react'
import { formatDistance, homepageLabel } from '../api'
import type { Status } from '../hours'
import { districtOf, regionCodeOf, shortName } from '../../api/_lib/names'
import { layoutLabels } from './labelLayout'

declare global {
  interface Window { kakao: any }
}

const KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined
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

export type Place = {
  code: string
  name: string
  lat: number
  lng: number
  address: string
  tel: string
  homepage: string
  homepageShared?: boolean
  placeId?: string | null
  available: boolean
  status: Status
  distance?: number
}

const pin = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 40 14 40s14-15.7 14-26.1C28 6.2 21.7 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="5.5" fill="#fff"/></svg>`,
  )}`
const PIN_OK = pin('#1f5c45')
const PIN_NO = pin('#a63d2f')

// 도서관 이름 등은 외부 API 값이라 innerHTML이 아니라 textContent로 넣는다.
function el(tag: string, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

function infoCard(place: Place, onClose: () => void) {
  const card = el('div', 'map-card')
  const head = el('div', 'map-card-head')
  head.append(el('strong', '', place.name))
  const close = el('button', 'map-card-close', '×') as HTMLButtonElement
  close.type = 'button'
  close.ariaLabel = '닫기'
  close.onclick = onClose
  head.append(close)
  card.append(head)
  if (place.distance != null) card.append(el('span', 'meta', `${formatDistance(place.distance)} · ${place.address}`))
  else card.append(el('span', 'meta', place.address))
  if (place.tel) {
    // 휴대폰에서 누르면 바로 전화가 걸린다
    const tel = el('a', 'map-card-tel', `☎ ${place.tel}`) as HTMLAnchorElement
    tel.href = `tel:${place.tel.replace(/[^\d+]/g, '')}`
    card.append(tel)
  }
  const row = el('div', 'map-card-row')
  row.append(el('span', place.available ? 'badge ok' : 'badge no', place.available ? '대출 가능' : '대출 중'))
  const status = el('span', `open-state ${place.status.kind}`)
  status.append(el('b', '', place.status.label))
  row.append(status)
  card.append(row)
  const links = el('div', 'map-card-links')
  links.append(
    externalLink('카카오맵 길찾기 →', `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`),
    // 장소 ID를 찾았으면 그 장소가 선택된 화면으로, 못 찾았으면 검색 결과로 연다
    externalLink('카카오맵 정보보기 →', place.placeId
      ? `https://map.kakao.com/link/map/${place.placeId}`
      : `https://map.kakao.com/link/search/${encodeURIComponent(searchQuery(place))}`),
  )
  if (place.homepage) links.append(externalLink(`${homepageLabel(place)} →`, place.homepage))
  card.append(links)
  return card
}

function externalLink(text: string, href: string) {
  const a = el('a', 'map-card-link', text) as HTMLAnchorElement
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  return a
}

// 장소 ID를 못 찾았을 때 쓰는 검색어.
// 카카오맵은 "강남구립…"처럼 운영 기관이 붙은 이름으로는 못 찾는 경우가 많아서 짧은 이름을 쓰고,
// 같은 이름의 도서관이 여러 지역에 있을 수 있어서 주소의 구/시를 앞에 붙인다.
export function searchQuery(place: Pick<Place, 'name' | 'address'>) {
  const name = shortName(place.name)
  const district = districtOf(place.address)
  return name.includes(district) ? name : `${district} ${name}`.trim()
}

type Props = { places: Place[]; selected: string | null; onSelect: (code: string | null) => void }

export default function KakaoMap({ places, selected, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const markers = useRef(new Map<string, any>())
  const overlay = useRef<any>(null)
  const labels = useRef(new Map<string, { overlay: any; el: HTMLElement }>())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // 이름표가 다른 이름표·마커를 덮지 않게 자리를 다시 잡는다 (지도 이동·확대가 끝날 때, 선택이 바뀔 때)
  const relayout = useRef(() => {})
  relayout.current = () => {
    if (!map.current || labels.current.size === 0) return
    const { maps } = window.kakao
    const proj = map.current.getProjection()
    const ordered = [...places].sort((a, b) => Number(b.code === selected) - Number(a.code === selected)) // 선택된 도서관 먼저
    const pins = ordered.flatMap((p) => {
      const label = labels.current.get(p.code)
      if (!label) return []
      const pt = proj.containerPointFromCoords(new maps.LatLng(p.lat, p.lng))
      return [{ code: p.code, x: pt.x, y: pt.y, w: label.el.offsetWidth, h: label.el.offsetHeight }]
    })
    for (const [code, spot] of layoutLabels(pins)) {
      const { el } = labels.current.get(code)!
      el.style.visibility = spot ? '' : 'hidden'
      if (spot) el.style.transform = `translate(${spot.dx}px, ${spot.dy}px)`
    }
  }

  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  // 도서관 목록이 바뀌면 마커를 다시 그린다 (지도는 한 번만 만든다)
  useEffect(() => {
    if (!KEY) return
    let cancelled = false
    loadSdk()
      .then(() => {
        if (cancelled || !ref.current) return
        const { maps } = window.kakao
        if (!map.current) {
          map.current = new maps.Map(ref.current, { center: new maps.LatLng(37.5665, 126.978), level: 8 })
          maps.event.addListener(map.current, 'click', () => onSelectRef.current(null))
          maps.event.addListener(map.current, 'idle', () => relayout.current())
        }
        markers.current.forEach((m) => m.setMap(null))
        markers.current.clear()
        labels.current.forEach(({ overlay }) => overlay.setMap(null))
        labels.current.clear()
        const bounds = new maps.LatLngBounds()
        for (const p of places) {
          const position = new maps.LatLng(p.lat, p.lng)
          const image = new maps.MarkerImage(p.available ? PIN_OK : PIN_NO, new maps.Size(28, 40), { offset: new maps.Point(14, 40) })
          const marker = new maps.Marker({ map: map.current, position, title: p.name, image, clickable: true })
          maps.event.addListener(marker, 'click', () => onSelectRef.current(p.code))
          markers.current.set(p.code, marker)

          // 마커 이름표. 지도를 덜 가리도록 "강남구립" 같은 꾸밈말을 뗀 짧은 이름을 쓴다.
          // 왼쪽 위를 마커 끝에 맞춰 두고, 실제 자리는 relayout이 translate로 옮긴다.
          const label = el('button', 'map-label', shortName(p.name)) as HTMLButtonElement
          label.type = 'button'
          label.onclick = () => onSelectRef.current(p.code)
          const overlay = new maps.CustomOverlay({ position, content: label, xAnchor: 0, yAnchor: 0, zIndex: 1, clickable: true })
          overlay.setMap(map.current)
          labels.current.set(p.code, { overlay, el: label })
          bounds.extend(position)
        }
        if (places.length) map.current.setBounds(bounds)
        relayout.current()
        setReady(true)
      })
      .catch((e: Error) => setError(e.message))
    return () => { cancelled = true }
  }, [places])

  // 선택된 도서관으로 지도를 옮기고 정보 카드를 띄운다
  useEffect(() => {
    overlay.current?.setMap(null)
    labels.current.forEach(({ overlay, el }, code) => {
      el.classList.toggle('active', code === selected)
      overlay.setZIndex(code === selected ? 4 : 1) // 겹칠 때 선택된 이름표가 위로
    })
    relayout.current() // 선택된 도서관 이름표가 먼저 자리를 잡도록 다시 배치
    const place = places.find((p) => p.code === selected)
    if (!ready || !place) return
    const { maps } = window.kakao
    const position = new maps.LatLng(place.lat, place.lng)
    overlay.current = new maps.CustomOverlay({
      position,
      content: infoCard(place, () => onSelectRef.current(null)),
      yAnchor: 1,
      zIndex: 10,
      clickable: true, // 카드 안을 눌러도 지도 클릭(닫기)으로 넘어가지 않게
    })
    overlay.current.setMap(map.current)
    // 카카오가 카드를 감싸는 투명한 상자는 카드 아래 여백(마커와의 간격)까지 덮어서, 그 아래 마커가 눌리지 않았다.
    // 상자는 클릭을 통과시키고 카드만 클릭을 받게 한다.
    const wrapper = (overlay.current.getContent() as HTMLElement).parentElement
    if (wrapper) wrapper.style.pointerEvents = 'none'
    // 마커를 정중앙이 아니라 조금 아래에 두어야 위에 뜨는 카드가 잘리지 않는다
    const proj = map.current.getProjection()
    const point = proj.containerPointFromCoords(position)
    map.current.panTo(proj.coordsFromContainerPoint(new maps.Point(point.x, point.y - 110)))
    markers.current.forEach((m, code) => m.setZIndex(code === selected ? 5 : 0))
  }, [selected, ready, places])

  if (!KEY) return <p className="notice">.env에 VITE_KAKAO_MAP_KEY를 넣으면 지도가 보여요.</p>
  if (error) return <p className="alert" role="alert">{error}</p>
  return <div ref={ref} className="map" role="region" aria-label="도서관 위치 지도" />
}
