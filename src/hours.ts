import type { Hours, Span } from '../api/_lib/types'
import { closeReason, isHoliday } from '../api/_lib/close-day'

export { closedForHoliday, parseCloseDay } from '../api/_lib/close-day'

// 휴관일을 오늘(한국 시간) 기준으로 해석해 운영 상태를 만든다.
// 시간에 따라 바뀌는 값이라 서버(CDN 캐시)가 아니라 브라우저에서 계산한다.

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export type Status = { kind: 'open' | 'before' | 'after' | 'closed' | 'unknown'; label: string }

export function openStatus(hours: Hours | null | undefined, now = new Date()): Status {
  if (!hours) return { kind: 'unknown', label: '운영시간 확인 필요' }
  const seoul = seoulParts(now)
  const reason = closeReason(hours.closeDay, seoul)
  if (reason !== null) return { kind: 'closed', label: reason ? `오늘 휴관 · ${reason}` : '오늘 휴관' }
  // 시간을 해석하지 못한 경우 (정보나루 글자로 대신 채운 곳). 화면에서 원문이나 전화 안내를 보여준다.
  if (!hours.weekday && !hours.saturday && !hours.holiday) return { kind: 'unknown', label: '운영시간 확인 필요' }

  // 문을 여는 공휴일은 휴일(일요일·공휴일) 운영시간을 쓴다
  const span: Span = isHoliday(seoul.ymd) || seoul.day === 0 ? hours.holiday : seoul.day === 6 ? hours.saturday : hours.weekday
  if (!span) return { kind: 'closed', label: '오늘 휴관' }
  const [open, close] = span.map(toMin)
  if (seoul.minutes < open) return { kind: 'before', label: `오늘 ${span[0]} 개관` }
  if (seoul.minutes < close) return { kind: 'open', label: `운영 중 · ${span[1]}까지` }
  return { kind: 'after', label: '오늘 운영 종료' }
}

// 오늘 날짜(한국 시간) "20261116". 서버의 "오늘 여는 곳만" 필터에 넘긴다
export const todayYmd = (now = new Date()) => seoulParts(now).ymd

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
