import { useEffect, useRef } from 'react'

// ── «Atrás» cierra el panel, no la sección ───────────────────────────
// Los paneles que se abren encima de una pantalla (ficha de scouting,
// partido, tarjeta de Firmar, tarea…) no están en la URL. Sin esto, abrir
// uno y pulsar atrás en el navegador te sacaba de la sección entera, que
// es justo lo contrario de lo que quiere quien pulsa atrás.
//
// Al abrirse, mete una entrada en el historial (misma URL, con una marca).
// Pulsar atrás quita esa entrada → llamamos a onCerrar. Si el panel se
// cierra por otro camino (la X, Esc, tocar fuera), retiramos nuestra
// entrada para no dejar un «atrás» que no hace nada.
//
//   useAtras(!!panelId, () => setPanelId(null), 'ficha-scouting')
//
// `clave` distingue paneles anidados (partido → vista ampliada).
//
// La entrada se mete en un setTimeout(0) a propósito: los efectos de los
// hijos corren antes que los del padre, y el padre (App) es quien escribe
// el hash. Si el panel se abre en el mismo render que un cambio de
// pestaña, sin el retardo nuestra entrada quedaría DEBAJO de la del hash y
// «atrás» se saltaría el panel.
//
// Si la pantalla entera se desmonta con el panel abierto (cambio de
// sección desde la cabecera), no tocamos el historial: la entrada queda
// debajo de la nueva y se consume sola con un atrás de más. Es el mal
// menor: llamar a back() en el desmontaje te llevaría a la sección
// equivocada.

const MARCA = '__atras'

export function useAtras(abierto: boolean, onCerrar: () => void, clave: string) {
  const onCerrarRef = useRef(onCerrar)
  useEffect(() => { onCerrarRef.current = onCerrar })
  const nuestra = useRef(false)

  useEffect(() => {
    if (!abierto) {
      // Cierre programático con nuestra entrada aún encima → quitarla. Con
      // retardo, por lo mismo que la apertura: si en este mismo render el
      // padre cambia el hash (cerrar ficha + saltar a Partidos), su entrada
      // se mete ENCIMA de la nuestra y un back() síncrono se la comería. Con
      // el retardo, al comprobar ya no es nuestra y no tocamos nada.
      const era = nuestra.current
      nuestra.current = false
      if (!era) return
      const timer = window.setTimeout(() => { if (esNuestra(clave)) window.history.back() }, 0)
      return () => window.clearTimeout(timer)
    }

    let timer: number | undefined
    if (esNuestra(clave)) {
      // StrictMode (solo en desarrollo) monta, desmonta y vuelve a montar:
      // la entrada ya es nuestra, no metemos otra
      nuestra.current = true
    } else {
      timer = window.setTimeout(() => {
        if (!esNuestra(clave)) {
          window.history.pushState({ ...(window.history.state ?? {}), [MARCA]: clave }, '')
        }
        nuestra.current = true
      }, 0)
    }

    const onPop = () => {
      if (!esNuestra(clave)) {
        nuestra.current = false
        onCerrarRef.current()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
    }
  }, [abierto, clave])
}

function esNuestra(clave: string): boolean {
  const st = window.history.state as Record<string, unknown> | null
  return !!st && st[MARCA] === clave
}
