import { useState, useEffect } from 'react'

// ── mobile helpers ────────────────────────────────────────────

/** True cuando el viewport es < 640px (breakpoint sm de Tailwind). */
export function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}
