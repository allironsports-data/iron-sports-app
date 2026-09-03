// Tipos y helpers sin componentes de GlobalExtras (fuera del .tsx por fast refresh)

export type MainSection = 'tareas' | 'jugadores' | 'distribucion' | 'captacion' | 'boulema' | 'mi-dia'

/** Lanza una notificación del sistema (si hay permiso y la pestaña no está visible) */
export function fireSystemNotification(message: string) {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    if (document.visibilityState === 'visible') return
    const opts: NotificationOptions = { body: message, icon: '/icon-192.png', badge: '/icon-192.png' }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) void reg.showNotification('All Iron Sports', opts)
        else new Notification('All Iron Sports', opts)
      }).catch(() => { try { new Notification('All Iron Sports', opts) } catch { /* móvil sin soporte */ } })
    } else {
      new Notification('All Iron Sports', opts)
    }
  } catch { /* Notification no soportado (p. ej. iOS sin PWA instalada) */ }
}
