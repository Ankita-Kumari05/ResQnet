import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/map-v2/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
