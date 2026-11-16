import { defineConfig } from '@playwright/test'

// 화면 클릭 테스트(E2E). API는 테스트 안에서 가짜 응답으로 바꿔서 정보나루·카카오 호출 한도를 쓰지 않는다.
// 사용법: npm run e2e   (내 컴퓨터는 설치된 Chrome을 써서 브라우저를 따로 받지 않고, GitHub에서는 Playwright용 Chromium을 받아 쓴다)
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts', // vitest가 *.spec.ts를 단위 테스트로 집어 가지 않게 이름을 다르게 한다
  // GitHub에서는 실패 이유를 커밋 화면의 주석(annotation)으로도 남긴다 (로그인 없이 볼 수 있게)
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:5173', channel: process.env.CI ? undefined : 'chrome', locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npm run dev -- --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
})
