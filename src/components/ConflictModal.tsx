import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { camposDistintos, type ConflictInfo } from './conflict'
import { Button, Dialog } from './ui'

const NOMBRE_TABLA: Record<string, string> = {
  players: 'jugador', clubs: 'club', club_negotiations: 'negociación',
}

/** Valor a texto corto para la lista de diferencias */
function corto(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—'
  let s: string
  if (typeof v === 'string') s = v
  else if (Array.isArray(v)) s = v.length === 0 ? '—' : v.map(x => (typeof x === 'object' && x ? JSON.stringify(x) : String(x))).join(', ')
  else if (typeof v === 'object') s = JSON.stringify(v)
  else s = String(v)
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > 60 ? s.slice(0, 57) + '…' : s
}

interface Props {
  conflict: ConflictInfo | null
  /** «Recargar»: aplicar lo suyo y descartar lo mío */
  onRecargar: () => void
  /** «Sobrescribir»: reintentar el guardado con el updated_at de lo suyo */
  onSobrescribir: () => Promise<void>
}

/**
 * Modal «Otro usuario ha modificado esta ficha». Sale en cualquier vista
 * (lo monta App.tsx junto a los extras globales). No se puede cerrar con
 * ESC ni clic fuera: hay una promesa de guardado esperando la decisión.
 */
export function ConflictModal({ conflict, onRecargar, onSobrescribir }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al cambiar el conflicto se resetea busy/error (patrón «prop anterior», sin efecto)
  const [prevConflict, setPrevConflict] = useState(conflict)
  if (conflict !== prevConflict) { setPrevConflict(conflict); setBusy(false); setError(null) }

  if (!conflict) return null
  const difs = camposDistintos(conflict.mio, conflict.suyo)
  const que = NOMBRE_TABLA[conflict.tabla] ?? 'ficha'

  const sobrescribir = async () => {
    setBusy(true); setError(null)
    try {
      await onSobrescribir()
    } catch (e) {
      // El reintento puede volver a chocar (otro guardado más) o fallar la red.
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { /* no se puede cerrar: hay un guardado esperando la decisión */ }}
      title="Otro usuario ha modificado esta ficha"
      description={`Alguien ha guardado este ${que} mientras lo editabas. Si sobrescribes, sus cambios se pierden; si recargas, se pierden los tuyos.`}
      closeOnBackdrop={false}
      hideClose
      mobile="center"
      historyKey="conflicto"
      className="z-[9998]"
      footer={
        <>
          <Button onClick={onRecargar} disabled={busy} className="mr-auto">
            Recargar (perder mis cambios)
          </Button>
          <Button onClick={sobrescribir} loading={busy} className="bg-amber-600 text-white border-amber-600 hover:bg-amber-700">
            Sobrescribir
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          {difs.length > 0 ? (
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 text-secondary">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-600 text-meta uppercase">
                  <tr>
                    <th className="text-left px-2 py-1 font-medium">Campo</th>
                    <th className="text-left px-2 py-1 font-medium">Lo mío</th>
                    <th className="text-left px-2 py-1 font-medium">Lo suyo</th>
                  </tr>
                </thead>
                <tbody>
                  {difs.map(k => (
                    <tr key={k} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">{k}</td>
                      <td className="px-2 py-1 text-slate-600 break-words">{corto(conflict.mio[k])}</td>
                      <td className="px-2 py-1 text-slate-600 break-words">{corto(conflict.suyo[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-secondary text-slate-600">Los datos visibles coinciden; solo difiere la fecha de modificación.</p>
          )}
          {error && <p className="mt-3 text-secondary text-rose-600" role="alert">{error}</p>}
        </div>
      </div>
    </Dialog>
  )
}
