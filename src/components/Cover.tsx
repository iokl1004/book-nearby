// 표지 이미지가 없으면 제목 첫 글자로 책 모양 자리를 채운다.
export default function Cover({ src, title, large }: { src?: string; title?: string; large?: boolean }) {
  const cls = large ? 'cover lg' : 'cover'
  return src
    ? <img className={cls} src={src} alt="" loading="lazy" />
    : <span className={cls} aria-hidden="true">{title?.trim()[0] ?? '책'}</span>
}
