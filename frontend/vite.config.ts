import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ai-api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/ai-api/, '/api/v1'),
      },
      '/ai-launcher': {
        target: 'http://127.0.0.1:8011',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-launcher/, '/api/ai-launcher'),
      },
      '/sim-api': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sim-api/, ''),
      },
    },
  },
})
