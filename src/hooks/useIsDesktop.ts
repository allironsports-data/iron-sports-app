import { useState, useEffect } from 'react'

/**
 * ¿La pantalla es ancha? (por defecto, a partir de lg = 1024px)
 *
 * Sirve para NO pintar dos veces lo mismo. El truco de poner dos versiones
 * de una tabla y esconder una con `hidden sm:block` es cómodo, pero React
 * construye las dos y el navegador se traga las dos: en una lista de 500
 * filas eso es el doble de trabajo del que hace falta, siempre, en el móvil
 * y en el escritorio. Con esto se decide en JavaScript y solo se pinta una.
 */
export function useIsDesktop(minWidth = 1024): boolean {
  const [is, setIs] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(min-width:${minWidth}px)`).matches)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(min-width:${minWidth}px)`)
    const onChange = () => setIs(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [minWidth])
  return is
}
