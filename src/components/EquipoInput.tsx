import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { useEquipos } from '../hooks/useEquipos'
import { sugerirEquipos, equipoExacto, type OpcionEquipo } from '../lib/sugerirEquipos'
import { ZONAS, ZONA_CORTA, esZona, type Zona } from '../lib/zonas'

// ── Campo «Equipo» de lista cerrada ──────────────────────────────────
//
// Se escribe y se elige uno de los equipos que ya existen (catálogo +
// jugadores + partidos). Si lo escrito no es ninguno, la única salida es
// «Añadir como equipo nuevo», que pide categoría y zona antes de crearlo:
// así no vuelven a nacer equipos duplicados por una grafía distinta, ni
// equipos sin clasificar que luego no salen en el control de cobertura.
//
// Al salir del campo sin elegir, lo escrito se descarta y vuelve el valor
// anterior (si coincide exactamente con uno, se toma ese). Sin catálogo
// cargado (o fuera del provider) funciona como texto libre.
//
// La lista se pinta en un portal con posición fija: dentro de una tabla
// con scroll o de un modal con overflow, un desplegable absoluto quedaba
// recortado.

export const EQUIPO_INPUT_CLS = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200'

interface Props {
  value: string
  /** `equipo` viene cuando se ha elegido uno conocido (para rellenar categoría, etc.) */
  onChange: (nombre: string, equipo?: OpcionEquipo) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  disabled?: boolean
  /** Solo se reenvía con la lista cerrada (p. ej. Enter para guardar la fila) */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  /** Se ha salido del campo sin elegir (clic fuera, Tab, Escape): para cerrar una edición inline */
  onSalir?: () => void
  'aria-label'?: string
  id?: string
}

type Alta = { categoria: string; otraCategoria: boolean; zona: string }

