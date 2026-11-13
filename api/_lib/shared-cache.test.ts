import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callApi, clearCache, QuotaError } from './data4library.js'

// 가짜 Redis(Upstash REST)와 가짜 정보나루를 하나의 fetch로 흉내 낸다
function setup(library: (url: URL) => unknown) {
  const redis = new Map<string, string>()
  const calls = { library: 0, redis: [] as string[] }
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (input.startsWith('https://redis.test')) {
      const [cmd, key, value] = JSON.parse(String(init!.body)) as string[]
      calls.redis.push(cmd)
      if (cmd === 'GET') return new Response(JSON.stringify({ result: redis.get(key) ?? null }))
      if (cmd === 'SET') { redis.set(key, value); return new Response(JSON.stringify({ result: 'OK' })) }
    }
    calls.library++
    return new Response(JSON.stringify(library(new URL(input))))
  })
  return { redis, calls }
}

const ok = { response: { docs: [{ doc: { isbn13: '1', bookname: '책' } }] } }
const quota = { response: { error: '1일 500건 이상 요청 시 IP 등록이 필요합니다.' } }

describe('공용 캐시 (Redis)', () => {
  beforeEach(() => {
    vi.stubEnv('DATA4LIBRARY_KEY', 'test')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    clearCache()
  })

  it('처음에는 정보나루를 부르고 Redis에 저장한다', async () => {
    const { redis, calls } = setup(() => ok)
    await expect(callApi('srchBooks', { title: '책' })).resolves.toEqual(ok)
    expect(calls.library).toBe(1)
    expect([...redis.keys()]).toEqual(['d4l:srchBooks?title=%EC%B1%85'])
  })

  it('다른 서버(메모리가 빈 상태)에서도 Redis에 있으면 정보나루를 부르지 않는다', async () => {
    const { calls } = setup(() => ok)
    await callApi('srchBooks', { title: '책' })
    clearCache() // 서버가 새로 뜬 상황
    await callApi('srchBooks', { title: '책' })
    expect(calls.library).toBe(1)
  })

  it('신선한 기간이 지났으면 다시 부른다 (대출 여부는 1시간)', async () => {
    const { redis, calls } = setup(() => ok)
    redis.set('d4l:bookExist?libCode=1', JSON.stringify({ at: Date.now() - 2 * 3_600_000, raw: { old: true } }))
    await expect(callApi('bookExist', { libCode: '1' })).resolves.toEqual(ok)
    expect(calls.library).toBe(1)
  })

  it('한도 초과면 지난 결과로 대신한다 (검색·소장 도서관 목록)', async () => {
    const { redis } = setup(() => quota)
    const old = { response: { libs: [] }, old: true }
    redis.set('d4l:libSrchByBook?isbn=1', JSON.stringify({ at: Date.now() - 3 * 86_400_000, raw: old }))
    await expect(callApi('libSrchByBook', { isbn: '1' })).resolves.toEqual(old)
  })

  it('대출 여부는 지난 결과로 대신하지 않는다 (헛걸음 방지)', async () => {
    const { redis } = setup(() => quota)
    redis.set('d4l:bookExist?libCode=1', JSON.stringify({ at: Date.now() - 3 * 3_600_000, raw: { old: true } }))
    await expect(callApi('bookExist', { libCode: '1' })).rejects.toBeInstanceOf(QuotaError)
  })

  it('Redis가 고장 나도 정보나루로 계속 동작한다', async () => {
    vi.stubGlobal('fetch', async (input: string) =>
      input.startsWith('https://redis.test') ? new Response('', { status: 500 }) : new Response(JSON.stringify(ok)))
    await expect(callApi('srchBooks', { title: '책' })).resolves.toEqual(ok)
  })

  it('Redis 설정이 없으면 Redis를 부르지 않는다 (개발 환경)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    const { calls } = setup(() => ok)
    await callApi('srchBooks', { title: '책' })
    expect(calls.redis).toEqual([])
    expect(calls.library).toBe(1)
  })
})
