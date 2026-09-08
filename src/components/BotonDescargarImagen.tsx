import { useState, type RefObject } from 'react'
import { Camera } from 'lucide-react'
import { descargarComoImagen } from '../lib/exportImagen'

/** Botón para descargar un elemento del DOM (p.ej. un campograma) como PNG. */
export function BotonDescargarImagen({ targetRef, nombreArchivo, etiqueta = 'Imagen', className = '' }: {
  targetRef: RefObject<HTMLElement | null>
  /** Nombre del archivo (sin .png). Puede ser una función para incluir el filtro activo en el momento del clic. */
  nombreArchivo: string | (() => string)
  etiqueta?: string
  className?: string
}) {
  const [estado, setEstado] = useState<'idle' | 'generando' | 'error'>('idle')

  async function handleClick() {
    if (!targetRef.current || estado === 'generando') return
    setEstado('generando')
    try {
      const nombre = typeof nombreArchivo === 'function' ? nombreArchivo() : nombreArchivo
      await descargarComoImagen(targetRef.current, nombre)
      setEstado('idle')
    } catch (err) {
      console.error(err)
      setEstado('error')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={estado === 'generando'}
      title="Descargar como imagen PNG"
      className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold border border-slate-200 text-slate-500 rounded-lg bg-white hover:border-primary hover:text-primary transition-colors disabled:opacity-60 ${className}`}
    >
      <Camera className="w-3 h-3" />
      {estado === 'generando' ? 'Generando…' : estado === 'error' ? 'Reintentar' : etiqueta}
    </button>
  )
}
