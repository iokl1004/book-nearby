import { formatDistance, homepageLabel } from '../api'
import type { Status } from '../hours'
import { districtOf, shortName } from '../../api/_lib/names'

// 지도 위 정보 카드(마커를 누르면 뜨는 카드)와 카드에 쓰는 DOM 도우미.
// 카카오 CustomOverlay는 DOM 노드를 받아서 React가 아니라 DOM으로 직접 만든다.

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

// 도서관 이름 등은 외부 API 값이라 innerHTML이 아니라 textContent로 넣는다.
export function el(tag: string, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

export function infoCard(place: Place, onClose: () => void) {
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

