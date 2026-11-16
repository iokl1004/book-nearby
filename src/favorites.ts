import { useSyncExternalStore } from 'react'
import type { Book } from './api'

// 찜한 책: 로그인 없이 이 브라우저(localStorage)에만 저장한다. 서버로 보내지 않는다.
// 책 정보를 통째로 저장해서 첫 화면 목록을 그릴 때 API를 부르지 않는다.
const KEY = 'book-nearby:favorites'
const MAX = 100

// 같은 책이면 빼고, 아니면 맨 앞에 넣는다 (최대 100권)
export const toggleFavorite = (list: Book[], book: Book): Book[] =>
  list.some((b) => b.isbn13 === book.isbn13)
    ? list.filter((b) => b.isbn13 !== book.isbn13)
    : [book, ...list].slice(0, MAX)

function read(): Book[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((b) => typeof b?.isbn13 === 'string' && typeof b?.title === 'string') : []
  } catch {
    return [] // 저장소를 못 쓰는 환경(사생활 보호 모드 등)
  }
}

// 화면 여러 곳(상세 버튼, 첫 화면 목록)과 다른 탭이 같은 목록을 보도록 한 곳에서 관리한다
let current: Book[] | null = null
const listeners = new Set<() => void>()
const snapshot = () => (current ??= read())

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { current = read(); listener() } // 다른 탭에서 바뀜
  }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
}

export function setFavorites(list: Book[]) {
  current = list
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* 저장 못 해도 이번 화면에서는 동작 */ }
  listeners.forEach((l) => l())
}

export function useFavorites() {
  const list = useSyncExternalStore(subscribe, snapshot, () => [])
  return {
    list,
    has: (isbn13: string) => list.some((b) => b.isbn13 === isbn13),
    toggle: (book: Book) => setFavorites(toggleFavorite(list, book)),
  }
}
