import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 9013,
    proxy: {
      '/api': 'http://localhost:9513'
    }
  },
  build: {
    outDir: '../dist'
  }
})
