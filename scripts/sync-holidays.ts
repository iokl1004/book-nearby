// 공공데이터포털 한국천문연구원 특일 정보 → src/holidays.json ({ "20261225": "기독탄신일" })
// 올해와 내년 공휴일(대체공휴일·선거일 포함)을 받아 둔다. 화면에서 "오늘 휴관" 판단에 쓴다.
// 사용법: npm run sync:holidays   (.env의 DATA_GO_KR_KEY 사용, 연도마다 1건 호출. 연 1회, 연말에 다시 실행)
import { writeFileSync } from 'node:fs'

async function holidaysOf(key: string, year: number): Promise<[string, string][]> {
  const qs = new URLSearchParams({ solYear: String(year), numOfRows: '100', _type: 'json' })
  // 공공데이터포털 키는 이미 인코딩된 값이라 URLSearchParams에 넣지 않고 그대로 붙인다
  const res = await fetch(`https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${key}&${qs}`)
  const body: any = await res.json().catch(() => null)
  const header = body?.response?.header
  if (header?.resultCode !== '00') throw new Error(`특일 정보 오류 (${year}): ${header?.resultMsg ?? res.status}`)
  const items = body.response.body.items?.item ?? []
  return [items].flat().filter((x: any) => x.isHoliday === 'Y').map((x: any) => [String(x.locdate), x.dateName])
}

if (import.meta.main) {
  const key = process.env.DATA_GO_KR_KEY
  if (!key) throw new Error('.env에 DATA_GO_KR_KEY를 넣어 주세요.')
  const year = new Date().getFullYear()
  const all = [...(await holidaysOf(key, year)), ...(await holidaysOf(key, year + 1))].sort()
  writeFileSync(new URL('../src/holidays.json', import.meta.url), JSON.stringify(Object.fromEntries(all), null, 1))
  console.log(`${year}~${year + 1}년 공휴일 ${all.length}일 저장 완료`)
}
