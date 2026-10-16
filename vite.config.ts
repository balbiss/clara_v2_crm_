import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Mesmo PWA da Clara v1 (manifest, ícones e service worker com push).
export default defineConfig({
  server: { port: 5183, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons.svg'],
      manifest: {
        name: 'Clara Ferreira CRM',
        short_name: 'ClaraCRM',
        description: 'CRM de relacionamento — conversas, revendedoras e régua consignada em um só lugar.',
        theme_color: '#d49ba7',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/dashboard',
        scope: '/',
        lang: 'pt-BR',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react') || id.includes('zustand')) return 'vendor-react'
          if (id.includes('chart.js')) return 'vendor-charts'
          if (id.includes('sweetalert2') || id.includes('lucide')) return 'vendor-ui'
          if (id.includes('axios') || id.includes('socket.io')) return 'vendor-net'
        },
      },
    },
  },
})
