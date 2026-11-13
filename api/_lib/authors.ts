// 정보나루 저자 글자("강민경 글 ;이영림 그림", "글: 정상민,주성윤", "김강현 (지은이), 김기수 (그림)")를
// 역할별로 나눈다. 책마다 표기가 제각각이라 카드 모양이 들쭉날쭉했던 문제를 정리하기 위해서다.
// (브라우저·서버 공용, import 없음)

export type Role = '글' | '그림' | '저자' | '원작' | '옮김' | '감수'
export type Contributor = { role: Role; names: string[] }

const ORDER: Role[] = ['글', '그림', '저자', '원작', '옮김', '감수']

// 긴 말을 먼저 둔다 (지은이 > 지음, 저자 > 저, 옮긴이 > 옮김 …)
const ROLE_WORDS: [string, Role][] = [
  ['일러스트', '그림'], ['지은이', '저자'], ['옮긴이', '옮김'], ['엮은이', '저자'],
  ['지음', '저자'], ['저자', '저자'], ['집필', '저자'], ['편집', '저자'], ['편저', '저자'], ['엮음', '저자'],
  ['원작', '원작'], ['옮김', '옮김'], ['번역', '옮김'], ['읽음', '옮김'], ['감수', '감수'],
  ['그림', '그림'], ['글', '글'], ['저', '저자'], ['편', '저자'], ['역', '옮김'],
]
const WORD = ROLE_WORDS.map(([w]) => w).join('|')
const ROLES = `(?:${WORD})(?:\\s*[·/]?\\s*(?:${WORD}))*` // "글·그림", "글 그림", "집필·편집"
const LEADING = new RegExp(`^(${ROLES})\\s*:\\s*(.+)$`) // "글: 정상민"
const TRAILING = new RegExp(`^(.+?)(?:\\s+\\(?|\\()(${ROLES})\\)?$`) // "강민경 글", "박경리 (지은이)" (이름 끝 글자를 역할로 오해하지 않게 앞에 공백·괄호 필요)

const rolesOf = (text: string): Role[] => {
  const found: Role[] = []
  for (const m of text.matchAll(new RegExp(WORD, 'g'))) {
    const role = ROLE_WORDS.find(([w]) => w === m[0])![1]
    if (!found.includes(role)) found.push(role)
  }
  return found
}

type Part = { names: string; roles: Role[]; leading: boolean }

export function parseAuthors(raw: string): Contributor[] {
  const text = raw.replace(/\[공\]|\[|\]/g, '').trim()
  if (!text) return []

  const parts: Part[] = text.split(/\s*[;,]\s*/).filter(Boolean).map((s) => {
    const lead = s.match(LEADING)
    if (lead) return { names: lead[2], roles: rolesOf(lead[1]), leading: true }
    const trail = s.match(TRAILING)
    if (trail) return { names: trail[1], roles: rolesOf(trail[2]), leading: false }
    return { names: s, roles: [], leading: false }
  })

  // 역할 없는 조각 채우기
  // - "글: 정상민,주성윤"의 "주성윤" → 앞 조각이 "글:" 형식이면 같은 역할
  // - "천인국,최자영 지음"의 "천인국" → 뒤 조각의 역할 (단, 옮김은 제외: "에마뉘엘 보두엥,홍은주 옮김"은 저자+역자)
  // - 그래도 없으면 저자
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].roles.length) continue
    const prev = parts[i - 1], next = parts.slice(i + 1).find((p) => p.roles.length)
    if (prev?.leading) parts[i].roles = prev.roles
    else if (next && !next.roles.includes('옮김')) parts[i].roles = next.roles
    else parts[i].roles = ['저자']
    parts[i].leading = !!prev?.leading
  }

  const byRole = new Map<Role, string[]>()
  for (const p of parts) {
    const name = p.names.replace(/[()]/g, '').trim()
    if (!name) continue
    for (const role of p.roles) {
      const names = byRole.get(role) ?? []
      if (!names.includes(name)) names.push(name)
      byRole.set(role, names)
    }
  }
  return ORDER.filter((r) => byRole.has(r)).map((role) => ({ role, names: byRole.get(role)! }))
}

// 주제 분류 "문학 > 한국문학 > 소설" → "문학 › 소설" (대분류와 가장 구체적인 분류)
export function parseGenre(raw: unknown): string {
  const parts = String(raw ?? '').split('>').map((s) => s.trim()).filter((s) => s && s !== 'null')
  const unique = parts.filter((s, i) => parts.indexOf(s) === i)
  return unique.length > 1 ? `${unique[0]} › ${unique[unique.length - 1]}` : unique[0] ?? ''
}
