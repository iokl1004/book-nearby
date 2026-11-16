import type { Hours, Span } from '../api/_lib/types'
import HOLIDAYS from './holidays.json'

// 전국도서관표준데이터의 휴관일 표기("금+1월1일+설 연휴", "셋째 주 월", "매주토, 일요일")를
// 오늘 기준으로 해석하고 운영 상태를 만든다.
// 시간에 따라 바뀌는 값이라 서버(CDN 캐시)가 아니라 브라우저에서 계산한다.

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

function isClosedOn(rules: Rule[], date: { day: number; dateOfMonth: number; daysInMonth: number }) {
  const week = Math.ceil(date.dateOfMonth / 7)
  const isLast = date.dateOfMonth + 7 > date.daysInMonth
  return rules.some((r) => r.day === date.day && (r.nth.length === 0 || r.nth.includes(week) || (isLast && r.nth.includes(-1))))
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export type Status = { kind: 'open' | 'before' | 'after' | 'closed' | 'unknown'; label: string }

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

export function openStatus(hours: Hours | null | undefined, now = new Date()): Status {
  if (!hours) return { kind: 'unknown', label: '운영시간 확인 필요' }
  const seoul = seoulParts(now)
  const holiday = (HOLIDAYS as Record<string, string>)[seoul.ymd]
  if (holiday && closedForHoliday(hours.closeDay, holiday, seoul.day)) return { kind: 'closed', label: `오늘 휴관 · ${holiday}` }
  if (isClosedOn(parseCloseDay(hours.closeDay), seoul)) return { kind: 'closed', label: '오늘 휴관' }
  // 시간을 해석하지 못한 경우 (정보나루 글자로 대신 채운 곳). 화면에서 원문이나 전화 안내를 보여준다.
  if (!hours.weekday && !hours.saturday && !hours.holiday) return { kind: 'unknown', label: '운영시간 확인 필요' }

  // 문을 여는 공휴일은 휴일(일요일·공휴일) 운영시간을 쓴다
  const span: Span = holiday || seoul.day === 0 ? hours.holiday : seoul.day === 6 ? hours.saturday : hours.weekday
  if (!span) return { kind: 'closed', label: '오늘 휴관' }
  const [open, close] = span.map(toMin)
  if (seoul.minutes < open) return { kind: 'before', label: `오늘 ${span[0]} 개관` }
  if (seoul.minutes < close) return { kind: 'open', label: `운영 중 · ${span[1]}까지` }
  return { kind: 'after', label: '오늘 운영 종료' }
}

// 사용자가 해외에 있어도 도서관 기준(한국 시간)으로 판단한다.
function seoulParts(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(now).map((x) => [x.type, Number(x.value)]),
  )
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
  const ymd = `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`
  return { ymd, day, dateOfMonth: p.day, daysInMonth: new Date(Date.UTC(p.year, p.month, 0)).getUTCDate(), minutes: p.hour * 60 + p.minute }
}
