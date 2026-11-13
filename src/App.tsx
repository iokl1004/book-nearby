import { Link, Route, Routes } from 'react-router-dom'
import SearchPage from './pages/SearchPage'
import BookPage from './pages/BookPage'

export default function App() {
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo">
            <span className="logo-mark" aria-hidden="true">책</span>
            책있나 <small>BookNearby</small>
          </Link>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/book/:isbn" element={<BookPage />} />
          <Route path="*" element={<p className="empty">페이지를 찾을 수 없어요. <Link to="/">처음으로 가기</Link></p>} />
        </Routes>
      </main>
    </>
  )
}
