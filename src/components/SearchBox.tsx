import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { addRecent, findSuggestions, loadPopular, loadRecent, saveRecent, type Suggestion } from '../suggest'

type Option = { label: string; sub?: string; query: string; recent?: boolean }
type Props = { initial: string; onSearch: (q: string) => void; autoFocus?: boolean }

// 검색창 + 미리보기 목록
// - 비어 있으면 최근 검색어, 입력하면 인기 도서 중 맞는 책을 보여준다 (둘 다 브라우저 안에서만 찾아 API 호출 0건)
// - ↑↓로 고르고 Enter로 검색, Esc로 닫기. 화면 낭독기용 combobox/listbox 역할을 붙였다.
export default function SearchBox({ initial, onSearch, autoFocus }: Props) {
  const [value, setValue] = useState(initial)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [popular, setPopular] = useState<Suggestion[]>([])
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const box = useRef<HTMLDivElement>(null)

  // 다른 검색으로 이동하면 입력값을 맞추고 목록을 닫는다
  useEffect(() => {
    setValue(initial)
    setOpen(false)
  }, [initial])

  const showRecent = !value.trim()
  const suggestions = useMemo(() => findSuggestions(popular, value), [popular, value])
  const options: Option[] = showRecent
    ? recent.map((r) => ({ label: r, query: r, recent: true }))
    : suggestions.map(([title, author]) => ({ label: title, sub: author, query: title }))
  const expanded = open && options.length > 0

  const search = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    const next = addRecent(recent, q)
    setRecent(next)
    saveRecent(next)
    setValue(q)
    setOpen(false)
    setActive(-1)
    onSearch(q)
  }

  const updateRecent = (next: string[]) => {
    setRecent(next)
    saveRecent(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      // -1(입력창) → 0 → … → 마지막 → 다시 -1 로 돈다
      setActive((i) => {
        const next = i + step
        if (next >= options.length) return -1
        if (next < -1) return options.length - 1
        return next
      })
    } else if (e.key === 'Enter' && expanded && active >= 0) {
      e.preventDefault()
      search(options[active].query)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div
      className="search-box"
      ref={box}
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false) }}
    >
      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); search(value) }}>
        <label htmlFor="q" className="sr-only">책 제목이나 저자</label>
        <input
          id="q"
          name="q"
          value={value}
          placeholder="책 제목이나 저자를 입력하세요"
          maxLength={100}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={expanded}
          aria-controls="search-suggest"
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? `suggest-${active}` : undefined}
          onFocus={() => { loadPopular().then(setPopular); setOpen(true) }}
          onChange={(e) => { setValue(e.target.value); setOpen(true); setActive(-1) }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="btn">검색</button>
      </form>

      {expanded && (
        <ul id="search-suggest" role="listbox" className="suggest" aria-label={showRecent ? '최근 검색어' : '추천 도서'}>
          {showRecent && (
            <li className="suggest-head" role="presentation">
              최근 검색어
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => updateRecent([])}>전체 삭제</button>
            </li>
          )}
          {options.map((o, i) => (
            <li
              key={`${o.label}-${o.sub ?? ''}`}
              id={`suggest-${i}`}
              role="option"
              aria-selected={i === active}
              className="suggest-item"
              onMouseDown={(e) => e.preventDefault()} // 누르는 동안 입력창 포커스가 빠져 목록이 닫히지 않게
              onMouseEnter={() => setActive(i)}
              onClick={() => search(o.query)}
            >
              <span aria-hidden="true">{o.recent ? '🕘' : '📖'}</span>
              <span className="suggest-title">{o.label}</span>
              {o.sub && <span className="suggest-sub">{o.sub}</span>}
              {o.recent && (
                <button
                  type="button"
                  className="suggest-remove"
                  aria-label={`최근 검색어 ${o.label} 삭제`}
                  onClick={(e) => { e.stopPropagation(); updateRecent(recent.filter((r) => r !== o.label)) }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
