import { useCallback, useEffect, useState } from 'react'
import { History, Plus, Pencil, Trash2 } from 'lucide-react'
import type { Profile } from '../contexts/AuthContext'
import { fetchAudit, type AuditEntry } from '../lib/dbAudit'
import { fechaRelativa, valorCorto } from '../lib/formato'

// ── Historial de cambios ─────────────────────────────────────────────
// Lista reutilizable de audit_log: en Admin (con filtros) y en la ficha
// del jugador (con tabla + filaId fijos). Recibe `profiles` para poner
// nombre al user_id.

interface Props {
  tabla?: string
  filaId?: string
  profiles: Profile[]
  /** Tamaño de página (por defecto 200) */
  limit?: number
  /** Oculta la columna de tabla/fila (útil cuando ya se sabe de qué fila es) */
  compacto?: boolean
}

const ICONO = {
  INSERT: <Plus className="w-3 h-3 text-emerald-600" />,
  UPDATE: <Pencil className="w-3 h-3 text-blue-600" />,
  DELETE: <Trash2 className="w-3 h-3 text-red-600" />,
}
const LABEL = { INSERT: 'creó', UPDATE: 'modificó', DELETE: 'borró' }

// Campos que no aportan nada leídos en el historial
const OCULTOS = new Set(['updated_at', 'created_at'])

export function HistorialCambios({ tabla, filaId, profiles, limit = 200, compacto }: Props) {
  const [items, setItems] = useState<AuditEntry[]>([])
  const [cargando, setCargando] = useState(false)
  const [fin, setFin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (before?: string) => {
    setCargando(true)
    setError(null)
    try {
      const page = await fetchAudit({ tabla, filaId, limit, before })
      setItems(prev => (before ? [...prev, ...page] : page))
      setFin(page.length < limit)
    } catch (e) {
      // 42P01: la tabla aún no está migrada
      const code = (e as { code?: string } | null)?.code
      setError(code === '42P01' ? 'El historial aún no está activado (falta ejecutar migration_audit_log.sql).' : 'No se ha podido cargar el historial.')
    } finally {
      setCargando(false)
    }
  }, [tabla, filaId, limit])

  useEffect(() => { setItems([]); setFin(false); void cargar() }, [cargar])

  const nombre = (uid: string | null) => {
    if (!uid) return 'Sistema'
    const p = profiles.find(x => x.id === uid)
    return p ? p.name : uid.slice(0, 8)
  }
  const nombreFila = (e: AuditEntry) => {
    const src = e.despues ?? e.antes
    const n = src?.name ?? src?.full_name ?? src?.title ?? src?.titulo
    return typeof n === 'string' && n ? n : e.filaId.slice(0, 8)
  }

  if (error) return <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>

  return (
    <div>
      {items.length === 0 && !cargando && (
        <p className="text-xs text-slate-400 italic py-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Sin cambios registrados.</p>
      )}
      <div className="divide-y divide-slate-100">
        {items.map(e => {
          const cambios = e.accion === 'UPDATE'
            ? Object.entries(e.cambios ?? {}).filter(([k]) => !OCULTOS.has(k))
            : []
          return (
            <div key={e.id} className="py-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap text-slate-600">
                {ICONO[e.accion]}
                <span className="font-medium text-slate-800">{nombre(e.userId)}</span>
                <span>{LABEL[e.accion]}</span>
                {!compacto && (
                  <span className="text-slate-500">
                    <span className="font-mono text-[10.5px] bg-slate-100 rounded px-1">{e.tabla}</span>
                    {' '}<span className="font-medium text-slate-700" title={e.filaId}>{nombreFila(e)}</span>
                  </span>
                )}
                <span className="text-slate-400 ml-auto" title={new Date(e.at).toLocaleString('es-ES')}>{fechaRelativa(e.at)}</span>
              </div>
              {cambios.length > 0 && (
                <ul className="mt-1 ml-5 space-y-0.5">
                  {cambios.map(([campo, [a, b]]) => (
                    <li key={campo} className="text-[11px] text-slate-500 break-words">
                      <span className="font-mono text-slate-700">{campo}</span>: <span className="line-through text-slate-400">{valorCorto(a)}</span> → <span className="text-slate-800">{valorCorto(b)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      {cargando && <p className="text-xs text-slate-400 py-2">Cargando…</p>}
      {!fin && !cargando && items.length > 0 && (
        <button onClick={() => void cargar(items[items.length - 1].at)}
          className="mt-2 text-xs px-3 py-1.5 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">
          Cargar más
        </button>
      )}
    </div>
  )
}
