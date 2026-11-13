// 검색창 미리보기: 미리 받아 둔 인기 도서 목록(public/data/popular-books.json)에서만 찾는다 → 입력 중 API 호출 0건
export type Suggestion = [title: string, author: string]

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// 한글 입력 중에는 "어린왕ㅈ"처럼 끝에 낱자(ㄱ~ㅣ)가 남는다. 그 낱자는 빼고 찾는다.
const withoutTrailingJamo = (s: string) => s.replace(/[ㄱ-ㆎ]+$/, '')

// 제목이 검색어로 시작 > 제목에 포함 > 저자가 시작 > 저자에 포함, 같은 순위면 인기 순(목록 순서)
export function findSuggestions(list: Suggestion[], query: string, limit = 8): Suggestion[] {
  const q = norm(withoutTrailingJamo(query.trim()))
  if (!q) return []
  return list
    .map((s, rank) => {
      const t = norm(s[0]), a = norm(s[1])
      const score = t.startsWith(q) ? 0 : t.includes(q) ? 1 : a.startsWith(q) ? 2 : a.includes(q) ? 3 : -1
      return { s, score, rank }
    })
    .filter((x) => x.score >= 0)
    .sort((x, y) => x.score - y.score || x.rank - y.rank)
    .slice(0, limit)
    .map((x) => x.s)
}

// 인기 도서 목록은 처음 검색창을 쓸 때 한 번만 받는다 (압축 약 54KB)
let popular: Promise<Suggestion[]> | undefined
export function loadPopular(): Promise<Suggestion[]> {
  popular ??= fetch('/data/popular-books.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
  return popular
}

// 최근 검색어: 이 브라우저에만 저장 (서버로 보내지 않음)
const RECENT_KEY = 'book-nearby:recent-searches'
const RECENT_MAX = 6

export const addRecent = (list: string[], q: string) => [q, ...list.filter((x) => x !== q)].slice(0, RECENT_MAX)

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return [] // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)
  }
}

export function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch { /* 저장 못 해도 검색은 된다 */ }
}
