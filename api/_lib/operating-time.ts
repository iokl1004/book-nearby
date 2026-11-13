import type { Span } from './types.js'

// 정보나루의 운영시간 글자("평일 09:00~22:00 / 주말 09:00~18:00")를 해석한다.
// 표준데이터에서 짝을 못 찾은 도서관에 대신 쓴다.

// 정보나루 글자에 섞여 오는 HTML 문자(&middot; 등)를 바꾸고, "-"처럼 의미 없는 값은 비운다
export function cleanText(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
  return /[0-9가-힣]/.test(text) ? text : ''
}

// "9시", "오후 5시", "2200", "9:00" → "HH:MM"
function toHHMM(raw: string): string | null {
  const m = raw.match(/(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{2}))?\s*시?/)
  if (!m) return null
  let h = Number(m[2])
  const min = Number(m[3] ?? 0)
  if (m[1] === '오후' && h < 12) h += 12
  if (h > 24 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

const TIME = String.raw`(?:오전|오후)?\s*\d{1,2}(?:\s*:\s*\d{2}|\d{2}|\s*시(?:\s*\d{2}\s*분)?)?`
const RANGE = new RegExp(String.raw`(${TIME})\s*[~\-–]\s*(${TIME})`)

function rangeAfter(text: string, label: RegExp): Span | undefined {
  const at = text.search(label)
  if (at < 0) return undefined
  const m = text.slice(at).match(RANGE)
  if (!m) return undefined
  // "2200"처럼 콜론 없이 붙여 쓴 시간
  const fix = (t: string) => (/^\d{4}$/.test(t.trim()) ? `${t.trim().slice(0, 2)}:${t.trim().slice(2)}` : t)
  const open = toHHMM(fix(m[1])), close = toHHMM(fix(m[2]))
  return open && close && open < close ? [open, close] : undefined
}

// 자료실·열람실처럼 공간마다 시간이 다른 글은 해석하지 않는다.
// 열람실(07:00~)을 대출 가능한 시간으로 잘못 읽으면 사용자가 헛걸음하기 때문.
const MIXED = /자료실|열람실|학습실|어린이|종합|디지털|층|※/

export function parseOperatingTime(text: string): { weekday: Span; weekend: Span } | null {
  if (!text || MIXED.test(text)) return null
  const both = rangeAfter(text, /평일\s*\/\s*주말/)
  if (both) return { weekday: both, weekend: both }
  const weekday = rangeAfter(text, /평일|주중|월\s*[~\-]\s*금/)
  const weekend = rangeAfter(text, /주말|토\s*[,·&~\-]?\s*일|토요일/)
  return weekday && weekend ? { weekday, weekend } : null // 둘 다 읽혀야만 믿는다
}
