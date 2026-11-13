// 정보나루 인기 대출 도서(최대 5,000권) → public/data/popular-books.json
// 검색창 미리보기용. 입력할 때마다 API를 부르면 하루 한도를 금방 쓰기 때문에,
// 인기 도서를 미리 받아 두고 브라우저에서 이 목록 안에서만 찾는다 (입력 중 API 호출 0건).
// 사용법: npm run sync:popular   (.env의 DATA4LIBRARY_KEY 사용, 5건 호출. 한 달에 한 번 정도)
import { mkdirSync, writeFileSync } from 'node:fs'
import { parseAuthors } from '../api/_lib/authors.ts'

const PAGE_SIZE = 1000
const MAX_PAGES = 5

// "나미야 잡화점의 기적 :히가시노 게이고 장편소설" → "나미야 잡화점의 기적" (부제·병렬 제목 제거)
export const mainTitle = (name: string) => name.split(/\s*[:=]\s*/)[0].replace(/\s+/g, ' ').trim()

// 대표 저자 한 명 ("지은이: 히가시노 게이고 ;옮긴이: 양윤옥" → "히가시노 게이고")
export function mainAuthor(raw: string): string {
  const people = parseAuthors(raw)
  const lead = people.find((p) => p.role === '저자' || p.role === '글' || p.role === '원작') ?? people[0]
  return lead?.names[0] ?? ''
}

// [제목, 대표 저자] 목록. 판본이 여러 개인 책은 한 번만 (인기 순위가 높은 것 유지)
export function toSuggestions(docs: { bookname: string; authors: string }[]): [string, string][] {
  const seen = new Set<string>()
  const out: [string, string][] = []
  for (const d of docs) {
    const title = mainTitle(d.bookname ?? '')
    const author = mainAuthor(d.authors ?? '')
    const key = `${title.replace(/\s/g, '')}|${author.replace(/\s/g, '')}`
    if (!title || seen.has(key)) continue
    seen.add(key)
    out.push([title, author])
  }
  return out
}

if (import.meta.main) {
  const key = process.env.DATA4LIBRARY_KEY
  if (!key) throw new Error('.env에 DATA4LIBRARY_KEY를 넣어 주세요.')
  const docs: any[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({ authKey: key, format: 'json', pageNo: String(page), pageSize: String(PAGE_SIZE) })
    const body: any = await fetch(`http://data4library.kr/api/loanItemSrch?${qs}`).then((r) => r.json())
    if (body?.response?.error) throw new Error(`정보나루 오류: ${body.response.error}`)
    const got = (body.response.docs ?? []).map((x: any) => x.doc)
    docs.push(...got)
    if (got.length < PAGE_SIZE) break
  }
  const list = toSuggestions(docs)
  mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true })
  writeFileSync(new URL('../public/data/popular-books.json', import.meta.url), JSON.stringify(list))
  console.log(`인기 도서 ${docs.length}권 → 미리보기 ${list.length}개 저장 완료`)
}
