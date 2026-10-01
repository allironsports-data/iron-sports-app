// ── Tarjeta de Firmar, flotante ──────────────────────────────────────
//
// El mismo panel de detalle del pipeline, pero abierto encima de la
// pantalla en la que esté el usuario (tareas, calendario…) en vez de
// llevarle a Pipeline. Al cerrarlo sigue donde estaba.

import { useMemo, useState } from 'react'
import type { Player, ScoutingPlayer, ScoutingReport, FirmasEntry, FirmasStatus, FirmasComment } from '../../types'
import type { Profile } from '../../contexts/AuthContext'
import { ConfirmModal } from '../../components/ConfirmModal'
import { ToastStack } from '../../components/ToastStack'
import { useToast } from '../../hooks/useToast'
import { useAtras } from '../../hooks/useAtras'
import { ZONAS_PIPELINE } from '../../lib/zonas'
import type { PatchFirmasEntry } from '../captacion/helpers'
import { FIRMAS_CONFIG } from '../captacion/firmas/helpers'
import { FirmasDetailPanel } from '../captacion/firmas/FirmasDetailPanel'

export function FirmasFlotante({
  entryId, entries, profiles, currentProfile, scoutingPlayers, scoutingReports, players,
  onCreatePlayer, onPatch, onDelete, onOpenScoutingPlayer, onClose,
}: {
  entryId: string
  entries: FirmasEntry[]
  profiles: Profile[]
  currentProfile: Profile
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  players: Player[]
  onCreatePlayer: (p: Player) => Promise<Player>
  onPatch: PatchFirmasEntry
  onDelete: (id: string) => Promise<void>
  onOpenScoutingPlayer: (id: string) => void
  onClose: () => void
}) {
  const { toasts, showToast, dismissToast } = useToast()
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  // «Atrás» del navegador cierra la tarjeta en vez de sacarte de la pantalla
  useAtras(true, onClose, 'firmar-flotante')

  const entry = entries.find(e => e.id === entryId)
  const spById = useMemo(() => {
    const m: Record<string, ScoutingPlayer> = {}
    scoutingPlayers.forEach(p => { m[p.id] = p })
    return m
  }, [scoutingPlayers])
  // Solo hacen falta los informes del jugador de esta tarjeta
  const reportsByPlayer = useMemo(() => {
    const id = entry?.scoutingPlayerId
    if (!id) return {}
    const lista = scoutingReports.filter(r => r.playerId === id)
      .sort((a, b) => (b.fecha ?? b.createdAt).localeCompare(a.fecha ?? a.createdAt))
    return { [id]: lista } as Record<string, ScoutingReport[]>
  }, [scoutingReports, entry?.scoutingPlayerId])
  const zones = useMemo(() => {
    const presentes = [...new Set(entries.map(e => e.zone))]
    return [
      ...ZONAS_PIPELINE.filter(z => presentes.includes(z)),
      ...presentes.filter(z => !ZONAS_PIPELINE.includes(z)).sort((a, b) => a.localeCompare(b)),
    ]
  }, [entries])

  if (!entry) return null

  const patch: PatchFirmasEntry = async (id, changes) => {
    try {
      await onPatch(id, changes)
    } catch (err) {
      console.error(err)
      showToast('No se pudo guardar el cambio', 'error')
    }
  }

  // Igual que en el tablero: el cambio de estatus deja su apunte en el historial
  const changeStatus = async (e: FirmasEntry, s: FirmasStatus) => {
    const now = new Date().toISOString()
    const log: FirmasComment = {
      id: crypto.randomUUID(),
      text: `${FIRMAS_CONFIG[e.status].label} → ${FIRMAS_CONFIG[s].label}`,
      date: now,
      author: currentProfile.name,
      authorId: currentProfile.id,
      kind: 'estatus',
    }
    try {
      await onPatch(e.id, cur => ({
        ...cur,
        status: s,
        statusUpdatedAt: now,
        signedAt: s === 'firmado' ? (cur.signedAt ?? now) : cur.signedAt,
        comments: [...cur.comments, log],
      }))
      showToast(s === 'firmado' ? `🎉 ${e.playerName} firmado` : `${e.playerName} → ${FIRMAS_CONFIG[s].label}`)
    } catch (err) {
      console.error(err)
      showToast('No se pudo guardar el cambio', 'error')
    }
  }

  return (
    <>
      <FirmasDetailPanel
        key={entry.id}
        entry={entry}
        profiles={profiles}
        currentProfile={currentProfile}
        scoutingPlayers={scoutingPlayers}
        spById={spById}
        reportsByPlayer={reportsByPlayer}
        zones={zones}
        players={players}
        onCreatePlayer={onCreatePlayer}
        showToast={showToast}
        headerHeight={0}
        onClose={onClose}
        onPatch={patch}
        onChangeStatus={changeStatus}
        onOpenScoutingPlayer={onOpenScoutingPlayer}
        onRequestDelete={() => setConfirmarBorrado(true)}
      />
      <ConfirmModal
        open={confirmarBorrado}
        title="Eliminar jugador del pipeline"
        message={`¿Seguro que quieres eliminar a ${entry.playerName} del pipeline de firmas? Se perderá su historial.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={async () => {
          try {
            await onDelete(entry.id)
            onClose()
          } catch {
            setConfirmarBorrado(false)
            showToast('No se pudo eliminar', 'error')
          }
        }}
        onCancel={() => setConfirmarBorrado(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
