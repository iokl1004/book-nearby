import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as regions } from '../regions.js'
import { clearCache } from './data4library.js'

describe('다른 지역 소장 현황', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    clearCache()
  })

  it('17개 시·도를 모두 묻고, 있는 지역만 많은 순으로 돌려준다', async () => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    const asked: string[] = []
    // 실제 사례: 프뢰벨하우스판 어린 왕자는 서울 0곳, 대전 5곳
    const found: Record<string, number> = { '25': 5, '31': 2 }
    vi.stubGlobal('fetch', async (url: string) => {
      const region = new URL(url).searchParams.get('region')!
      asked.push(region)
      return new Response(JSON.stringify({ response: { numFound: found[region] ?? 0, libs: [] } }))
    })
    const res = await regions(new Request('http://x/api/regions?isbn=9788960848566'))
    const body: any = await res.json()
    expect(asked).toHaveLength(17)
    expect(body.items).toEqual([{ code: '25', name: '대전', count: 5 }, { code: '31', name: '경기', count: 2 }])
  })

  it('잘못된 ISBN은 400', async () => {
    expect((await regions(new Request('http://x/api/regions?isbn=12'))).status).toBe(400)
  })
})
