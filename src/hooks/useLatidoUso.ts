import { useEffect, useRef } from 'react'
import { latidoUso, bloqueDe } from '../lib/dbUso'

// ── Latido de uso ────────────────────────────────────────────────────
// Mientras la pestaña está visible y la persona ha tocado algo (ratón,
// teclado, scroll, dedo) en los últimos 5 minutos, cada minuto se apunta
// el bloque de 5 min en curso con la vista actual (tabla app_uso). Una
// pestaña abierta y olvidada no cuenta. Un bloque+vista solo se manda
// una vez; cambiar de vista dentro del mismo bloque manda otro.

const CADA_MS = 60 * 1000             // cada cuánto se comprueba
const INACTIVO_MS = 5 * 60 * 1000     // sin tocar nada desde hace tanto = no cuenta

export function useLatidoUso(userId: string | null | undefined, vista: string) {
  const ultimaAccion = useRef(0)
  const ultimoEnviado = useRef('')
  const vistaRef = useRef(vista)
  useEffect(() => { vistaRef.current = vista }, [vista])

  useEffect(() => {
    if (!userId) return
    ultimaAccion.current = Date.now()   // abrir la app ya cuenta como actividad
    const tocar = () => { ultimaAccion.current = Date.now() }
    // mousemove va aparte y a baja frecuencia: solo sirve para no dar por
    // inactivo a quien está leyendo y mueve el ratón sin hacer clic
    let ultimoMove = 0
    const mover = () => { const t = Date.now(); if (t - ultimoMove > 10_000) { ultimoMove = t; tocar() } }
    const eventos: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel']
    eventos.forEach(e => window.addEventListener(e, tocar, { passive: true }))
    window.addEventListener('mousemove', mover, { passive: true })

    const latir = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimaAccion.current > INACTIVO_MS) return
      const bloque = bloqueDe()
      const clave = `${bloque}|${vistaRef.current}`
      if (clave === ultimoEnviado.current) return
      ultimoEnviado.current = clave
      void latidoUso(userId, vistaRef.current, bloque).then(ok => {
        // Si no se pudo apuntar, que lo vuelva a intentar al minuto siguiente
        if (!ok && ultimoEnviado.current === clave) ultimoEnviado.current = ''
      })
    }

    const alVolver = () => { if (document.visibilityState === 'visible') { tocar(); latir() } }
    document.addEventListener('visibilitychange', alVolver)
    const timer = window.setInterval(latir, CADA_MS)
    latir()
    return () => {
      eventos.forEach(e => window.removeEventListener(e, tocar))
      window.removeEventListener('mousemove', mover)
      document.removeEventListener('visibilitychange', alVolver)
      window.clearInterval(timer)
    }
  }, [userId])

  // Cambio de vista: se apunta en el acto (si está activo), sin esperar al minuto
  useEffect(() => {
    if (!userId) return
    if (document.visibilityState !== 'visible') return
    if (Date.now() - ultimaAccion.current > INACTIVO_MS) return
    const bloque = bloqueDe()
    const clave = `${bloque}|${vista}`
    if (clave === ultimoEnviado.current) return
    ultimoEnviado.current = clave
    void latidoUso(userId, vista, bloque).then(ok => { if (!ok && ultimoEnviado.current === clave) ultimoEnviado.current = '' })
  }, [userId, vista])
}
