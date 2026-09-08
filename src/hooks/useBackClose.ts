import { useEffect, useId, useRef } from 'react'

// ═════════════════════════════════════════════════════════════
// useBackClose: el botón «atrás» del móvil cierra el panel/modal.
//
// Al abrir (open → true) empujamos una entrada en el historial con
// `history.pushState({ aisPanel: key }, '')` SIN cambiar la URL
// (misma ruta + mismo hash), así el hash router de App.tsx no ve
// ningún `hashchange` y no navega.
//
// Casos límite:
//  - Atrás del navegador: llega `popstate`; si la entrada que se va era
//    la nuestra (marcamos `pushed.current`) llamamos a onClose.
//  - Cierre programático (botón X, guardar…): open pasa a false con
//    nuestra entrada aún arriba → hacemos `history.back()` para dejar el
//    historial limpio. Ese back dispara popstate, pero `pushed` ya está a
//    false, así que NO se vuelve a llamar onClose (guard doble llamada).
//  - Desmontar con el panel abierto: igual que cierre programático.
//  - Varios paneles anidados: cada uno empuja su propia entrada y cada
//    popstate solo cierra el de arriba (el último abierto), porque
//    `history.state` tras el pop ya no coincide con su key.
//  - Si el usuario navega a otra ruta (hash) con el panel abierto, la
//    entrada queda «huérfana»; el siguiente atrás la consumirá sin
//    efectos porque el componente ya se ha desmontado.
// ═════════════════════════════════════════════════════════════

interface AisPanelState { aisPanel: string }

function esNuestro(state: unknown, key: string): state is AisPanelState {
  return !!state && typeof state === 'object' && (state as AisPanelState).aisPanel === key
}

export function useBackClose(open: boolean, onClose: () => void, key?: string) {
  const autoId = useId()
  const id = key ?? `panel${autoId}`
  const pushed = useRef(false)          // ¿nuestra entrada está arriba del historial?
  const pendiente = useRef<number | null>(null) // back diferido (ver StrictMode abajo)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    // Si hay un back diferido de un desmontaje inmediatamente anterior
    // (React.StrictMode monta → limpia → remonta el efecto), lo cancelamos.
    if (pendiente.current !== null) { window.clearTimeout(pendiente.current); pendiente.current = null }
    // Mismo href → no cambia la URL ni dispara hashchange. Si nuestra
    // entrada ya está arriba (remontaje), no la duplicamos.
    if (!esNuestro(window.history.state, id)) {
      window.history.pushState({ aisPanel: id }, '', window.location.href)
    }
    pushed.current = true

    const onPop = () => {
      if (!pushed.current) return
      // Si el nuevo estado sigue siendo el nuestro es que se ha desapilado
      // otra entrada por encima (panel anidado): no cerramos.
      if (esNuestro(window.history.state, id)) return
      pushed.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      if (!pushed.current) return
      pushed.current = false
      // El back se difiere un tick: en StrictMode el efecto se vuelve a
      // montar de inmediato y entonces NO hay que retroceder (si lo
      // hiciéramos, el back asíncrono llegaría después del nuevo push y
      // saltaría dos entradas, cerrando el panel nada más abrirlo).
      pendiente.current = window.setTimeout(() => {
        pendiente.current = null
        if (pushed.current) return
        // Solo retrocedemos si nuestra entrada sigue arriba; si no, la URL
        // ya cambió y retroceder rompería la navegación del usuario.
        if (esNuestro(window.history.state, id)) window.history.back()
      }, 0)
    }
  }, [open, id])
}
