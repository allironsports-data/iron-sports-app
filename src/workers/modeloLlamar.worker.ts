// ── Worker: entrena el modelo «Llamar» fuera del hilo principal ──────
// Protocolo: recibe {reports} y responde {progress} varias veces y al
// final {result}. Si algo revienta, responde {error}.

import { buildModel, type ModelOutput } from '../lib/modeloLlamar'
import type { ScoutingReport } from '../types'

export interface WorkerIn { reports: ScoutingReport[] }
export type WorkerOut =
  | { progress: string }
  | { result: ModelOutput }
  | { error: string }

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const post = (m: WorkerOut) => self.postMessage(m)
  try {
    const result = buildModel(e.data.reports, msg => post({ progress: msg }))
    post({ result })
  } catch (err) {
    post({ error: err instanceof Error ? err.message : String(err) })
  }
}
