// 정보나루 전국 도서관 목록 → api/_data/shared-homepages.json
// 여러 도서관이 같이 쓰는 홈페이지(구·시 통합 도서관 사이트)를 미리 골라 둔다.
// 화면에서 "도서관 홈페이지" 대신 "○○구 통합 도서관 홈페이지"로 표시하기 위해서다.
// 사용법: npm run sync:homepages   (.env의 DATA4LIBRARY_KEY 사용, 지역마다 1~2건 호출)
import { writeFileSync } from 'node:fs'
import { REGIONS, sharedHomepages } from '../api/_lib/names.ts'

const PAGE_SIZE = 1000

async function homepagesOf(key: string, region: string): Promise<string[]> {
  const urls: string[] = []
  for (let page = 1; ; page++) {
    const qs = new URLSearchParams({ authKey: key, format: 'json', region, pageNo: String(page), pageSize: String(PAGE_SIZE) })
    const res = await fetch(`http://data4library.kr/api/libSrch?${qs}`)
    const body: any = await res.json()
    if (body?.response?.error) throw new Error(`정보나루 오류 (지역 ${region}): ${body.response.error}`)
    const libs = body.response.libs ?? []
    urls.push(...libs.map((x: any) => x.lib.homepage ?? ''))
    if (libs.length < PAGE_SIZE) return urls
  }
}

if (import.meta.main) {
  const key = process.env.DATA4LIBRARY_KEY
  if (!key) throw new Error('.env에 DATA4LIBRARY_KEY를 넣어 주세요.')
  // 같은 주소는 지역 안에서 공유되므로 지역별로 세고 합친다
  const shared = new Set<string>()
  let total = 0
  for (const [code, name] of REGIONS) {
    const urls = await homepagesOf(key, code)
    const found = sharedHomepages(urls)
    found.forEach((url) => shared.add(url))
    total += urls.length
    console.log(`${name}: 도서관 ${urls.length}곳, 통합 사이트 ${found.length}개`)
  }
  writeFileSync(new URL('../api/_data/shared-homepages.json', import.meta.url), JSON.stringify([...shared].sort(), null, 1))
  console.log(`전국 도서관 ${total}곳에서 통합 사이트 ${shared.size}개 저장 완료`)
}
