import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'public')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Built-in icons come from public/; icons uploaded through MCP live with
      // the backend, so ask it for any icon this folder doesn't have.
      '/icons': {
        target: 'http://localhost:3001',
        bypass: req => (fs.existsSync(path.join(publicDir, req.url.split('?')[0])) ? req.url : undefined),
      },
    },
  },
})
