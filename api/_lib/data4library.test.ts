import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookTitle, callApi, clearCache, publicationYear, QuotaError, safeUrl, toAvailability, toBooks, toLibraries } from './data4library.js'
import { fallbackHours, GET as libraries } from '../libraries.js'

describe('표준데이터에 없는 도서관의 운영시간', () => {
  it('깔끔한 운영시간 글자는 시간으로 해석한다', () => {
    expect(fallbackHours({ closed: '매주 월요일', operatingTime: '평일 09:00~22:00 / 주말 09:00~18:00' })).toEqual({
      closeDay: '매주 월요일', weekday: ['09:00', '22:00'], saturday: ['09:00', '18:00'], holiday: ['09:00', '18:00'],
    })
  })
  it('애매한 글자는 원문만 넘긴다', () => {
    const text = '자료실(평일 09:00~22:00, 주말 09:00~18:00), 열람실(평일/주말 07:00~22:00)'
    expect(fallbackHours({ closed: '', operatingTime: text })).toEqual({ closeDay: '', weekday: null, saturday: null, holiday: null, text })
  })
  it('둘 다 없으면 null', () => {
    expect(fallbackHours({ closed: '', operatingTime: '' })).toBeNull()
  })
})

describe('정보나루 응답 정리', () => {
  it('도서 검색 결과를 Book으로 바꾼다', () => {
    const books = toBooks({ response: { docs: [{ doc: { isbn13: '1', bookname: '책', authors: 'a', publisher: 'p', publication_year: '2024', bookImageURL: 'u' } }] } })
    expect(books).toEqual([{ isbn13: '1', title: '책', authors: 'a', contributors: [{ role: '저자', names: ['a'] }], genre: '', publisher: 'p', year: '2024', image: 'u' }])
  })

  it('빠진 값은 빈 글자로, 제목 끝에 남은 콜론은 지운다', () => {
    // 실제 사례: 용선생 만화 한국사 (출판연도 없음, 부제가 빠진 제목)
    const [book] = toBooks({ response: { docs: [{ doc: { isbn13: '1', bookname: '용선생 만화 한국사: ', vol: '3', authors: '글: 정상민,주성윤', publisher: '사회평론' } }] } })
    expect(book).toEqual({ isbn13: '1', title: '용선생 만화 한국사 3권', authors: '글: 정상민,주성윤', contributors: [{ role: '글', names: ['정상민', '주성윤'] }], genre: '', publisher: '사회평론', year: '', image: '' })
  })

  it('권 번호: 숫자면 "N권", 아니면 그대로, 없으면 제목만', () => {
    expect(bookTitle('토지', '상')).toBe('토지 상')
    expect(bookTitle('어린 왕자', '')).toBe('어린 왕자')
    expect(bookTitle('어린 왕자', undefined)).toBe('어린 왕자')
  })

  it.each([
    ['2011', '2011'], ['2016-05-25', '2016'], ['[201', '2010년대'], ['c202', '2020년대'], ['[200', '2000년대'], ['', ''], [undefined, ''],
  ])('출판연도 %s → %s', (raw, expected) => {
    expect(publicationYear(raw)).toBe(expected)
  })

  it('부제 기호 띄어쓰기를 정리한다', () => {
    expect(bookTitle('토지 :박경리 대하소설', '1')).toBe('토지: 박경리 대하소설 1권')
    expect(bookTitle('모두의 파이썬 =20일 만에 배우는 프로그래밍 기초', '')).toBe('모두의 파이썬 = 20일 만에 배우는 프로그래밍 기초')
    expect(bookTitle('혼자 공부하는 파이썬 :1:1 과외하듯 배우는', '')).toBe('혼자 공부하는 파이썬: 1:1 과외하듯 배우는')
  })

  it('좌표를 숫자로 바꾼다', () => {
    const [lib] = toLibraries({ response: { libs: [{ lib: { libCode: 'c', latitude: '37.5', longitude: '127' } }] } })
    expect([lib.lat, lib.lng]).toEqual([37.5, 127])
  })

  it('Y/N을 boolean으로 바꾸고, 빈 응답은 빈 결과로 처리한다', () => {
    expect(toAvailability({ response: { result: { hasBook: 'Y', loanAvailable: 'N' } } })).toEqual({ hasBook: true, loanAvailable: false })
    expect(toBooks({})).toEqual([])
    expect(toLibraries(undefined)).toEqual([])
  })
})

describe('홈페이지 주소 검증', () => {
  it('http(s)만 링크로 쓰고, 프로토콜이 빠진 주소는 붙인다', () => {
    expect(safeUrl('https://lib.yangcheon.or.kr/libgalsan')).toBe('https://lib.yangcheon.or.kr/libgalsan')
    expect(safeUrl('www.gdlibrary.or.kr/aslib')).toBe('http://www.gdlibrary.or.kr/aslib')
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('-')).toBe('')
    expect(safeUrl(undefined)).toBe('')
  })
})

