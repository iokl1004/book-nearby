// 브라우저와 서버가 같이 쓰는 타입 (process 같은 서버 전용 코드 없음)
import type { Contributor } from './authors.js'

export type Book = {
  isbn13: string
  title: string
  authors: string // 정보나루 원문
  contributors: Contributor[] // 원문을 글·그림·저자·옮김 등 역할별로 나눈 것
  genre: string // "문학 › 소설"
  publisher: string
  year: string
  image: string
}

export type Library = {
  code: string
  name: string
  address: string
  tel: string
  lat: number
  lng: number
  homepage: string
  closed: string // 정보나루가 주는 휴관일 원문 ("매주 월요일 / 법정휴일"), 없으면 ''
  operatingTime: string // 정보나루가 주는 운영시간 원문 ("평일 09:00~22:00 / 주말 09:00~18:00"), 없으면 ''
}

export type Availability = { hasBook: boolean; loanAvailable: boolean }

// 전국도서관표준데이터에서 가져온 운영 정보. 시간은 'HH:MM', 운영하지 않으면 null.
export type Span = [open: string, close: string] | null
// text: 시간을 해석하지 못했을 때 화면에 그대로 보여줄 운영시간 원문
export type Hours = { closeDay: string; weekday: Span; saturday: Span; holiday: Span; text?: string }
export type HoursRecord = Hours & { name: string; lat: number; lng: number }
