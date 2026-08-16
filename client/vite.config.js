import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Binds to 0.0.0.0 (not just localhost) so devices on the same Wi-Fi — like a phone —
    // can reach the dev server via this machine's LAN IP for real on-device mobile testing.
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
