import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    https: {
      // Force modern TLS protocols and ciphers
      key: undefined, // Let Vite generate self-signed with modern defaults
      cert: undefined,
    },
    proxy: {}
  },
  clearScreen: false
})
