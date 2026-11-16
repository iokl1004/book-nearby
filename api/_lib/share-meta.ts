import type { Book } from './types.js'

// 카카오톡·페이스북 등은 링크를 미리 볼 때 자바스크립트를 실행하지 않고 HTML의 og 태그만 읽는다.
// 화면(SPA)은 그대로 두고, 책 상세 주소로 온 요청에만 그 책의 제목·표지를 넣은 index.html을 돌려준다.

// 책 제목은 외부 API 값이라 HTML 속성에 넣기 전에 반드시 이스케이프한다
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// 카카오 표지는 120×174 썸네일이라 카드에서 흐릿하다. 주소의 fname에 원본 이미지가 들어 있으면 그걸 쓴다
export function largeCover(image: string): string {
  try {
    const original = new URL(image).searchParams.get('fname')
    return original && /^https?:\/\//.test(original) ? original.replace(/^http:/, 'https:') : image
  } catch {
    return image
  }
}

export function withBookMeta(html: string, book: Book, pageUrl: string): string {
  const title = `${book.title} — 책있나`
  const by = [book.authors, book.publisher].filter(Boolean).join(' · ')
  const description = `${by ? `${by}. ` : ''}근처 도서관에 있는지, 지금 빌릴 수 있는지 지도로 확인해 보세요.`
  const tags: [string, string][] = [
    ['og:site_name', '책있나'],
    ['og:type', 'book'],
    ['og:title', title],
    ['og:description', description],
    ['og:url', pageUrl],
    ...(book.image ? [['og:image', largeCover(book.image)] as [string, string]] : []),
  ]
  const meta = tags.map(([p, c]) => `<meta property="${p}" content="${esc(c)}" />`).join('\n    ')
  return html
    .replace(/\s*<meta property="og:[^>]*>/g, '') // 첫 화면용 기본 og 태그를 책 정보로 바꾼다
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `    ${meta}\n  </head>`)
}
