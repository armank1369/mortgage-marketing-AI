import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Short commit ID of this build, shown in the sidebar so anyone can tell which version they are
// running. Vercel sets VERCEL_GIT_COMMIT_SHA during its builds; local builds show "dev".
const buildId = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'dev'

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
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
