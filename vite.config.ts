import { defineConfig } from 'vite'
// the S1b page: app/index.html; `npm run dev` serves it at /app/. The look page (Track E): app/look.html
export default defineConfig({ build: { outDir: 'dist', rollupOptions: { input: ['app/index.html', 'app/look.html'] } } })
