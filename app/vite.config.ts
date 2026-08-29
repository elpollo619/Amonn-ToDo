import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // En desarrollo (npm run dev) redirige las llamadas al backend local.
    // Así puedes correr frontend (5173) y servidor (4000) por separado.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
