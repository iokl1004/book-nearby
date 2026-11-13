// 도서관 이름·주소·홈페이지 다루기 (브라우저와 서버, 동기화 스크립트가 같이 씀. 서버 전용 코드·import 없음)

// 정보나루 지역 코드
export const REGIONS: [code: string, name: string][] = [
  ['11', '서울'], ['21', '부산'], ['22', '대구'], ['23', '인천'], ['24', '광주'], ['25', '대전'],
  ['26', '울산'], ['29', '세종'], ['31', '경기'], ['32', '강원'], ['33', '충북'], ['34', '충남'],
  ['35', '전북'], ['36', '전남'], ['37', '경북'], ['38', '경남'], ['39', '제주'],
]

// 주소의 두 번째 칸 ("서울특별시 마포구 …" → "마포구", "경기도 수원시 …" → "수원시")
export const districtOf = (address: string) => address.trim().split(/\s+/)[1] ?? ''

// 같은 사이트를 다른 모양으로 적은 주소를 하나로 맞춘다
// "https://www.junggulib.or.kr/index.do" = "http://junggulib.or.kr/" = "junggulib.or.kr"
export const homepageKey = (url: string) =>
  url.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/(?:index|main)\.(?:do|php|html?|jsp|asp)$/, '')
    .replace(/\/+$/, '')

// 같은 홈페이지 주소를 2곳 이상이 쓰면 구·시 단위 통합 도서관 사이트로 본다 (예: nowonlib.kr = 노원구 작은도서관 27곳)
export function sharedHomepages(homepages: string[]): string[] {
  const count = new Map<string, number>()
  for (const url of homepages) {
    const key = homepageKey(url)
    if (key) count.set(key, (count.get(key) ?? 0) + 1)
  }
  return [...count].filter(([, n]) => n >= 2).map(([key]) => key).sort()
}

// 정보나루 이름에는 운영 기관이 붙어 있는데 카카오맵에는 빠진 경우가 많다.
// "강남구립도곡정보문화도서관" → "도곡정보문화도서관", "중구구립 가온도서관" → "가온도서관",
// "서울특별시교육청마포평생학습관" → "마포평생학습관", "논현문화마루도서관(분관)" → "논현문화마루도서관"
export function shortName(name: string): string {
  const short = name
    .replace(/\(.*?\)/g, '')
    .replace(/^[가-힣]+교육청\s*/, '')
    .replace(/^[가-힣]{1,4}(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구)립\s*/, '')
    .replace(/^(?:구|시|군|도)립\s*/, '')
    .trim()
  return short.length >= 3 ? short : name.trim() // 너무 짧아지면 원래 이름을 쓴다
}
