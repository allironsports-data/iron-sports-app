import { useCallback, useEffect, useState } from 'react'
import type { Profile } from '../contexts/AuthContext'
import type { Task, Player, ScoutingPlayer, ScoutingReport, ScoutingMatch, FirmasEntry } from '../types'
import { CaptacionStats } from './CaptacionStats'
import { updateProfile } from '../lib/db'
import { hoyISO, esVencida, parseDia } from '../lib/fechas'
import { supabase } from '../lib/supabase'
import { AUDIT_TABLAS } from '../lib/dbAudit'
import { HistorialCambios } from '../components/HistorialCambios'
import { fechaRelativa } from '../lib/formato'
import { fetchClientErrors, vaciarErroresAntiguos, type ClientError } from '../lib/dbErrors'
import { Shield, UserPlus, Check, X, Edit3, Copy, Trash2, KeyRound, AlertTriangle, BarChart3, Users, ChevronDown, ChevronRight, Clock, CheckCircle2, Circle, Eye, History, Bug, Search } from 'lucide-react'
import { DetailHeader } from '../components/shell'
import { SectionTabs, Button, IconButton, Field, Input, Select, Badge } from '../components/ui'
import { ConfirmModal } from '../components/ConfirmModal'
import { useToastContext } from '../hooks/useToastContext'
import { L, PRIORITY_LABELS } from '../lib/labels'


function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface Props {
  profiles: Profile[]
  tasks: Task[]
  players: Player[]
  scoutingPlayers: ScoutingPlayer[]
  scoutingReports: ScoutingReport[]
  scoutingMatches: ScoutingMatch[]
  firmasEntries: FirmasEntry[]
  onBack: () => void
  onRefresh: () => Promise<void>
  onOpenTable?: () => void
}

type AdminTab = 'equipo' | 'tareas' | 'captacion' | 'historial' | 'errores'

export function AdminPanel({ profiles, tasks, players, scoutingPlayers, scoutingReports, scoutingMatches, firmasEntries, onBack, onRefresh, onOpenTable }: Props) {
  const [tab, setTab] = useState<AdminTab>('equipo')

  const tabs = [
    { id: 'equipo' as const, label: L.equipo, icon: <Users /> },
    { id: 'tareas' as const, label: 'Seguimiento', icon: <BarChart3 /> },
    { id: 'captacion' as const, label: `Stats ${L.captacion}`, icon: <Eye /> },
    { id: 'historial' as const, label: 'Historial', icon: <History /> },
    { id: 'errores' as const, label: 'Errores', icon: <Bug /> },
  ]

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Pantalla admin sin nivel 1 propio: DetailHeader con atrás */}
      <DetailHeader onBack={onBack} title="Administración" subtitle="Gestión del equipo y seguimiento" />
      <SectionTabs<AdminTab>
        variant="secondary"
        label="Secciones de administración"
        className="sticky top-[var(--shell-h)] z-20 bg-white border-b border-slate-200 px-4 [&>div]:mx-auto [&>div]:max-w-5xl"
        items={tabs}
        value={tab}
        onChange={setTab}
      />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'equipo' && <TeamTab profiles={profiles} players={players} onRefresh={onRefresh} onOpenTable={onOpenTable} />}
        {tab === 'tareas' && <TaskTrackingTab profiles={profiles} tasks={tasks} players={players} />}
        {tab === 'captacion' && (
          <CaptacionStats
            scoutingPlayers={scoutingPlayers}
            scoutingReports={scoutingReports}
            scoutingMatches={scoutingMatches}
            firmasEntries={firmasEntries}
            profiles={profiles}
          />
        )}
        {tab === 'historial' && <HistorialTab profiles={profiles} />}
        {tab === 'errores' && <ErroresTab profiles={profiles} />}
      </main>
    </div>
  )
}

