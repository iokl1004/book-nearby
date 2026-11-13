// 전국도서관표준데이터 Open API → api/_data/library-hours.json
// 1년에 한 번 갱신되는 데이터라 요청마다 부르지 않고, 받아서 가공해 둔다.
// 사용법: npm run sync:hours   (.env의 DATA_GO_KR_KEY 사용)
import { writeFileSync } from 'node:fs'
import type { HoursRecord, Span } from '../api/_lib/types.ts'

const ENDPOINT = 'https://api.data.go.kr/openapi/tn_pubr_public_lbrry_api'
const PAGE_SIZE = 1000 // API 최대값

type Item = Record<string, string>

// 'HH:MM' 또는 'HHMM' → 'HH:MM'. 00:00~00:00처럼 운영하지 않는 날은 null.
export function toSpan(open = '', close = ''): Span {
  const norm = (t: string) => {
    const d = t.replace(/\D/g, '').padStart(4, '0').slice(-4)
    return /^\d{4}$/.test(d) && t.trim() ? `${d.slice(0, 2)}:${d.slice(2)}` : null
  }
  const o = norm(open), c = norm(close)
  return o && c && o !== c ? [o, c] : null
}

// 필드 이름의 오타(Colse, OperOper, CloseOpen)는 API 원본 그대로다.
export const toRecords = (items: Item[]): HoursRecord[] =>
  items
    .map((r) => ({
      name: r.lbrryNm?.trim(),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      closeDay: r.closeDay?.trim() ?? '',
      weekday: toSpan(r.weekdayOperOpenHhmm, r.weekdayOperColseHhmm),
      saturday: toSpan(r.satOperOperOpenHhmm, r.satOperCloseHhmm),
      holiday: toSpan(r.holidayOperOpenHhmm, r.holidayCloseOpenHhmm),
    }))
    .filter((r) => r.name && r.lat && r.lng) // 좌표 없는 곳은 매칭할 수 없어 버린다

async function fetchPage(key: string, pageNo: number): Promise<{ items: Item[]; total: number }> {
  const qs = new URLSearchParams({ serviceKey: key, pageNo: String(pageNo), numOfRows: String(PAGE_SIZE), type: 'json' })
  const res = await fetch(`${ENDPOINT}?${qs}`)
  const text = await res.text()
  let body: any
  try { body = JSON.parse(text) } catch { throw new Error(`JSON이 아닌 응답 (${res.status}): ${text.slice(0, 200)}`) }
  if (body?.response?.header) body = body.response // 응답이 response로 한 번 더 감싸지는 경우
  if (body?.header?.resultCode !== '00') throw new Error(`API 오류: ${body?.header?.resultMsg ?? text.slice(0, 200)}`)
  return { items: body.body.items?.item ?? [], total: Number(body.body.totalCount) }
}

if (import.meta.main) {
  const raw = process.env.DATA_GO_KR_KEY
  if (!raw) throw new Error('.env에 DATA_GO_KR_KEY를 넣어 주세요.')
  // 포털의 Encoding 키(%2F...)를 넣어도 되도록 한 번 풀어서 쓴다 (URLSearchParams가 다시 인코딩함)
  const key = raw.includes('%') ? decodeURIComponent(raw) : raw

  const first = await fetchPage(key, 1)
  const items = [...first.items]
  for (let page = 2; (page - 1) * PAGE_SIZE < first.total; page++) items.push(...(await fetchPage(key, page)).items)

  const records = toRecords(items)
  writeFileSync(new URL('../api/_data/library-hours.json', import.meta.url), JSON.stringify(records))
  console.log(`전체 ${first.total}곳 중 좌표가 있는 ${records.length}곳 저장 완료`)
}
