import { defineConfig } from 'vite'
// the S1b page: app/index.html; `npm run dev` serves it at /app/
export default defineConfig({ build: { outDir: 'dist', rollupOptions: { input: 'app/index.html' } } })
