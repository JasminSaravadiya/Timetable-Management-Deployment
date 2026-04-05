import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // SPA fallback: serve index.html for all non-file routes (fixes refresh 404s in dev)
  server: {
    historyApiFallback: true,
  },
})
