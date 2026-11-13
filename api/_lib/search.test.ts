import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('도서 검색', () => {
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
