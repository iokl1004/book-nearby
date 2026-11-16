import HOLIDAYS from '../_data/holidays.json' with { type: 'json' }

// 전국도서관표준데이터의 휴관일 표기("금+1월1일+설 연휴", "셋째 주 월", "매주토, 일요일")와 공휴일로
// 어떤 날 문을 닫는지 판단한다. 화면(오늘 운영 상태)과 서버("오늘 여는 곳만" 필터)가 같이 쓴다.

const DAYS = '일월화수목금토'
const ORDINALS: [RegExp, number][] = [
  [/첫\s*(?:째|번째)/, 1], [/(?:둘|두)\s*(?:째|번째)/, 2], [/(?:셋|세)\s*(?:째|번째)/, 3],
  [/(?:넷|네)\s*(?:째|번째)/, 4], [/다섯\s*(?:째|번째)/, 5], [/마지막/, -1],
]
const ANY_ORDINAL = new RegExp(ORDINALS.map(([re]) => re.source).join('|'), 'g')

type Rule = { day: number; nth: number[] } // nth가 비면 매주

export function parseCloseDay(text: string): Rule[] {
  const rules: Rule[] = []
  let carry: number[] = [] // "매월 첫 번째, 세 번째 월요일"처럼 쉼표 앞에 주차만 있는 경우
  const tokens = text.replace(/\(.*?\)|「.*?」/g, '').split(/[+,\n/]|및|\d\)/)

  for (const raw of tokens) {
    const token = raw.replace(/.*제외한?/, '').trim() // "일요일을 제외한 법정공휴일"의 일요일은 휴관이 아님
    const bare = token.replace(/매월|매달/, '').trim()
    if (/^[1-5]$/.test(bare)) { carry.push(Number(bare)); continue } // "2,4째주"의 "2"

    const nth = carry
    carry = []
    for (const [re, n] of ORDINALS) if (re.test(token)) nth.push(n)
    const digits = token.match(/[1-5](?:\s*[·ㆍ~]\s*[1-5])*\s*(?=번?째|주)/)?.[0]
    if (digits) nth.push(...digits.match(/[1-5]/g)!.map(Number))

    const days = new Set<number>()
    if (token.includes('주말')) { days.add(0); days.add(6) }
    const rest = token
      .replace(ANY_ORDINAL, '')
      .replace(/매주|매월|매달|정기|휴관일?|요일|주말|[1-5]\s*(?:번?째|주)|[\s·ㆍ~]/g, '')
      .replace(/^주/, '')
    if (/^[일월화수목금토]+$/.test(rest)) for (const c of rest) days.add(DAYS.indexOf(c)) // "월", "토일", "셋째 주 월"
    else for (const m of token.matchAll(/([일월화수목금토])요일/g)) days.add(DAYS.indexOf(m[1])) // "일요일 법정공휴일"

    if (days.size === 0) { carry = nth; continue }
    for (const day of days) rules.push({ day, nth: [...new Set(nth)] })
  }
  return rules
}

export function isClosedOn(rules: Rule[], date: { day: number; dateOfMonth: number; daysInMonth: number }) {
  const week = Math.ceil(date.dateOfMonth / 7)
  const isLast = date.dateOfMonth + 7 > date.daysInMonth
  return rules.some((r) => r.day === date.day && (r.nth.length === 0 || r.nth.includes(week) || (isLast && r.nth.includes(-1))))
}

// 휴관일 원문이 오늘 공휴일(이름)에 문을 닫는다고 하는지. 공휴일 목록은 npm run sync:holidays로 받는다.
export function closedForHoliday(closeDay: string, name: string, day: number): boolean {
  const t = closeDay.replace(/\s/g, '')
  if (/공휴일|국경일|법정휴일/.test(t)) {
    // "일요일을 제외한 법정공휴일": 일요일 공휴일은 평소 일요일처럼 연다. 단 "겹치는 경우 휴관"이면 닫는다.
    const exceptSunday = /일(요일)?을?제외/.test(t) && !/겹치|공휴일인경우휴관/.test(t)
    return !(day === 0 && exceptSunday)
  }
  if (name.includes('설날')) return /설|구정|명절/.test(t)
  if (name.includes('추석')) return /추석|명절/.test(t)
  if (name === '1월1일') return /1월1일|신정/.test(t)
  if (name.includes('선거')) return /선거/.test(t)
  return false
}

export type DayParts = { ymd: string; day: number; dateOfMonth: number; daysInMonth: number }

// "20261116" → 요일·날짜·그 달의 일수
export function dayParts(ymd: string): DayParts {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(4, 6)), d = Number(ymd.slice(6, 8))
  return { ymd, day: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), dateOfMonth: d, daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate() }
}

// 그날 휴관이면 이유(공휴일 이름, 정기 휴관이면 ''), 여는 날이면 null
export function closeReason(closeDay: string, date: DayParts): string | null {
  const holiday = (HOLIDAYS as Record<string, string>)[date.ymd]
  if (holiday && closedForHoliday(closeDay, holiday, date.day)) return holiday
  if (isClosedOn(parseCloseDay(closeDay), date)) return ''
  return null
}

export const isHoliday = (ymd: string) => ymd in (HOLIDAYS as Record<string, string>)
