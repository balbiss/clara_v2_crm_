import api from '../api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function keyToBase64(key) {
  return btoa(String.fromCharCode(...new Uint8Array(key)))
}

export function usePushNotifications() {
  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  async function subscribe() {
    if (!isSupported) return

    // iOS requer que o app esteja instalado (PWA)
    if (navigator.standalone === false && /iPhone|iPad/.test(navigator.userAgent)) return

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      const { data } = await api.get('/push_subscriptions/vapid_public_key')
      if (!data.vapid_public_key) return

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.vapid_public_key)
        })
      }

      await api.post('/push_subscriptions', {
        endpoint: sub.endpoint,
        p256dh:   keyToBase64(sub.getKey('p256dh')),
        auth:     keyToBase64(sub.getKey('auth'))
      })
    } catch (e) {
      // Silencioso — push é opt-in, falha não deve quebrar o app
      console.warn('Push subscribe:', e.message)
    }
  }

  async function unsubscribe() {
    if (!isSupported) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) return
      await api.delete('/push_subscriptions/unsubscribe', { data: { endpoint: sub.endpoint } })
      await sub.unsubscribe()
    } catch (e) {
      console.warn('Push unsubscribe:', e.message)
    }
  }

  return { isSupported, subscribe, unsubscribe }
}
