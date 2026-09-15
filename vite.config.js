import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// :5400 fijo (la casa reserva un puerto por app: SYSTEMA 5200, Black Phoenix 5300).
export default defineConfig({
  plugins: [react()],
  server: { port: 5400, strictPort: true, host: true },
})
