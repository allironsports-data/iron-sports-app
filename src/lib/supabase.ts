import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ── Indicador global de guardado ─────────────────────────────
// Envolvemos fetch para contar las peticiones de escritura en vuelo:
// el puntito "guardando… / guardado ✓" del header se alimenta de aquí.
type SavingListener = (inflight: number) => void
const savingListeners = new Set<SavingListener>()
let savingInflight = 0

export function onSavingChange(cb: SavingListener): () => void {
  savingListeners.add(cb)
  cb(savingInflight)
  return () => { savingListeners.delete(cb) }
}

function emitSaving() {
  savingListeners.forEach(cb => cb(savingInflight))
}

const trackedFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase()
  const track = method !== 'GET' && method !== 'HEAD'
  if (track) { savingInflight++; emitSaving() }
  return fetch(input, init).finally(() => {
    if (track) { savingInflight--; emitSaving() }
  })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: trackedFetch },
})
