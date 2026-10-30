import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, type ProxyOptions } from 'vite'
import { servidorPrueba } from './mock/servidorPrueba.ts'

/** La versión de package.json («1.0.0»), para mostrarla al pie del menú. */
const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

// Análisis Comercial (Madomi Pastas): la sesión va contra la plataforma (/plataforma) y los datos contra la API de la
// app (/api). `npm run dev:mock` (TODO testing): sin ningún backend, el login y /api los responde mock/servidorPrueba.ts.
const API = process.env.ANALISIS_API ?? 'http://localhost:5030' // TODO: puerto propuesto al backend el 26/10, sin confirmar

const proxy: Record<string, ProxyOptions> = {
  '/api': { target: API, changeOrigin: true },
  '/plataforma': {
    target: 'http://localhost:5010', // TODO testing: URL local de la plataforma
    changeOrigin: true,
    rewrite: (ruta) => ruta.replace(/^\/plataforma/, ''),
  },
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === 'mock' && servidorPrueba()],
  define: { 'import.meta.env.VITE_VERSION': JSON.stringify(VERSION) },
  server: {
    port: 5177, // 5173 De Ruta · 5174 Mantenimiento · 5175 portal de MainPage · 5176 CashFlow · 5177 Análisis Comercial
    strictPort: true,
    proxy: mode === 'mock' ? undefined : proxy,
  },
}))
