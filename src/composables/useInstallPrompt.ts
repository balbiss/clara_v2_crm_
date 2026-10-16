import { useEffect, useState } from 'react'

// Porte de composables/useInstallPrompt.js da v1 (prompt "instalar app" do Android/Chrome).
type BIPEvent = Event & { prompt: () => void; userChoice: Promise<unknown> }
let deferredPrompt: BIPEvent | null = null

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!deferredPrompt)
  const [isInstalled, setIsInstalled] = useState(isStandalone())

  useEffect(() => {
    const onBefore = (event: Event) => { event.preventDefault(); deferredPrompt = event as BIPEvent; setCanInstall(true) }
    const onInstalled = () => { setIsInstalled(true); setCanInstall(false); deferredPrompt = null }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    setCanInstall(false)
  }

  return { canInstall, isInstalled, isIOS: isIOS(), isStandalone: isStandalone(), promptInstall }
}
