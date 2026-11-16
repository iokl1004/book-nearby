import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as search } from '../search.js'
import { clearCache } from './data4library.js'

// 정보나루를 흉내 낸다: 요청한 검색 방식(title/author/keyword)마다 다른 결과
function fakeLibrary(results: Record<'title' | 'author' | 'keyword', { found: number; names: string[] }>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    const params = new URL(url).searchParams
    const kind = (['title', 'author', 'keyword'] as const).find((k) => params.has(k))!
    calls.push(kind)
    const r = results[kind]
    const docs = r.names.map((name) => ({ doc: { isbn13: name, bookname: name } }))
    return new Response(JSON.stringify({ response: { numFound: r.found, docs } }))
  })
  return calls
}

const titles = async (q: string) => ((await (await search(new Request(`http://x/api/search?q=${encodeURIComponent(q)}`))).json()) as any).items.map((b: any) => b.title)

describe('도서 검색 (정보나루, 카카오 키가 없을 때)', () => {
  beforeEach(() => vi.stubEnv('KAKAO_REST_KEY', ''))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    clearCache()
  })

  it('제목 결과가 더 많으면 제목 결과를 먼저 (어린 왕자)', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    fakeLibrary({ title: { found: 964, names: ['어린 왕자', '어린왕자 2'] }, author: { found: 0, names: [] }, keyword: { found: 1104, names: ['아드님, 진지 드세요'] } })
    expect(await titles('어린 왕자')).toEqual(['어린 왕자', '어린왕자 2'])
  })

  it('저자 결과가 더 많으면 저자 결과를 먼저, 같은 책은 한 번만 (헤르만 헤세)', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    fakeLibrary({ title: { found: 124, names: ['데미안 :헤르만 헤세 장편', '헤세 평전'] }, author: { found: 832, names: ['싯다르타', '데미안 :헤르만 헤세 장편'] }, keyword: { found: 0, names: [] } })
    expect(await titles('헤르만 헤세')).toEqual(['싯다르타', '데미안: 헤르만 헤세 장편', '헤세 평전'])
  })

  it('제목·저자 모두 없으면 키워드 검색으로 한 번 더', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    const calls = fakeLibrary({ title: { found: 0, names: [] }, author: { found: 0, names: [] }, keyword: { found: 3, names: ['민음사 세계문학'] } })
    expect(await titles('민음사')).toEqual(['민음사 세계문학'])
    expect(calls.sort()).toEqual(['author', 'keyword', 'title'])
  })

  it('제목·저자 중 하나라도 있으면 키워드 검색은 하지 않는다 (호출 수 절약)', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    const calls = fakeLibrary({ title: { found: 1, names: ['토지'] }, author: { found: 0, names: [] }, keyword: { found: 9, names: ['x'] } })
    await titles('토지')
    expect(calls).not.toContain('keyword')
  })
})

// 카카오 책 검색을 흉내 낸다: target(title/person/전체)마다 다른 결과
// 책마다 고유한 ISBN13을 붙인다 (같은 책이 양쪽에 나오면 같은 ISBN → 중복 제거 확인용)
const isbnOf = (bookTitle: string) => `978${String([...bookTitle].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1e10, 7)).padStart(10, '0')}`

type FakeResult = { total: number; titles: string[]; isEnd?: boolean }
function fakeKakao(results: Record<'title' | 'person' | 'all', FakeResult>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    if (!url.startsWith('https://dapi.kakao.com')) {
      calls.push('library')
      return new Response('', { status: 500 })
    }
    const params = new URL(url).searchParams
    const target = (params.get('target') ?? 'all') as 'title' | 'person' | 'all'
    const page = params.get('page') ?? '1'
    calls.push(page === '1' ? target : `${target}:${page}`)
    const r = results[target]
    const documents = r.titles.map((t) => ({
      title: page === '1' ? t : `${t} (${page}쪽)`, authors: ['저자'], translators: [], publisher: '출판사', datetime: '2020-01-01', isbn: `x ${isbnOf(page === '1' ? t : `${t}${page}`)}`, thumbnail: '',
    }))
    return new Response(JSON.stringify({ meta: { total_count: r.total, is_end: r.isEnd ?? true }, documents }))
  })
  return calls
}

