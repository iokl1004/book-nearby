// 모든 서버가 같이 쓰는 캐시 (Upstash Redis, HTTP로 호출해 별도 라이브러리 없음)
// 메모리 캐시는 서버 인스턴스마다 따로라서, 배포 환경(Vercel)에서는 서버가 뜨고 꺼질 때마다 비워진다.
// 정보나루 하루 호출 한도를 지키려면 한 사람이 조회한 결과를 다른 사람도 쓸 수 있어야 해서 공용 저장소를 둔다.
// 설정(.env)이 없으면 아무것도 하지 않는다 → 개발 환경은 메모리 캐시만으로 그대로 동작.

// Upstash에서 직접 만들면 UPSTASH_*, Vercel 마켓플레이스로 연결하면 KV_* 이름으로 들어온다
const url = () => process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
export const sharedCacheEnabled = () => !!(url() && token())

async function command(args: (string | number)[]): Promise<unknown> {
  if (!sharedCacheEnabled()) return null
  try {
    const res = await fetch(url()!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) return null
    return ((await res.json()) as { result?: unknown }).result ?? null
  } catch {
    return null // 캐시가 안 돼도 서비스는 동작해야 하므로 실패는 "없음"으로 취급
  }
}

export type Stored = { at: number; raw: unknown }

export async function getShared(key: string): Promise<Stored | null> {
  const value = await command(['GET', key])
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as Stored
    return typeof parsed?.at === 'number' ? parsed : null
  } catch {
    return null
  }
}

// keepSeconds 동안 보관한다. 신선한지는 꺼낼 때 at(저장 시각)으로 따로 판단한다
// (오래된 값도 정보나루가 실패했을 때 대신 보여주려고 오래 보관)
export async function setShared(key: string, raw: unknown, keepSeconds: number): Promise<void> {
  await command(['SET', key, JSON.stringify({ at: Date.now(), raw }), 'EX', keepSeconds])
}