export function EquipoInput({ value, onChange, placeholder = 'Escribe y elige un equipo', className = EQUIPO_INPUT_CLS, autoFocus, disabled, onKeyDown, onSalir, 'aria-label': ariaLabel, id }: Props) {
  const { opciones, categorias, zonaDeducida, crear } = useEquipos()
  const libre = opciones.length === 0
  const [texto, setTexto] = useState(value)
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const [alta, setAlta] = useState<Alta | null>(null)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const envoltorio = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const listId = useId()

  // El valor manda: si cambia desde fuera (otro jugador, reset del formulario), se refleja
  useEffect(() => { setTexto(value) }, [value])

  const sugerencias = useMemo(() => sugerirEquipos(opciones, texto), [opciones, texto])
  const exacto = useMemo(() => equipoExacto(opciones, texto), [opciones, texto])
  const nombreNuevo = texto.trim()
  const ofrecerNuevo = !libre && nombreNuevo.length >= 3 && !exacto
  const nItems = sugerencias.length + (ofrecerNuevo ? 1 : 0)

  // Posición de la lista (fija, bajo el campo); se recalcula si la página se mueve
  useLayoutEffect(() => {
    if (!abierto) return
    const medir = () => {
      const r = input.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 300) })
    }
    medir()
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    return () => { window.removeEventListener('scroll', medir, true); window.removeEventListener('resize', medir) }
  }, [abierto])

  function elegir(o: OpcionEquipo) {
    setTexto(o.nombre)
    setAbierto(false)
    setAlta(null)
    setError(null)
    onChange(o.nombre, o)
  }

  /** Salir sin elegir: vacío se respeta, lo exacto se toma, lo demás se descarta */
  function cerrar() {
    setAbierto(false)
    setAlta(null)
    setError(null)
    if (libre) { /* texto libre: ya se ha propagado al escribir */ }
    else if (texto.trim() === '') { setTexto(''); if (value !== '') onChange('') }
    else if (exacto) { if (exacto.nombre !== value) elegir(exacto); else setTexto(exacto.nombre) }
    else setTexto(value)
    onSalir?.()
  }

  // Clic fuera (del campo y de la lista) = salir sin elegir
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (envoltorio.current?.contains(t) || lista.current?.contains(t)) return
      cerrar()
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  })

  function abrirAlta() {
    const z = zonaDeducida(nombreNuevo)
    setAlta({ categoria: '', otraCategoria: categorias.length === 0, zona: z ?? '' })
    setError(null)
  }

  async function crearYUsar() {
    if (!alta || creando) return
    const categoria = alta.categoria.trim()
    if (!categoria) { setError('Falta la categoría'); return }
    if (!esZona(alta.zona)) { setError('Falta la zona'); return }
    setCreando(true)
    try {
      await crear({ nombre: nombreNuevo, categoria, zona: alta.zona })
      elegir({ nombre: nombreNuevo, clave: '', categoria, zona: alta.zona })
    } catch {
      setError('No se ha podido crear el equipo')
    } finally {
      setCreando(false)
    }
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (alta) {
      if (e.key === 'Escape') { e.preventDefault(); setAlta(null) }
      return
    }
    if (!abierto || libre) {
      if (e.key === 'Escape') { cerrar(); return }
      if (e.key === 'Tab') { cerrar(); return }
      if (e.key === 'ArrowDown' && !libre) { e.preventDefault(); setAbierto(true); return }
      onKeyDown?.(e)
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setResaltado(i => Math.min(i + 1, nItems - 1)); break
      case 'ArrowUp': e.preventDefault(); setResaltado(i => Math.max(i - 1, 0)); break
      case 'Enter':
        e.preventDefault()
        if (resaltado < sugerencias.length) elegir(sugerencias[resaltado])
        else if (ofrecerNuevo) abrirAlta()
        break
      case 'Escape': e.preventDefault(); setTexto(value); setAbierto(false); onSalir?.(); break
      case 'Tab': cerrar(); break
    }
  }

  const activo = abierto && !libre && pos && (nItems > 0 || alta)
  const SELECT = 'w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200'

  return (
    <div ref={envoltorio} className="relative">
      <input
        ref={input}
        id={id}
        value={texto}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={!!activo}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={e => {
          const v = e.target.value
          setTexto(v); setAbierto(true); setResaltado(0); setAlta(null); setError(null)
          // Sin catálogo no hay lista que cerrar: se propaga tal cual
          if (libre) onChange(v)
        }}
        onFocus={() => { if (!libre) setAbierto(true) }}
        onBlur={e => {
          // Al irse el foco a otro sitio que no sea la lista (Tab, clic en otro campo)
          const a = e.relatedTarget as Node | null
          if (a && (envoltorio.current?.contains(a) || lista.current?.contains(a))) return
          if (abierto && !alta) cerrar()
        }}
        onKeyDown={teclas}
        className={className}
      />
      {activo && createPortal(
        <div
          ref={lista}
          id={listId}
          role="listbox"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[80] bg-white border border-slate-200 rounded-lg shadow-xl max-h-72 overflow-y-auto text-sm"
        >
          {alta ? (
            <div className="p-3 space-y-2" onMouseDown={e => e.stopPropagation()}>
              <p className="text-xs text-slate-600">
                Equipo nuevo: <span className="font-semibold text-slate-800">{nombreNuevo}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoría *</label>
                  {alta.otraCategoria ? (
                    <input
                      autoFocus
                      value={alta.categoria}
                      onChange={e => setAlta(a => a && { ...a, categoria: e.target.value })}
                      placeholder="Juveniles, Segunda RFEF…"
                      className={SELECT}
                    />
                  ) : (
                    <select
                      autoFocus
                      value={alta.categoria}
                      onChange={e => {
                        const v = e.target.value
                        setAlta(a => a && (v === '__otra__' ? { ...a, categoria: '', otraCategoria: true } : { ...a, categoria: v }))
                      }}
                      className={SELECT}
                    >
                      <option value="">— elige —</option>
                      {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__otra__">Otra…</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zona *</label>
                  <select value={alta.zona} onChange={e => setAlta(a => a && { ...a, zona: e.target.value })} className={SELECT}>
                    <option value="">— elige —</option>
                    {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setAlta(null)} className="px-2.5 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">Volver</button>
                <button type="button" onClick={() => void crearYUsar()} disabled={creando} className="px-2.5 py-1.5 text-xs font-bold bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">
                  {creando ? 'Creando…' : 'Crear y usar'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {sugerencias.map((o, i) => (
                <button
                  key={o.nombre}
                  type="button"
                  role="option"
                  aria-selected={i === resaltado}
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setResaltado(i)}
                  onClick={() => elegir(o)}
                  className={`w-full text-left px-3 py-1.5 flex items-baseline gap-2 ${i === resaltado ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="text-slate-800 truncate">{o.nombre}</span>
                  {(o.categoria || o.zona) && (
                    <span className="ml-auto text-[11px] text-slate-400 whitespace-nowrap">
                      {[o.categoria, o.zona && (ZONA_CORTA[o.zona as Zona] ?? o.zona)].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              ))}
              {ofrecerNuevo && (
                <button
                  type="button"
                  role="option"
                  aria-selected={resaltado === sugerencias.length}
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setResaltado(sugerencias.length)}
                  onClick={abrirAlta}
                  className={`w-full text-left px-3 py-2 flex items-center gap-1.5 text-primary font-semibold border-t border-slate-100 ${resaltado === sugerencias.length ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir «{nombreNuevo}» como equipo nuevo
                </button>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
