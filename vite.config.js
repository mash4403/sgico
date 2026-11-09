import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Los mismos encabezados de seguridad de producción (vercel.json) en `npm run preview`,
// para probar la CSP en local antes de publicar.
const encabezadosProduccion = Object.fromEntries(
  JSON.parse(readFileSync(path.resolve(__dirname, 'vercel.json'), 'utf8'))
    .headers[0].headers.map(h => [h.key, h.value])
)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { port: 3000 },
  preview: { headers: encabezadosProduccion },
})