const body = async (query: string) => (await (await search(new Request(`http://x/api/search?${query}`))).json()) as any

describe('도서 검색 (카카오 우선)', () => {
  beforeEach(() => {
    vi.stubEnv('KAKAO_REST_KEY', 'kakao')
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    clearCache()
  })

  it('제목·저자 검색을 함께 하고 결과가 많은 쪽을 먼저 (헤르만 헤세 → 저자 먼저)', async () => {
    // 데미안은 제목 검색에도 나온다 → 한 번만, 저자 결과 순서대로
    const calls = fakeKakao({ title: { total: 260, titles: ['헤세 평전', '데미안'] }, person: { total: 1725, titles: ['데미안', '싯다르타'] }, all: { total: 0, titles: [] } })
    expect(await titles('헤르만 헤세')).toEqual(['데미안', '싯다르타', '헤세 평전'])
    expect(calls).not.toContain('library') // 정보나루 도서 검색은 부르지 않는다
    expect(calls).not.toContain('all') // 결과가 있으면 전체 검색은 하지 않는다
  })

  it('둘 다 없으면 전체 검색으로 한 번 더', async () => {
    const calls = fakeKakao({ title: { total: 0, titles: [] }, person: { total: 0, titles: [] }, all: { total: 3, titles: ['민음사 세계문학'] } })
    expect(await titles('민음사')).toEqual(['민음사 세계문학'])
    expect(calls).toContain('all')
  })

  it('카카오가 실패하면 정보나루 검색으로 대신한다', async () => {
    vi.stubGlobal('fetch', async (url: string) => url.startsWith('https://dapi.kakao.com')
      ? new Response('', { status: 500 })
      : new Response(JSON.stringify({ response: { numFound: 1, docs: [{ doc: { isbn13: '1', bookname: '토지' } }] } })))
    expect(await titles('토지')).toEqual(['토지'])
  })
})

describe('검색 결과 더 보기', () => {
  beforeEach(() => {
    vi.stubEnv('KAKAO_REST_KEY', 'kakao')
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    clearCache()
  })

  it('결과가 더 많은 쪽의 다음 페이지를 next로 알려준다', async () => {
    fakeKakao({ title: { total: 964, titles: ['어린 왕자'], isEnd: false }, person: { total: 0, titles: [] }, all: { total: 0, titles: [] } })
    expect((await body('q=어린 왕자')).next).toBe('title:2')
  })

  it('next를 주면 그쪽의 다음 페이지만 부른다', async () => {
    const calls = fakeKakao({ title: { total: 260, titles: [] }, person: { total: 1725, titles: ['데미안'], isEnd: false }, all: { total: 0, titles: [] } })
    const b = await body('q=헤르만 헤세&next=person:2')
    expect(calls).toEqual(['person:2'])
    expect(b.items.map((x: any) => x.title)).toEqual(['데미안 (2쪽)'])
    expect(b.next).toBe('person:3')
  })

  it('마지막 페이지면 next가 없다', async () => {
    fakeKakao({ title: { total: 1, titles: ['토지'], isEnd: true }, person: { total: 0, titles: [] }, all: { total: 0, titles: [] } })
    expect((await body('q=토지')).next).toBeNull()
  })

  it('잘못된 next는 400', async () => {
    fakeKakao({ title: { total: 0, titles: [] }, person: { total: 0, titles: [] }, all: { total: 0, titles: [] } })
    for (const bad of ['next=title:1', 'next=title:99', 'next=hack:2', 'next=title']) {
      expect((await search(new Request(`http://x/api/search?q=a&${bad}`))).status).toBe(400)
    }
  })
})
