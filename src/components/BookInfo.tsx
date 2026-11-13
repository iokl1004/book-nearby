import { joinInfo, type Book } from '../api'

// 책마다 저자 표기가 제각각이라, 역할별로 나눠 항상 같은 순서(글 → 그림 → 저자 → 원작 → 옮김 → 감수 → 분야 → 출판)로 보여준다.
export default function BookInfo({ book }: { book: Book }) {
  const rows: [label: string, value: string][] = [
    ...(book.contributors?.length
      ? book.contributors.map((c): [string, string] => [c.role, c.names.join(', ')])
      : book.authors ? [['저자', book.authors] as [string, string]] : []), // 해석 못 한 옛 데이터는 원문 그대로
    ['분야', book.genre ?? ''],
    ['출판', joinInfo(book.publisher, book.year)],
  ]
  return (
    <dl className="book-info">
      {rows.filter(([, value]) => value).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
