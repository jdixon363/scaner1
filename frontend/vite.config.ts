import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: proxy /api/* to the FastAPI backend (uvicorn backend.main:app --port 8850)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8850', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
