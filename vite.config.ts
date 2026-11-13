import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// 개발 중에 /api/* 요청을 api/ 폴더의 함수로 직접 연결한다 (배포 환경에서는 Vercel이 같은 역할).
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const name = url.pathname.match(/^\/api\/(\w+)$/)?.[1]
        if (!name) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          const response: Response = await mod.GET(new Request(url))
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(await response.text())
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // 서버 전용 키(DATA4LIBRARY_KEY, KAKAO_REST_KEY)를 .env에서 읽어 개발용 API 함수에 넘긴다. 브라우저로는 나가지 않는다.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['DATA4LIBRARY_', 'KAKAO_REST_']))
  return { plugins: [react(), apiDev()] }
})
