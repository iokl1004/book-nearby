import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as book } from '../book.js'
import { clearCache } from './data4library.js'

const get = (isbn: string) => book(new Request(`http://x/api/book?isbn=${isbn}`))

describe('ISBN으로 책 정보 (상세 페이지 직접 접속용)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    clearCache()
  })

  it('검색 결과와 같은 규칙으로 정리한다 (권 번호, 저자 역할, 출판연도)', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    // 실제 응답 형식
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ response: { detail: [{ book: {
      bookname: '어린 왕자 ', authors: '원작: 생텍쥐페리 ;그림: 백승민', publisher: '프뢰벨하우스', publication_year: '[201',
      isbn13: '9788960848566', vol: '', class_nm: '문학 > 문학 > 전집, 총서', bookImageURL: '',
    } }] } })))
    const body: any = await (await get('9788960848566')).json()
    expect(body.item).toMatchObject({
      title: '어린 왕자', year: '2010년대', publisher: '프뢰벨하우스', genre: '문학 › 전집, 총서',
      contributors: [{ role: '그림', names: ['백승민'] }, { role: '원작', names: ['생텍쥐페리'] }],
    })
  })

  it('없는 책은 404, 잘못된 ISBN은 400', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ response: { detail: [] } })))
    expect((await get('9788900000000')).status).toBe(404)
    expect((await get('123')).status).toBe(400)
  })

  it('정보나루가 "ISBN을 확인해 주세요"라고 하면 서버 오류가 아니라 404', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ response: { errCode: 'isbnLengthErr', error: 'ISBN을 확인해 주시기 바랍니다.' } })))
    const res = await get('9788900000000')
    expect(res.status).toBe(404)
    expect(((await res.json()) as any).error).toBe('도서 정보를 찾을 수 없어요.')
  })
})
