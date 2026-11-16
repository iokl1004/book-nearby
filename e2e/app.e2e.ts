import { expect, test, type Page } from '@playwright/test'

// 사용자가 실제로 누르는 흐름을 확인한다: 검색 → 더 보기 → 책 → 도서관 목록 → 더 보기 / 운영시간 펼치기 / 찜 / 다른 지역.
// /api/*는 가짜 응답이라 결과가 늘 같고, 외부 API 호출이 없다.

const book = (n: number) => ({
  isbn13: `97800000000${String(n).padStart(2, '0')}`, title: `테스트 책 ${n}`, authors: '지은이: 홍길동',
  contributors: [{ role: '저자', names: ['홍길동'] }], genre: '', publisher: '책있나출판', year: '2024', image: '',
})

const LONG_HOURS = '평일 09:00~22:00(종합자료실), 09:00~18:00(어린이자료실), 주말 09:00~17:00(종합자료실·어린이자료실 공통), 디지털자료실은 매주 화요일 휴실, 열람실 07:00~23:00'
const lib = (n: number, extra: object = {}) => ({
  code: `L${n}`, name: `테스트도서관 ${n}`, address: `서울특별시 중구 세종대로 ${n}`, tel: '02-000-0000',
  lat: 37.56 + n / 1000, lng: 126.97 + n / 1000, homepage: '', closed: '', operatingTime: '',
  hasBook: true, loanAvailable: n % 2 === 1,
  hours: { closeDay: '매주 월요일', weekday: ['09:00', '18:00'], saturday: ['09:00', '17:00'], holiday: ['09:00', '17:00'] },
  ...extra,
})

async function mockApi(page: Page) {
  await page.route('**/dapi.kakao.com/**', (route) => route.abort()) // 지도 SDK는 막는다 (지도 테스트만 따로 허용)
  // 화면 코드가 불러오는 /api/_lib/*.ts 모듈은 그대로 두고, API 주소만 가로챈다
  await page.route((url) => /^\/api\/[a-z]+$/.test(url.pathname), async (route) => {
    const url = new URL(route.request().url())
    const p = url.searchParams
    const json = (body: object) => route.fulfill({ json: body })
    switch (url.pathname) {
      case '/api/search':
        return p.get('next')
          ? json({ mock: false, items: [book(3), book(4)], next: null })
          : json({ mock: false, items: [book(1), book(2)], next: 'title:2' })
      case '/api/book':
        return json({ item: book(Number(p.get('isbn')!.slice(-2))) })
      case '/api/libraries': {
        if (p.get('region') !== '11' || p.get('isbn')!.endsWith('02')) return json({ mock: false, total: 0, items: [], nextOffset: null })
        const q = p.get('q'), openOn = p.get('openOn')
        if (q || openOn) {
          // 서버 거르기 흉내: 이름에 검색어가 있는 곳, 오늘 여는 곳만이면 2번 도서관은 휴관으로 친다
          const hit = [1, 2, 3, 4, 5].filter((n) => (!q || `테스트도서관 ${n}`.includes(q)) && (!openOn || n !== 2)).map((n) => lib(n))
          return json({ mock: false, total: 5, matched: hit.length, items: hit.slice(0, 3), nextOffset: hit.length > 3 ? 3 : null })
        }
        const offset = Number(p.get('offset') ?? 0)
        const items = offset === 0
          ? [lib(1, { hours: { closeDay: '매주 월요일', weekday: null, saturday: null, holiday: null, text: LONG_HOURS } }), lib(2), lib(3)]
          : [lib(4), lib(5)]
        return json({ mock: false, total: 5, items, nextOffset: offset === 0 ? 3 : null })
      }
      case '/api/regions':
        return json({ mock: false, items: [{ code: '25', name: '대전', count: 2 }] })
    }
    return route.fulfill({ status: 404, json: { error: 'not mocked' } })
  })
}

test.beforeEach(async ({ page }) => mockApi(page))

test('검색 → 결과 더 보기 → 책 → 도서관 더 보기', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('search').getByRole('combobox').fill('테스트')
  await page.keyboard.press('Enter')
  await expect(page.getByText('‘테스트’ 검색 결과')).toBeVisible()
  await expect(page.locator('.book-card')).toHaveCount(2)

  await page.getByRole('button', { name: '검색 결과 더 보기' }).click()
  await expect(page.locator('.book-card')).toHaveCount(4)
  await expect(page.getByRole('button', { name: '검색 결과 더 보기' })).toHaveCount(0)

  await page.getByRole('link', { name: /테스트 책 1/ }).click()
  await expect(page.getByRole('heading', { name: '테스트 책 1' })).toBeVisible()
  await expect(page.locator('.lib-item')).toHaveCount(3)
  await page.getByRole('button', { name: /도서관 더 보기/ }).click()
  await expect(page.locator('.lib-item')).toHaveCount(5)

  await page.getByRole('button', { name: '← 검색 결과로' }).click()
  await expect(page.locator('.book-card')).toHaveCount(4)
})

