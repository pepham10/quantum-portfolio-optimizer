import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server forwards /api to the FastAPI backend, so the browser sees one
// origin (no CORS setup needed). Override with VITE_API_URL for other setups.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
