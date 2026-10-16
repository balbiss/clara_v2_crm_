import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

// Injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST || [])
cleanupOutdatedCaches()

// Sem isso, um app instalado (PWA) pode ficar preso numa versao antiga
// indefinidamente - o novo SW so assumiria depois que TODAS as abas/instancias
// fossem fechadas manualmente, o que na pratica quase nunca acontece.
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// SPA fallback
self.addEventListener('fetch', (event) => {
  if (
    event.request.mode === 'navigate' &&
    !event.request.url.includes('/api') &&
    !event.request.url.includes('/cable')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    )
  }
})

// Push notification received
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title   = data.title || 'Clara Ferreira CRM'
  const options = {
    body:    data.body    || 'Você tem uma nova notificação.',
    icon:    '/pwa-192x192.png',
    badge:   '/pwa-64x64.png',
    data:    { url: data.url || '/conversas' },
    vibrate: [200, 100, 200],
    tag:     data.tag     || 'crm-notification',
    renotify: true,
    requireInteraction: false
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Tap na notificação → abre ou foca o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/conversas'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl })
          return client.focus()
        }
      }
      return clients.openWindow(targetUrl)
    })
  )
})