test('긴 운영시간 원문은 접혀 있다가 펼쳐진다', async ({ page }) => {
  await page.goto('/book/9780000000001')
  const item = page.locator('.lib-item').first()
  const lines = item.locator('.open-lines')
  const folded = (await lines.boundingBox())!.height
  await item.getByRole('button', { name: '운영시간 더 보기 ▼' }).click()
  await expect(item.getByRole('button', { name: '접기 ▲' })).toHaveAttribute('aria-expanded', 'true')
  expect((await lines.boundingBox())!.height).toBeGreaterThan(folded)
  await expect(item).not.toHaveClass(/active/) // 펼치기 버튼은 도서관 선택을 함께 일으키지 않는다

  // 짧은 원문에는 버튼이 없다
  await expect(page.locator('.lib-item').nth(1).locator('.fold-btn')).toHaveCount(0)
})

test('찜하기 → 첫 화면 목록 → 해제', async ({ page }) => {
  await page.goto('/book/9780000000001')
  await page.getByRole('button', { name: '♡ 찜하기' }).click()
  await expect(page.getByRole('button', { name: '♥ 찜함' })).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/')
  await expect(page.getByText('♥ 찜한 책 1권')).toBeVisible()
  await page.getByRole('button', { name: '테스트 책 1 찜 해제' }).click()
  await expect(page.getByText(/찜한 책/)).toHaveCount(0)
})

test('이 지역에 없으면 다른 지역을 찾아 바로 옮겨 간다', async ({ page }) => {
  await page.goto('/book/9780000000002')
  await expect(page.getByText(/에는 이 판본을 가진 도서관이 없어요/)).toBeVisible()
  await page.getByRole('button', { name: '🔎 다른 지역에서 찾아보기' }).click()
  await page.getByRole('button', { name: /대전 2곳/ }).click()
  await expect(page.getByRole('combobox')).toHaveValue('25')
})

test('소장 도서관을 이름으로 찾고, 오늘 여는 곳만 보고, 조건을 지운다', async ({ page }) => {
  await page.goto('/book/9780000000001')
  await expect(page.locator('.lib-item')).toHaveCount(3)
  const box = page.getByRole('searchbox', { name: '도서관 이름이나 동네' })
  await box.fill('4')
  await box.press('Enter')
  await expect(page.locator('.lib-item')).toHaveCount(1)
  await expect(page.locator('.summary')).toContainText('5곳 중 ‘4’ 1곳')

  await box.fill('')
  await page.getByLabel('오늘 여는 곳만').check()
  await expect(page.locator('.summary')).toContainText('오늘 여는 곳 4곳')
  await expect(page.getByRole('button', { name: '테스트도서관 2' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/library-filter.png', clip: { x: 0, y: 0, width: 1280, height: 720 } })

  await box.fill('없는곳')
  await box.press('Enter')
  await expect(page.getByText('조건에 맞는 도서관이 없어요')).toBeVisible()
  await page.getByRole('button', { name: '조건 지우기' }).click()
  await expect(page.locator('.lib-item')).toHaveCount(3)
  await expect(page.getByLabel('오늘 여는 곳만')).not.toBeChecked()
})

test('지역·조건은 주소에 남아 새로고침·공유해도 유지되고, 고른 지역은 다음에도 기억한다', async ({ page }) => {
  await page.goto('/book/9780000000001')
  await page.getByRole('combobox').selectOption('25')
  await expect(page).toHaveURL(/region=25/)
  await page.reload()
  await expect(page.getByRole('combobox')).toHaveValue('25')
  await page.goto('/book/9780000000003') // 다른 책을 열어도 마지막 지역(대전)으로
  await expect(page.getByRole('combobox')).toHaveValue('25')

  await page.goto('/book/9780000000001?region=11&q=4&open=1') // 공유받은 링크
  await expect(page.getByRole('searchbox', { name: '도서관 이름이나 동네' })).toHaveValue('4')
  await expect(page.getByLabel('오늘 여는 곳만')).toBeChecked()
  await expect(page.locator('.lib-item')).toHaveCount(1)

  // 주소로 바로 들어와 지역을 바꿨어도 "검색 결과로"는 사이트 밖이 아니라 같은 제목 검색으로 간다
  await page.getByRole('button', { name: '← 검색 결과로' }).click()
  await expect(page).toHaveURL(/\/\?q=/)
})

test('휴대폰에서는 떠 있는 버튼으로 지도 ↔ 목록을 오간다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await page.goto('/book/9780000000001')
  await page.getByRole('button', { name: /도서관 더 보기/ }).click()
  await expect(page.locator('.lib-item')).toHaveCount(5)
  const toggle = page.locator('.view-toggle')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(toggle).toHaveText('☰ 목록 보기') // 맨 위에서는 지도가 보인다
  await toggle.click()
  await expect(toggle).toHaveText('🗺️ 지도 보기')
  await toggle.click()
  await expect(toggle).toHaveText('☰ 목록 보기')
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(toggle).toBeHidden() // 넓은 화면은 나란히 보여서 버튼이 없다
})

test('목록에서 도서관을 누르면 지도에 정보 카드가 뜬다', async ({ page }) => {
  test.skip(!!process.env.CI, 'CI에는 카카오맵 키가 없고, 키의 등록 도메인도 localhost뿐이라 건너뛴다')
  await page.unroute('**/dapi.kakao.com/**') // 이 테스트만 실제 카카오맵 SDK를 쓴다 (지도 표시는 무료·호출 한도 넉넉)
  await page.goto('/book/9780000000001')
  await page.getByRole('button', { name: '테스트도서관 2', exact: false }).first().click()
  await expect(page.locator('.map-card')).toContainText('테스트도서관 2')
  await page.locator('.map-card-close').click()
  await expect(page.locator('.map-card')).toHaveCount(0)
})
