import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Strict CSP for the packaged panel only (the dev server needs inline HMR scripts).
// The panel never talks to the network itself — everything goes through Electron IPC.
const csp: Plugin = {
  name: 'panel-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content:
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'",
      },
      injectTo: 'head-prepend',
    },
  ],
}

// Electron loads dist/index.html from disk, so asset paths must be relative.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), csp],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
