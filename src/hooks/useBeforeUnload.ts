import { useEffect } from 'react'

/**
 * Avisa al cerrar/recargar la pestaña si hay cambios sin guardar.
 * El navegador muestra su propio diálogo genérico (el texto no se puede
 * personalizar en navegadores modernos).
 */
export function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Chrome heredado necesita returnValue para mostrar el aviso.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
