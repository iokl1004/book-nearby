// 도서관 정보나루 Open API 호출 + 응답을 우리 앱 타입으로 정리하는 곳.
// 실제 응답 구조가 다르면 이 파일의 to* 함수만 고치면 된다.

import type { Availability, Book, Library } from './types.js'
import { cleanText } from './operating-time.js'
import { parseAuthors, parseGenre } from './authors.js'
import { getShared, setShared } from './shared-cache.js'

const BASE = 'http://data4library.kr/api'

// 키가 아직 없으면(승인 대기 중) 목업 데이터를 돌려준다.
export const isMock = () => !process.env.DATA4LIBRARY_KEY

// 정보나루는 IP 등록 전 하루 500건 한도가 있어서, 한도 초과는 다른 오류와 구분해 사용자에게 알려준다.
export class QuotaError extends Error {}

// 정보나루 호출 수를 줄이는 캐시. 메모리(서버 하나) → 공용 Redis(모든 서버) → 정보나루 순서로 찾는다.
// 신선한 기간: 검색 결과·소장 도서관 목록·책 정보는 하루, 대출 여부는 1시간 (CDN 캐시와 같은 기준)
const TTL: Record<string, number> = { srchBooks: 86_400_000, srchDtlList: 86_400_000, libSrchByBook: 86_400_000, bookExist: 3_600_000 }
// 공용 캐시에는 7일 보관해서, 정보나루가 실패(한도 초과 등)하면 지난 결과라도 보여준다.
// 단, 대출 여부는 지난 값이 헛걸음을 만들 수 있어 대신 쓰지 않는다.
const KEEP_SECONDS = 7 * 24 * 60 * 60
const STALE_OK = new Set(['srchBooks', 'srchDtlList', 'libSrchByBook'])

const MAX_ENTRIES = 2000
type Fetched = { raw: any; at: number } // at: 정보나루에서 실제로 받아 온 시각 (캐시에서 꺼내도 그대로)
const cache = new Map<string, { at: number; value: Promise<Fetched> }>()
export const clearCache = () => cache.clear()

export const callApi = (op: string, params: Record<string, string>): Promise<any> => callApiTimed(op, params).then((r) => r.raw)

// 응답과 함께 "언제 받아 온 값인지"도 돌려준다. 대출 여부가 몇 분 전 기준인지 화면에 보여주는 데 쓴다
export function callApiTimed(op: string, params: Record<string, string>): Promise<Fetched> {
  const key = process.env.DATA4LIBRARY_KEY
  if (!key) return Promise.resolve({ raw: MOCK[op](params), at: Date.now() })

  const id = `${op}?${new URLSearchParams(params)}`
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < (TTL[op] ?? 0)) return hit.value

  // 진행 중인 요청도 저장해서, 동시에 들어온 같은 요청은 한 번만 호출한다
  const value = fetchShared(op, params, key, id)
  cache.set(id, { at: Date.now(), value })
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!) // 가장 오래된 것부터 버린다
  value.catch(() => cache.delete(id)) // 실패한 응답은 저장하지 않는다
  return value
}

async function fetchShared(op: string, params: Record<string, string>, key: string, id: string): Promise<Fetched> {
  const sharedKey = `d4l:${id}`
  const stored = await getShared(sharedKey)
  if (stored && Date.now() - stored.at < (TTL[op] ?? 0)) return stored
  try {
    const raw = await fetchApi(op, params, key)
    await setShared(sharedKey, raw, KEEP_SECONDS)
    return { raw, at: Date.now() }
  } catch (e) {
    if (stored && STALE_OK.has(op)) {
      console.warn(`정보나루 ${op} 실패, 지난 결과로 대신함:`, e instanceof Error ? e.message : e)
      return stored
    }
    throw e
  }
}

async function fetchApi(op: string, params: Record<string, string>, key: string) {
  const qs = new URLSearchParams({ ...params, authKey: key, format: 'json' })
  const res = await fetch(`${BASE}/${op}?${qs}`)
  if (!res.ok) throw new Error(`정보나루 ${op} 호출 실패 (${res.status})`)
  const raw: any = await res.json()
  // 키 오류·한도 초과 등은 200 응답 안에 error 문자열로 온다.
  const error = raw?.response?.error
  if (error) {
    if (/500건|IP 등록/.test(error)) throw new QuotaError(`정보나루 ${op} 한도 초과: ${error}`)
    throw new Error(`정보나루 ${op} 오류: ${error}`)
  }
  return raw
}

export const QUOTA_MESSAGE = '오늘 조회 가능한 횟수를 모두 사용했어요. 내일 다시 시도해 주세요.'

export const toBooks = (raw: any): Book[] => (raw?.response?.docs ?? []).map(({ doc }: any) => toBook(doc))

// 상세 조회(srchDtlList)는 같은 항목을 response.detail[0].book에 담아 준다. 없으면 null
export const toBookDetail = (raw: any): Book | null => {
  const book = raw?.response?.detail?.[0]?.book
  return book?.isbn13 ? toBook(book) : null
}

// 검색 결과와 상세 조회가 같은 정리 규칙을 쓰도록 한 곳에 둔다
const toBook = (doc: any): Book => ({
    isbn13: doc.isbn13,
    // 정보나루가 값을 안 주는 경우가 있어서(출판연도 없음 등) 화면에 "undefined"가 나오지 않게 빈 글자로 맞춘다
    title: bookTitle(doc.bookname, doc.vol),
    authors: text(doc.authors),
    contributors: parseAuthors(text(doc.authors)),
    genre: parseGenre(doc.class_nm),
    publisher: text(doc.publisher),
    year: publicationYear(doc.publication_year),
    image: text(doc.bookImageURL).replace(/^http:/, 'https:'), // https 사이트에서 혼합 콘텐츠로 막히지 않게
  })

