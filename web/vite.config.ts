import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handleApiMiddleware } from './server/api.ts'

function apiBackendPlugin(): Plugin {
  return {
    name: 'api-backend',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handleApiMiddleware(req, res, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handleApiMiddleware(req, res, next)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), apiBackendPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
})