/* ========== TEAM TAB ========== */
function TeamTab({ profiles, players, onRefresh, onOpenTable }: { profiles: Profile[]; players: Player[]; onRefresh: () => Promise<void>; onOpenTable?: () => void }) {
  const { showToast } = useToastContext()
  const ERROR_GUARDAR = 'No se pudo guardar. Inténtalo de nuevo.'
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteAvatar, setInviteAvatar] = useState('')
  const [tempPassword, setTempPassword] = useState(() => generatePassword())
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [inviteError, setInviteError] = useState('')
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState('')
  const [resetId, setResetId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetStatus, setResetStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteStatus('sending')
    try {
      const avatar = inviteAvatar || inviteName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3)
      // Edge Function con service role: así el admin no pierde su sesión
      // (signUp con «Confirm email» desactivado lo dejaba logueado como el nuevo)
      const { data, error } = await supabase.functions.invoke<{ id?: string; error?: string }>('crear-usuario', {
        body: { email: inviteEmail, password: tempPassword, name: inviteName, avatar },
      })
      if (error) {
        // El cuerpo de error de la función viene dentro de context
        const ctx = (error as { context?: Response }).context
        let detalle = ''
        try { detalle = ctx ? ((await ctx.json()) as { error?: string }).error ?? '' : '' } catch { /* sin cuerpo */ }
        throw new Error(detalle || 'No se ha podido llamar a la función crear-usuario. ¿Está desplegada?')
      }
      if (data?.error) throw new Error(data.error)
      if (!data?.id) throw new Error('La función no ha devuelto el id del usuario')
      setCreatedInfo({ email: inviteEmail, password: tempPassword })
      setInviteStatus('ok')
      setInviteEmail('')
      setInviteName('')
      setInviteAvatar('')
      setTempPassword(generatePassword())
      await onRefresh()
    } catch (err: unknown) {
      console.error(err)
      setInviteError(err instanceof Error ? err.message : 'Error al crear el usuario')
      setInviteStatus('error')
      setTimeout(() => setInviteStatus('idle'), 6000)
    }
  }

  const handleCopy = () => {
    if (!createdInfo) return
    navigator.clipboard.writeText(`URL: https://allironsports.vercel.app\nEmail: ${createdInfo.email}\nContraseña: ${createdInfo.password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleResetPassword = async (profileId: string) => {
    if (!newPassword || newPassword.length < 6) return
    setResetStatus('saving')
    try {
      const { error } = await supabase.rpc('update_user_password', { target_user_id: profileId, new_password: newPassword })
      if (error) throw error
      setResetStatus('ok')
      setTimeout(() => { setResetStatus('idle'); setResetId(null); setNewPassword('') }, 2000)
    } catch {
      setResetStatus('error')
      showToast('No se pudo cambiar la contraseña.', 'error')
      setTimeout(() => setResetStatus('idle'), 3000)
    }
  }

  const handleDeleteUser = async (p: Profile) => {
    try {
      const { error } = await supabase.rpc('delete_user', { target_user_id: p.id })
      if (error) throw error
      setDeleteId(null)
      await onRefresh()
      showToast(`${p.name} eliminado`, 'info')
    } catch {
      showToast('No se pudo eliminar el usuario. Inténtalo de nuevo.', 'error')
    }
  }

  const handleToggleAdmin = async (p: Profile) => {
    try {
      await updateProfile(p.id, { is_admin: !p.is_admin })
      await onRefresh()
    } catch { showToast(ERROR_GUARDAR, 'error') }
  }

  /**
   * Activar / desactivar la cuenta. Mientras está desactivada, la base de
   * datos no le entrega NADA: no es que la app se lo esconda, es que no se
   * lo da. Así, quien se registre por su cuenta no ve nada hasta que un
   * admin lo apruebe.
   */
  const handleToggleActivo = async (p: Profile) => {
    try {
      await updateProfile(p.id, { activo: p.activo === false })
      await onRefresh()
    } catch { showToast(ERROR_GUARDAR, 'error') }
  }

  /** Cuenta restringida: solo ve Captación (Jugadores, Partidos e Informes) */
  const handleToggleCaptacionOnly = async (p: Profile) => {
    try {
      await updateProfile(p.id, { captacion_only: !p.captacion_only })
      await onRefresh()
    } catch { showToast(ERROR_GUARDAR, 'error') }
  }

  const handleSaveEdit = async (id: string) => {
    try {
      await updateProfile(id, { name: editName, avatar: editAvatar })
      await onRefresh()
      setEditingId(null)
    } catch { showToast(ERROR_GUARDAR, 'error') }
  }

  return (
    <div className="space-y-6">
      {/* Create new member */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Añadir miembro del equipo
        </h2>

        {inviteStatus === 'ok' && createdInfo && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">Usuario creado. Comparte estos datos:</span>
            </div>
            <div className="bg-white rounded border border-emerald-100 px-3 py-2 text-sm font-mono text-slate-700 mb-2">
              <div>Email: <strong>{createdInfo.email}</strong></div>
              <div>Contraseña: <strong>{createdInfo.password}</strong></div>
              <div className="text-meta text-slate-500 mt-1">allironsports.vercel.app</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 mb-2">
              La cuenta nace <strong>pendiente</strong>: hasta que la actives en la lista
              de abajo no podrá ver nada. Es lo que impide que un desconocido se
              registre y entre.
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="link" icon={<Copy />} onClick={handleCopy} className="text-emerald-700">
                {copied ? '¡Copiado!' : 'Copiar al portapapeles'}
              </Button>
              <Button size="sm" variant="link" onClick={() => { setCreatedInfo(null); setInviteStatus('idle') }} className="text-slate-600">
                Añadir otro
              </Button>
            </div>
          </div>
        )}

        {inviteStatus !== 'ok' && (
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email" required>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="nombre@email.com" />
              </Field>
              <Field label="Nombre completo" required>
                <Input type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required placeholder="Nombre Apellido" />
              </Field>
              <Field label="Siglas (avatar)">
                <Input type="text" value={inviteAvatar} onChange={(e) => setInviteAvatar(e.target.value.toUpperCase().slice(0, 3))} placeholder="Auto (iniciales)" maxLength={3} />
              </Field>
              <Field label="Contraseña temporal" required>
                {(fp) => (
                  <div className="flex gap-2">
                    <Input {...fp} type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} required className="font-mono" />
                    <Button onClick={() => setTempPassword(generatePassword())} className="whitespace-nowrap">Nueva</Button>
                  </div>
                )}
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" loading={inviteStatus === 'sending'}>
                {inviteStatus === 'sending' ? 'Creando…' : 'Crear usuario'}
              </Button>
              {inviteStatus === 'error' && (
                <span className="text-secondary text-red-600" role="alert">{inviteError || 'Error al crear el usuario.'}</span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Team members */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Miembros del equipo ({profiles.length})</h2>
        </div>
        {profiles.length === 0 && (
          <p className="text-body text-slate-500 text-center py-8">Sin miembros aún.</p>
        )}
        <div className="divide-y divide-slate-100">
          {profiles.map((p) => {
            const managedCount = players.filter(pl => pl.managedBy.includes(p.id)).length
            return (
              <div key={p.id} className="px-4 sm:px-5 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div aria-hidden="true" className="w-9 h-9 rounded-full text-white text-badge font-bold flex items-center justify-center flex-shrink-0 bg-primary"
                   >{p.avatar}</div>

                  {editingId === p.id ? (
                    <form onSubmit={e => { e.preventDefault(); void handleSaveEdit(p.id) }} className="flex items-center gap-2 flex-1 flex-wrap">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Nombre" className="w-44 py-1" />
                      <Input value={editAvatar} onChange={(e) => setEditAvatar(e.target.value.toUpperCase().slice(0, 3))} aria-label="Siglas" className="w-20 py-1" maxLength={3} />
                      <IconButton label={L.guardar} type="submit" className="text-emerald-600 hover:text-emerald-700"><Check /></IconButton>
                      <IconButton label={L.cancelar} onClick={() => setEditingId(null)}><X /></IconButton>
                    </form>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-body font-medium text-slate-800 truncate">{p.name}</span>
                        {p.is_admin && (
                          <Badge tone="primary" pill={false}><Shield className="w-3 h-3" aria-hidden="true" /> Admin</Badge>
                        )}
                        {p.activo === false && (
                          <Badge tone="warning" pill={false}>Pendiente</Badge>
                        )}
                      </div>
                      <p className="text-secondary text-slate-500">{managedCount} jugador{managedCount !== 1 ? 'es' : ''}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-1 sm:gap-1.5 ml-auto flex-wrap justify-end">
                    <IconButton label={`Editar a ${p.name}`} onClick={() => { setEditingId(p.id); setEditName(p.name); setEditAvatar(p.avatar) }}>
                      <Edit3 />
                    </IconButton>
                    <IconButton label={`Cambiar contraseña de ${p.name}`} onClick={() => { setResetId(resetId === p.id ? null : p.id); setNewPassword(generatePassword()) }} className="hover:text-amber-600">
                      <KeyRound />
                    </IconButton>
                    <IconButton label={`Eliminar a ${p.name}`} onClick={() => setDeleteId(p.id)} className="hover:text-red-600">
                      <Trash2 />
                    </IconButton>
                    <Button size="sm" onClick={() => handleToggleActivo(p)}
                      aria-pressed={p.activo !== false}
                      icon={p.activo === false ? undefined : <Check />}
                      title={p.activo === false
                        ? 'La cuenta no recibe ningún dato de la base de datos — clic para darle acceso'
                        : 'Cortar el acceso de esta cuenta sin borrarla'}
                      className={p.activo === false
                          ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold'
                          : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}>
                      {p.activo === false ? 'Activar' : 'Activa'}
                    </Button>
                    <Button size="sm" onClick={() => handleToggleAdmin(p)}
                      className={p.is_admin ? 'border-blue-200 text-blue-700 hover:bg-blue-50' : undefined}>
                      {p.is_admin ? 'Quitar admin' : 'Hacer admin'}
                    </Button>
                    <Button size="sm" onClick={() => handleToggleCaptacionOnly(p)}
                      aria-pressed={!!p.captacion_only}
                      icon={p.captacion_only ? <Eye /> : undefined}
                      title={p.captacion_only
                        ? 'Ahora solo ve Captación (Jugadores, Partidos e Informes) — clic para darle acceso completo'
                        : 'Restringir esta cuenta a Captación: solo Jugadores, Partidos e Informes'}
                      className={p.captacion_only ? 'border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100' : undefined}>
                      Solo {L.captacion}
                    </Button>
                  </div>
                </div>

                {/* Reset password */}
                {resetId === p.id && (
                  <form onSubmit={e => { e.preventDefault(); void handleResetPassword(p.id) }}
                    className="mt-2 ml-0 sm:ml-12 flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                      aria-label="Nueva contraseña" className="flex-1 w-auto border-amber-200 py-1 font-mono" placeholder="Nueva contraseña" />
                    <Button type="submit" size="sm" variant="primary" loading={resetStatus === 'saving'}
                      icon={resetStatus === 'ok' ? <Check /> : undefined}
                      className="bg-amber-500 hover:bg-amber-600 disabled:hover:bg-amber-500">
                      {resetStatus === 'ok' ? 'Guardada' : L.guardar}
                    </Button>
                    <IconButton label={L.cancelar} onClick={() => setResetId(null)}><X /></IconButton>
                    {resetStatus === 'error' && <span className="text-secondary text-red-600" role="alert">Error — usa Supabase Auth</span>}
                  </form>
                )}

              </div>
            )
          })}
        </div>
      </div>

      {onOpenTable && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-800">Tabla de jugadores</h2>
              <p className="text-secondary text-slate-500 mt-0.5">Edición rápida de datos de jugadores</p>
            </div>
            <Button variant="primary" onClick={onOpenTable}>Abrir tabla</Button>
          </div>
        </div>
      )}

      {/* Confirmación de borrado de usuario */}
      <ConfirmModal
        open={!!deleteId}
        title={`¿Eliminar a ${profiles.find(p => p.id === deleteId)?.name ?? ''}?`}
        message="Esta acción no se puede deshacer."
        confirmLabel={L.eliminar}
        variant="danger"
        onConfirm={async () => { const p = profiles.find(x => x.id === deleteId); if (p) await handleDeleteUser(p) }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

/* ========== HISTORIAL TAB ========== */
function HistorialTab({ profiles }: { profiles: Profile[] }) {
  const [tabla, setTabla] = useState('')
  const [filaInput, setFilaInput] = useState('')
  const [filaId, setFilaId] = useState('')

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><History className="w-4 h-4" /> Historial de cambios</h2>
        <p className="text-secondary text-slate-500 mt-0.5">Quién cambió qué en jugadores, clubes, negociaciones, firmas, scouting y tareas. Lo apunta la base de datos, no la app.</p>
        <form onSubmit={e => { e.preventDefault(); setFilaId(filaInput.trim()) }} className="mt-3 flex items-center gap-2 flex-wrap">
          <Select value={tabla} onChange={e => setTabla(e.target.value)} aria-label="Tabla" className="w-auto">
            <option value="">Todas las tablas</option>
            {AUDIT_TABLAS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <div className="flex items-center gap-1 flex-1 min-w-[200px]">
            <Input value={filaInput} onChange={e => setFilaInput(e.target.value)} placeholder="Buscar por id de fila (uuid)" aria-label="Id de fila" className="flex-1 font-mono" />
            <IconButton label={L.buscar} type="submit" variant="secondary" size="md"><Search /></IconButton>
            {filaId && <Button variant="link" size="sm" onClick={() => { setFilaId(''); setFilaInput('') }}>Quitar</Button>}
          </div>
        </form>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-2">
        <HistorialCambios tabla={tabla || undefined} filaId={filaId || undefined} profiles={profiles} />
      </div>
    </div>
  )
}

/* ========== ERRORES TAB ========== */
function ErroresTab({ profiles }: { profiles: Profile[] }) {
  const [confirmVaciar, setConfirmVaciar] = useState(false)
  const [items, setItems] = useState<ClientError[]>([])
  const [cargando, setCargando] = useState(false)
  const [fin, setFin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [vaciando, setVaciando] = useState(false)
  const LIMIT = 100

  const cargar = useCallback(async (before?: string) => {
    setCargando(true)
    setError(null)
    try {
      const page = await fetchClientErrors({ limit: LIMIT, before })
      setItems(prev => (before ? [...prev, ...page] : page))
      setFin(page.length < LIMIT)
    } catch (e) {
      const code = (e as { code?: string } | null)?.code
      setError(code === '42P01' ? 'El registro de errores aún no está activado (falta ejecutar migration_client_errors.sql).' : 'No se han podido cargar los errores.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const vaciar = async () => {
    setConfirmVaciar(false)
    setVaciando(true)
    try { await vaciarErroresAntiguos(30); await cargar() } catch { setError('No se han podido borrar.') } finally { setVaciando(false) }
  }

  const nombre = (uid: string | null) => {
    if (!uid) return '—'
    return profiles.find(p => p.id === uid)?.name ?? uid.slice(0, 8)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Bug className="w-4 h-4" /> Errores del cliente</h2>
          <p className="text-secondary text-slate-500 mt-0.5">Fallos que han saltado en el navegador de alguien del equipo (pantalla rota, promesas sin capturar). Máx. 5 por minuto y usuario.</p>
        </div>
        <Button size="sm" icon={<Trash2 />} loading={vaciando} onClick={() => setConfirmVaciar(true)}>
          {vaciando ? 'Borrando…' : 'Vaciar antiguos (>30 días)'}
        </Button>
      </div>
      <ConfirmModal
        open={confirmVaciar}
        title="¿Borrar los errores de hace más de 30 días?"
        message="Se eliminan del registro. No se puede deshacer."
        confirmLabel="Borrar"
        variant="danger"
        onConfirm={vaciar}
        onCancel={() => setConfirmVaciar(false)}
      />
      {error && <p className="text-secondary text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {items.length === 0 && !cargando && !error && <p className="text-secondary text-slate-500 text-center py-8">Sin errores registrados. 🎉</p>}
        <div className="divide-y divide-slate-100">
          {items.map(e => (
            <div key={e.id} className="px-4 py-2.5 text-secondary">
              <button type="button" aria-expanded={abierto === e.id} onClick={() => setAbierto(abierto === e.id ? null : e.id)} className="w-full text-left rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <div className="flex items-center gap-2 flex-wrap text-slate-500">
                  <span className="text-slate-500 w-20 flex-shrink-0" title={new Date(e.at).toLocaleString('es-ES')}>{fechaRelativa(e.at)}</span>
                  <span className="font-medium text-slate-700">{nombre(e.userId)}</span>
                  {e.buildId && <span className="font-mono text-badge bg-slate-100 rounded px-1">{e.buildId}</span>}
                  {e.ruta && <span className="font-mono text-badge text-slate-500 truncate max-w-[200px]">{e.ruta}</span>}
                  {abierto === e.id ? <ChevronDown className="w-3.5 h-3.5 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                </div>
                <div className="mt-0.5 text-slate-800 break-words">{e.mensaje}</div>
              </button>
              {abierto === e.id && (
                <div className="mt-2 space-y-1.5">
                  {e.contexto && <pre className="text-badge text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(e.contexto, null, 1)}</pre>}
                  <pre className="text-badge text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">{e.stack ?? '(sin stack)'}</pre>
                  {e.userAgent && <p className="text-badge text-slate-500 break-words">{e.userAgent}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
        {cargando && <p className="text-secondary text-slate-500 px-4 py-2">Cargando…</p>}
        {!fin && !cargando && items.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100">
            <Button size="sm" onClick={() => void cargar(items[items.length - 1].at)}>Cargar más</Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ========== TASK TRACKING TAB ========== */
function TaskTrackingTab({ profiles, tasks, players }: { profiles: Profile[]; tasks: Task[]; players: Player[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'overdue'>('all')
  // Día como texto: new Date('AAAA-MM-DD') es UTC y marcaba vencida la tarea que vence hoy
  const hoy = hoyISO()

  const toggleExpand = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const expandAll = () => setExpandedIds(new Set(profiles.map(p => p.id)))
  const collapseAll = () => setExpandedIds(new Set())

  function taskStatusIcon(t: Task) {
    if (t.status === 'completada') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
    if (t.status === 'en_progreso') return <Clock className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
    return <Circle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryBox label="Total tareas" value={tasks.length} color="blue" />
        <SummaryBox label="Completadas" value={tasks.filter(t => t.status === 'completada').length} color="green" />
        <SummaryBox label="En progreso" value={tasks.filter(t => t.status === 'en_progreso').length} color="violet" />
        <SummaryBox label="Vencidas" value={tasks.filter(t => t.status !== 'completada' && esVencida(t.dueDate, hoy)).length} color="red" />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'overdue')}
          aria-label="Filtro de estado"
          className="w-auto"
        >
          <option value="all">Todas las tareas</option>
          <option value="active">Activas</option>
          <option value="overdue">Vencidas</option>
        </Select>
        <div className="flex items-center gap-2">
          <Button variant="link" size="sm" onClick={expandAll} className="text-slate-600">Expandir todo</Button>
          <Button variant="link" size="sm" onClick={collapseAll} className="text-slate-600">Colapsar todo</Button>
        </div>
      </div>

      {/* Per-user cards */}
      <div className="space-y-3">
        {profiles.map(p => {
          const assigned = tasks.filter(t => t.assigneeId === p.id)
          const completed = assigned.filter(t => t.status === 'completada')
          const inProgress = assigned.filter(t => t.status === 'en_progreso')
          const pending = assigned.filter(t => t.status !== 'completada')
          const overdue = pending.filter(t => esVencida(t.dueDate, hoy))
          const managedCount = players.filter(pl => pl.managedBy.includes(p.id)).length
          const isExpanded = expandedIds.has(p.id)

          // Apply filter to task list
          const visibleTasks = assigned.filter(t => {
            if (statusFilter === 'active') return t.status !== 'completada'
            if (statusFilter === 'overdue') return t.status !== 'completada' && esVencida(t.dueDate, hoy)
            return true
          }).sort((a, b) => {
            // Sort: overdue first, then in-progress, then pending, then done
            const score = (t: Task) => {
              if (t.status === 'completada') return 3
              if (esVencida(t.dueDate, hoy)) return 0
              if (t.status === 'en_progreso') return 1
              return 2
            }
            return score(a) - score(b)
          })

          return (
            <div key={p.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {/* Card header */}
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleExpand(p.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
              >
                <div aria-hidden="true" className="w-9 h-9 rounded-full text-white text-badge font-bold flex items-center justify-center flex-shrink-0 bg-primary">{p.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                    {overdue.length > 0 && (
                      <Badge tone="danger"><AlertTriangle className="w-3 h-3" aria-hidden="true" /> {overdue.length} vencida{overdue.length !== 1 ? 's' : ''}</Badge>
                    )}
                  </div>
                  <p className="text-secondary text-slate-500">{managedCount} jugador{managedCount !== 1 ? 'es' : ''} · {assigned.length} tarea{assigned.length !== 1 ? 's' : ''}</p>
                </div>
                {/* Mini progress bar */}
                {assigned.length > 0 && (
                  <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0 w-28">
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${(completed.length / assigned.length) * 100}%` }} />
                    </div>
                    <span className="text-meta text-slate-500">{Math.round((completed.length / assigned.length) * 100)}% hecho</span>
                  </div>
                )}
                {/* Stats pills */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge tone="success" pill={false} title="Completadas"><CheckCircle2 className="w-3 h-3" aria-hidden="true" />{completed.length}</Badge>
                  {inProgress.length > 0 && <Badge tone="primary" pill={false} title="En progreso"><Clock className="w-3 h-3" aria-hidden="true" />{inProgress.length}</Badge>}
                  {pending.length > 0 && <Badge tone="warning" pill={false} title="Pendientes"><Circle className="w-3 h-3" aria-hidden="true" />{pending.filter(t => t.status === 'pendiente').length}</Badge>}
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" aria-hidden="true" />}
              </button>

              {/* Task list */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {visibleTasks.length === 0 ? (
                    <p className="text-secondary text-slate-500 text-center py-4">Sin tareas con este filtro</p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {visibleTasks.map(t => {
                        const playerName = players.find(pl => pl.id === t.playerId)?.name ?? '—'
                        const isOverdue = t.status !== 'completada' && esVencida(t.dueDate, hoy)
                        return (
                          <div key={t.id} className={`flex items-start gap-2.5 px-4 py-2.5 ${t.status === 'completada' ? 'opacity-50' : ''}`}>
                            {taskStatusIcon(t)}
                            <div className="flex-1 min-w-0">
                              <div className="text-body font-medium text-slate-800 truncate">{t.title}</div>
                              <div className="flex items-center gap-2 mt-0.5 text-meta text-slate-500 flex-wrap">
                                <span className="truncate">{playerName}</span>
                                {t.priority === 'alta' && <span className="text-red-600 font-semibold">{PRIORITY_LABELS.alta}</span>}
                                {t.dueDate && (
                                  <span className={`inline-flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
                                    {isOverdue && <AlertTriangle className="w-3 h-3" aria-label="Vencida" />}{parseDia(t.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`text-badge px-1.5 py-0.5 rounded flex-shrink-0 ${
                              t.status === 'completada' ? 'bg-emerald-50 text-emerald-600' :
                              t.status === 'en_progreso' ? 'bg-violet-50 text-violet-600' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {t.status === 'completada' ? 'Hecha' : t.status === 'en_progreso' ? 'En curso' : 'Pendiente'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SummaryBox({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    violet: 'bg-violet-50 text-violet-700',
  }
  return (
    <div className={`rounded-lg p-3 ${colors[color] || colors.blue}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-badge font-medium opacity-80 uppercase tracking-wide">{label}</p>
    </div>
  )
}
