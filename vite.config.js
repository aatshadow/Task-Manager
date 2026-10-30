import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * En desarrollo, `/api/*` lo sirve la misma función que despliega Vercel (`api/<nombre>.js`),
 * con `req.body` ya leído y un `res.status().json()` mínimo. Así el Overview se prueba en
 * :5400 sin `vercel dev`. La clave sale del entorno (ANTHROPIC_API_KEY), nunca del repo.
 */
function apiLocal() {
  return {
    name: 'api-local',
    configureServer(server) {
      server.middlewares.use(async (req, res, siguiente) => {
        const m = /^\/api\/([a-z-]+)/.exec(req.url || '')
        if (!m) return siguiente()
        let texto = ''
        for await (const trozo of req) texto += trozo
        try { req.body = texto ? JSON.parse(texto) : {} } catch { req.body = {} }
        res.status = (codigo) => { res.statusCode = codigo; return res }
        res.json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
        const { default: handler } = await server.ssrLoadModule(`/api/${m[1]}.js`)
        return handler(req, res)
      })
    },
  }
}

// :5400 fijo (la casa reserva un puerto por app: SYSTEMA 5200, Black Phoenix 5300).
export default defineConfig(({ mode }) => {
  // las VITE_* del .env le hacen falta a la función local para validar la sesión, y las FIN_*/MERCURY_/WISE_
  // a /api/finanzas (LOGICA §17); en Vercel van en las variables del proyecto
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ['VITE_', 'FIN_', 'MERCURY_', 'WISE_', 'WHOP_', 'ANTHROPIC_']), ...process.env })
  return {
    plugins: [react(), apiLocal()],
    server: { port: 5400, strictPort: true, host: true },
  }
})
