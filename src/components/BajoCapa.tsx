import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * La pantalla que queda debajo cuando se abre una ficha a página completa
 * (jugador, miembro del equipo). En vez de desmontarla, se esconde: al
 * volver, todo sigue como estaba — la semana del calendario, los filtros,
 * la pestaña y la altura a la que se había bajado.
 */
export function BajoCapa({ oculta, children }: { oculta: boolean; children: ReactNode }) {
  const y = useRef(0)
  // Mientras se ve, se va apuntando por dónde va el scroll
  useEffect(() => {
    if (oculta) return
    const apuntar = () => { y.current = window.scrollY }
    window.addEventListener('scroll', apuntar, { passive: true })
    return () => window.removeEventListener('scroll', apuntar)
  }, [oculta])
  useLayoutEffect(() => {
    if (oculta) { window.scrollTo(0, 0); return } // la ficha empieza arriba
    window.scrollTo(0, y.current)
    // Lo que mide el DOM (altura de cabeceras…) midió cero mientras estaba escondido
    window.dispatchEvent(new Event('resize'))
  }, [oculta])
  return <div style={oculta ? { display: 'none' } : undefined}>{children}</div>
}