const text = (v: unknown) => (v == null ? '' : String(v).trim())

// 정보나루 출판연도는 형식이 제각각이다. 목록 표기가 잘려 오기도 한다.
// "2011" → "2011", "2016-05-25" → "2016", "[201"("[201-]", 2010년대) → "2010년대", "c202" → "2020년대", 그 외 → ""
export function publicationYear(raw: unknown): string {
  const v = text(raw)
  const full = v.match(/\d{4}/)
  if (full) return full[0]
  const decade = v.match(/\d{3}/)
  return decade ? `${decade[0]}0년대` : ''
}

// 여러 검색 결과를 순서대로 이어 붙이고, 같은 책(ISBN)은 처음 나온 것만 남긴다
export function mergeBooks(lists: Book[][]): Book[] {
  const seen = new Set<string>()
  return lists.flat().filter((b) => !seen.has(b.isbn13) && seen.add(b.isbn13))
}

// 부제가 빠져 끝에 남은 콜론("용선생 만화 한국사:")을 지우고,
// 시리즈는 권 번호를 붙여 구분한다 (1~12권이 모두 같은 제목으로 보이던 문제)
export function bookTitle(name: unknown, vol: unknown): string {
  const base = text(name)
    .replace(/\s*[:;,=]\s*$/, '')
    .replace(/\s+:\s*/g, ': ') // "토지 :박경리 대하소설" → "토지: 박경리 대하소설" ("1:1"처럼 붙은 콜론은 그대로)
    .replace(/\s*=\s*/g, ' = ') // "모두의 파이썬 =20일 만에" → "모두의 파이썬 = 20일 만에"
  const v = text(vol)
  return v ? `${base} ${/^\d+$/.test(v) ? `${v}권` : v}` : base
}

export const toLibraries = (raw: any): Library[] =>
  (raw?.response?.libs ?? []).map(({ lib }: any) => ({
    code: lib.libCode,
    name: lib.libName,
    address: lib.address,
    tel: lib.tel,
    lat: Number(lib.latitude),
    lng: Number(lib.longitude),
    homepage: safeUrl(lib.homepage),
    closed: cleanText(lib.closed),
    operatingTime: cleanText(lib.operatingTime),
  }))

// 외부에서 온 주소를 링크로 쓰므로 http(s)만 허용한다 (javascript: 같은 주소 차단). "www.xx.kr"처럼 프로토콜이 빠진 곳은 붙여준다.
export function safeUrl(raw: unknown): string {
  const url = String(raw ?? '').trim()
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) return `http://${url}`
  return ''
}

export const toAvailability =(raw: any): Availability => ({
  hasBook: raw?.response?.result?.hasBook === 'Y',
  loanAvailable: raw?.response?.result?.loanAvailable === 'Y',
})

// cdnCache: Vercel CDN만 따르는 캐시 설정 (예: 'max-age=3600, stale-while-revalidate=600')
export function json(body: unknown, status = 200, cdnCache?: string): Response {
  // 브라우저는 저장하지 않고 매번 CDN에 묻는다.
  // Cache-Control 하나에 stale-while-revalidate를 넣으면 브라우저도 오래된 응답을 먼저 보여줘서,
  // 사용자가 최대 1시간 전 대출 정보를 보게 됐다. 그래서 CDN 설정은 별도 헤더로 분리한다.
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }
  // Vercel CDN은 이 헤더대로 응답을 저장해서, 같은 요청은 정보나루를 다시 부르지 않는다
  if (cdnCache && status === 200) headers['Vercel-CDN-Cache-Control'] = cdnCache
  return new Response(JSON.stringify(body), { status, headers })
}

const MOCK: Record<string, (p: Record<string, string>) => unknown> = {
  srchBooks: ({ keyword, title, author }) => ({
    response: {
      numFound: 2,
      docs: [
        { doc: { isbn13: '9788900000001', bookname: `${title ?? author ?? keyword} 입문 (목업)`, authors: '홍길동', publisher: '목업출판', publication_year: '2024', bookImageURL: '' } },
        { doc: { isbn13: '9788900000002', bookname: `실전 ${title ?? author ?? keyword} (목업)`, authors: '김철수', publisher: '목업출판', publication_year: '2025', bookImageURL: '' } },
      ],
    },
  }),
  libSrchByBook: () => ({
    response: {
      libs: [
        // 실제 도서관 이름·위치(좌표는 일부러 20~30m 어긋나게)라서 운영시간 매칭까지 확인할 수 있다.
        { lib: { libCode: '100001', libName: '마포중앙도서관', address: '서울 마포구', tel: '', latitude: '37.5640', longitude: '126.9084', homepage: '' } },
        { lib: { libCode: '100002', libName: '성동구립도서관', address: '서울 성동구', tel: '', latitude: '37.5590', longitude: '127.0352', homepage: '' } },
        { lib: { libCode: '100003', libName: '중랑구립면목정보도서관', address: '서울 중랑구', tel: '', latitude: '37.5875', longitude: '127.0873', homepage: '' } },
      ],
    },
  }),
  srchDtlList: ({ isbn13 }) => ({
    response: { detail: [{ book: { isbn13, bookname: '목업 도서 (목업)', authors: '홍길동 지음', publisher: '목업출판', publication_year: '2024', bookImageURL: '' } }] },
  }),
  bookExist: ({ libCode }) => ({
    response: { result: { hasBook: 'Y', loanAvailable: libCode === '100002' ? 'N' : 'Y' } },
  }),
}
