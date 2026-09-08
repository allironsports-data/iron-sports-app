import { useEffect, type RefObject } from 'react'

// Utilidades del shell sin componentes (fuera del .tsx por fast refresh).

/** Clases sticky compartidas por AppHeader y DetailHeader */
export const SHELL_STICKY = 'sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200'

/**
 * Mide el elemento y publica su altura en `--shell-h` (document.documentElement).
 * Las sub-pestañas de las vistas pueden usar `sticky top-[var(--shell-h)]`.
 */
export function useShellHeight(ref: RefObject<HTMLElement | null> | null) {
  useEffect(() => {
    const el = ref?.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const set = () => root.style.setProperty('--shell-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => { ro.disconnect(); root.style.setProperty('--shell-h', '0px') }
  }, [ref])
}