describe('API 호출', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    clearCache()
  })

  it('200 안에 error가 오면 예외를 던진다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ response: { error: '인증키 오류' } })))
    await expect(callApi('srchBooks', {})).rejects.toThrow('인증키 오류')
  })

  it('같은 요청은 저장해 두고 한 번만 호출한다 (동시 요청 포함)', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ response: { result: { hasBook: 'Y', loanAvailable: 'Y' } } })))
    vi.stubGlobal('fetch', fetchMock)
    const params = { libCode: '1', isbn13: '9788900000001' }
    await Promise.all([callApi('bookExist', params), callApi('bookExist', params)])
    await callApi('bookExist', params)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await callApi('bookExist', { ...params, libCode: '2' }) // 다른 도서관은 따로 호출
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('실패한 응답은 저장하지 않는다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    let fail = true
    vi.stubGlobal('fetch', async () => fail
      ? new Response('', { status: 500 })
      : new Response(JSON.stringify({ response: { docs: [] } })))
    await expect(callApi('srchBooks', { keyword: 'a' })).rejects.toThrow()
    fail = false
    await expect(callApi('srchBooks', { keyword: 'a' })).resolves.toEqual({ response: { docs: [] } })
  })

  it('하루 한도 초과는 QuotaError로 구분하고, 화면에는 안내 문구를 보낸다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ response: { error: '1일 500건 이상 요청 시 IP 등록이 필요합니다.' } })))
    await expect(callApi('libSrchByBook', {})).rejects.toBeInstanceOf(QuotaError)
    const res = await libraries(new Request('http://x/api/libraries?isbn=9788900000001&region=11'))
    expect(res.status).toBe(429)
    expect(((await res.json()) as any).error).toContain('오늘 조회 가능한 횟수')
  })

  it('키가 없으면 목업으로 도서관+대출 여부를 합쳐 돌려준다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', '')
    const res = await libraries(new Request('http://x/api/libraries?isbn=9788900000001&region=11'))
    const body: any = await res.json()
    expect(body.mock).toBe(true)
    expect(body.items.map((l: any) => l.loanAvailable)).toEqual([true, false, true])
  })

  it('위치를 주면 가까운 순으로 정렬하고 거리를 붙인다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', '')
    // 중랑구 근처에서 요청 → 중랑 < 성동 < 마포 순
    const res = await libraries(new Request('http://x/api/libraries?isbn=9788900000001&region=11&lat=37.59&lng=127.09'))
    const body: any = await res.json()
    expect(body.items.map((l: any) => l.name)).toEqual(['중랑구립면목정보도서관', '성동구립도서관', '마포중앙도서관'])
    expect(body.items[0].distance).toBeLessThan(500)
    expect(body.total).toBe(3)
  })

  it('가까운 순으로 나눠서 준다 (도서관 더 보기)', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', '')
    const page = async (q: string) => (await (await libraries(new Request(`http://x/api/libraries?isbn=9788900000001&region=11&lat=37.59&lng=127.09${q}`))).json()) as any
    const first = await page('&limit=2')
    expect(first.items.map((l: any) => l.name)).toEqual(['중랑구립면목정보도서관', '성동구립도서관'])
    expect(first.nextOffset).toBe(2)
    const second = await page('&offset=2&limit=2')
    expect(second.items.map((l: any) => l.name)).toEqual(['마포중앙도서관'])
    expect(second.nextOffset).toBeNull() // 더 없음
    expect(second.total).toBe(3)
  })

  it('잘못된 offset·limit은 안전한 값으로 바꾼다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', '')
    const body: any = await (await libraries(new Request('http://x/api/libraries?isbn=9788900000001&region=11&offset=-5&limit=999'))).json()
    expect(body.items).toHaveLength(3) // offset 0부터, limit은 최대 10으로 제한 (목업은 3곳)
  })

  it('한국 밖 좌표는 무시한다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', '')
    const res = await libraries(new Request('http://x/api/libraries?isbn=9788900000001&region=11&lat=0&lng=0'))
    const body: any = await res.json()
    expect(body.items[0].distance).toBeUndefined()
  })

  it('브라우저는 저장하지 않고, CDN만 저장한다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', '')
    const res = await libraries(new Request('http://x/api/libraries?isbn=9788900000001&region=11'))
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toContain('max-age=3600')
    const bad = await libraries(new Request('http://x/api/libraries?isbn=abc'))
    expect(bad.headers.get('Vercel-CDN-Cache-Control')).toBeNull() // 오류 응답은 저장하지 않는다
  })

  it('잘못된 ISBN은 400', async () => {
    const res = await libraries(new Request('http://x/api/libraries?isbn=abc'))
    expect(res.status).toBe(400)
  })
})
