// ── Inicio (Home) ────────────────────────────────────────────────────
//
// La primera pantalla al entrar. Arriba, el día de quien mira: agenda,
// partidos del equipo, para hacer y en curso (los mismos datos que Mi día,
// resumidos). Debajo, «Ir a»: un acceso por cada parte de la app, con un
// dato al lado solo cuando aporta. Diseño aséptico: blanco, gris y el azul
// de la app como único acento; el rojo solo para lo que pide atención.
//
// No cambia estado: cada fila abre su pantalla (App decide cuál). Lo único
// que crea es la tarea de la alta rápida.

import { useMemo, useState, type ComponentType } from 'react'
import {
  Home, Eye, PenLine, TrendingUp, CalendarDays, Shield, Users, Calendar,
  Trophy, ListTodo, RefreshCw, Handshake, Phone, Smartphone, ClipboardList, Plane, Search, Plus, ChevronRight, LogOut, Inbox,
} from 'lucide-react'
import logoImg from '../assets/logo.jpeg'
import type { Profile } from '../contexts/AuthContext'
import type { MemberStatus } from '../types'
import { itemEsDe, seccionesDelDia, DIAS_ACTUALIZACION_PROCESO, type AgendaItem, type AgendaTipo } from '../lib/agendaItems'
import { ACCESOS, fraseDelDia, partidosDeHoy, type Contador, type DestinoInicio } from '../lib/inicio'
import { parsearAltaRapida, type AltaRapida } from '../lib/altaRapida'
import { parseDia } from '../lib/fechas'

type Icono = ComponentType<{ className?: string }>
const ICONO_ACCESO: Record<string, Icono> = {
  home: Home, eye: Eye, 'pen-line': PenLine, 'trending-up': TrendingUp, shield: Shield,
  'calendar-days': CalendarDays, users: Users, 'clipboard-list': ClipboardList, calendar: Calendar, inbox: Inbox,
}
const ICONO_TIPO: Record<AgendaTipo, Icono> = {
  tarea: ListTodo, llamada: Phone, telefono: Smartphone, reunion: Handshake, postpartido: ClipboardList,
  partido: Trophy, evento: CalendarDays, viaje: Plane,
}

export interface InicioProps {
  profile: Profile
  profiles: Profile[]
  /** AAAA-MM-DD local */
  hoy: string
  /** Agenda de TODO el equipo para hoy (lib/agendaItems); aquí se filtra lo de cada uno */
  items: AgendaItem[]
  /** Estado de hoy de quien mira (Oficina, Viaje…), si lo ha puesto */
  miEstado?: MemberStatus
  contadores: Record<string, Contador>
  onAbrir: (item: AgendaItem) => void
  onIr: (destino: DestinoInicio) => void
  onCrear: (alta: AltaRapida) => Promise<void>
  onBuscar: () => void
  onLogout: () => void
  onAdmin?: () => void
}

const NAV1 = 'flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors'
const CARD = 'bg-white border border-slate-200 rounded-xl'
const ROW = 'flex items-center gap-2.5 px-3.5 py-2 border-t border-slate-100 hover:bg-slate-50 cursor-pointer text-left w-full'

/** Silueta de África: Boulema es el proyecto africano, y no hay icono de serie */
function Africa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8.2 2.6 11.5 2l3.4.6 1.9 1.5-.3 2.6 2.1 2.4 1.6 2.8-.6 1.6-2.2.8-1.3 3.4-1.1 3.6-1.9 1.7-1.4-1.6-.9-3.8-2.3-2.1-1.6-2.6-1.8-.7L4 9.4l.7-2.6L7 4.1z" />
      <path d="M18.1 13.3l1.6-.4.5 1.3-.9 2.9-1.3.4-.6-1.1z" opacity=".9" />
    </svg>
  )
}

function IconoAcceso({ nombre }: { nombre: string }) {
  const I = nombre === 'africa' ? Africa : (ICONO_ACCESO[nombre] ?? Home)
  return <span className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 inline-flex items-center justify-center flex-shrink-0"><I className="w-[19px] h-[19px]" /></span>
}

/** Un recuadro de acceso: icono, nombre, descripción, dato al lado (si aporta) y flecha */
function Recuadro({ icono, nombre, desc, contador, onClick }: { icono: string; nombre: string; desc: string; contador?: Contador; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`${CARD} w-full flex items-center gap-3.5 px-4 py-4 text-left hover:border-slate-300 hover:bg-slate-50/60 transition-colors`}>
      <IconoAcceso nombre={icono} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-slate-900 truncate">{nombre}</div>
        <div className="text-[12.5px] text-slate-500 truncate">{desc}</div>
      </div>
      {contador && <span className={`text-[11px] font-semibold whitespace-nowrap ${contador.alerta ? 'text-red-700' : 'text-slate-500'}`}>{contador.texto}</span>}
      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </button>
  )
}

function IconoTipo({ tipo }: { tipo: AgendaTipo }) {
  const I = ICONO_TIPO[tipo]
  return <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 inline-flex items-center justify-center flex-shrink-0"><I className="w-3.5 h-3.5" /></span>
}

function Bloque({ titulo, Icon, extra, children }: { titulo: string; Icon: Icono; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={CARD}>
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{titulo}</h3>
        {extra}
      </div>
      {children}
      <div className="h-1.5" />
    </section>
  )
}

const Vacio = ({ texto }: { texto: string }) => <p className="px-3.5 py-3 text-xs text-slate-400 border-t border-slate-100">{texto}</p>
const Enlace = ({ texto, onClick }: { texto: string; onClick: () => void }) => (
  <button onClick={onClick} className="ml-auto text-[11.5px] font-semibold text-primary hover:underline">{texto} →</button>
)

export function Inicio({ profile, profiles, hoy, items, miEstado, contadores, onAbrir, onIr, onCrear, onBuscar, onLogout, onAdmin }: InicioProps) {
  const mios = useMemo(() => items.filter(it => itemEsDe(it, profile.id)), [items, profile.id])
  const s = useMemo(() => seccionesDelDia(mios, hoy), [mios, hoy])
  const avatarDe = (id: string) => profiles.find(p => p.id === id)?.avatar
  const partidos = useMemo(() => partidosDeHoy(items, hoy, avatarDe), [items, hoy, profiles]) // eslint-disable-line react-hooks/exhaustive-deps
  const frase = fraseDelDia(s)

  // Alta rápida (misma sintaxis que en Mi día: @persona #categoría fecha !)
  const [nueva, setNueva] = useState('')
  const [creando, setCreando] = useState(false)
  const alta = useMemo(() => parsearAltaRapida(nueva, { hoy, profiles }), [nueva, hoy, profiles])
  async function crear() {
    if (!alta.titulo || creando) return
    setCreando(true)
    try { await onCrear(alta); setNueva('') } catch { /* quien crea avisa; el texto se queda */ } finally { setCreando(false) }
  }

  const fecha = parseDia(hoy)
  const diaSemana = fecha.toLocaleDateString('es-ES', { weekday: 'long' })
  const mesAnio = fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const esAdmin = !!profile.is_admin
  const accesos = ACCESOS.filter(a => !a.admin || esAdmin)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-3 h-12 sm:h-14">
          <img src={logoImg} alt="All Iron Sports" className="h-7 sm:h-8 w-auto rounded" />
          <span className="text-xs font-bold text-slate-800 tracking-wide uppercase hidden sm:block">All Iron Sports</span>
          <div className="flex-1" />
          {miEstado?.locationType && (
            <button onClick={() => onIr({ tipo: 'seccion', seccion: 'tareas', tab: 'equipo' })} title="Tu estado de hoy (se cambia en Equipo)"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Hoy en <b className="font-semibold text-slate-800">{miEstado.locationDetail || miEstado.locationType}</b>
            </button>
          )}
          {onAdmin && (
            <button onClick={onAdmin} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-2 sm:py-1 rounded hover:bg-slate-100">Admin</button>
          )}
          <span className="w-7 h-7 rounded-full bg-primary text-white text-[10px] font-bold inline-flex items-center justify-center" title={profile.name}>{profile.avatar}</span>
          <button onClick={onLogout} aria-label="Cerrar sesión" className="text-slate-400 hover:text-slate-700 p-2.5 sm:p-1.5 rounded hover:bg-slate-100">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        {/* Nivel 1: la misma fila de secciones que el resto de pantallas */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 hidden sm:flex items-center border-t border-slate-100 overflow-x-auto scrollbar-none">
          <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary transition-colors"><Home className="w-3.5 h-3.5" /> Inicio</button>
          <button onClick={() => onIr({ tipo: 'seccion', seccion: 'tareas' })} className={NAV1}>Mantenimiento</button>
          <button onClick={() => onIr({ tipo: 'seccion', seccion: 'distribucion' })} className={NAV1}><TrendingUp className="w-3.5 h-3.5" /> Distribución</button>
          <button onClick={() => onIr({ tipo: 'seccion', seccion: 'captacion' })} className={NAV1}><Eye className="w-3.5 h-3.5" /> Captación</button>
          <button onClick={() => onIr({ tipo: 'seccion', seccion: 'pipeline' })} className={NAV1}><PenLine className="w-3.5 h-3.5" /> Pipeline</button>
          <button onClick={() => onIr({ tipo: 'seccion', seccion: 'boulema' })} className={NAV1}><Inbox className="w-3.5 h-3.5" /> Boulema</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 sm:py-7 pb-24 sm:pb-10">
        {/* Fecha, frase del día, alta rápida y buscador */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 first-letter:uppercase">{mesAnio}</div>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight leading-tight text-slate-900 first-letter:uppercase">{diaSemana} {fecha.getDate()}</h1>
          </div>
          <p className="text-[13.5px] text-slate-500 max-w-xl mb-0.5">{frase}</p>
          <div className="sm:ml-auto flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                value={nueva} onChange={e => setNueva(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void crear(); if (e.key === 'Escape') setNueva('') }}
                disabled={creando}
                placeholder="Nueva tarea para hoy…  @persona  mañana"
                aria-label="Alta rápida de tarea"
                className="w-full sm:w-64 pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
              />
            </div>
            <button onClick={onBuscar} className="inline-flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 bg-white rounded-lg px-3 py-1.5 hover:bg-slate-50">
              <Search className="w-3.5 h-3.5" /> Buscar
            </button>
          </div>
        </div>
        {nueva.trim() && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Se creará «{alta.titulo || '(falta el título)'}»{alta.assigneeId ? ` para ${profiles.find(p => p.id === alta.assigneeId)?.name.split(' ')[0]}` : ''} · {parseDia(alta.dueDate ?? hoy).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
            {alta.sinResolver.length > 0 && <span className="text-amber-600"> · no reconozco {alta.sinResolver.join(', ')}</span>}
          </p>
        )}

        {/* El día */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Bloque titulo="Agenda" Icon={CalendarDays} extra={<Enlace texto="Calendario" onClick={() => onIr({ tipo: 'seccion', seccion: 'tareas', tab: 'calendario' })} />}>
            {s.agenda.length === 0 ? <Vacio texto="Sin citas hoy." /> : s.agenda.map(it => (
              <button key={it.id} onClick={() => onAbrir(it)} className={ROW}>
                <span className="w-10 text-xs font-semibold text-slate-500 tabular-nums">{it.hora ?? '—'}</span>
                <IconoTipo tipo={it.tipo} />
                <div className="min-w-0"><div className="text-[13.5px] font-medium text-slate-800 truncate">{it.titulo}</div><div className="text-[11.5px] text-slate-400 truncate">{[it.playerNombre, it.categoria, it.lugar].filter(Boolean).join(' · ')}</div></div>
              </button>
            ))}
          </Bloque>

          <Bloque titulo="Partidos del equipo" Icon={Trophy} extra={<Enlace texto="Partidos" onClick={() => onIr({ tipo: 'seccion', seccion: 'captacion', tab: 'partidos' })} />}>
            {partidos.length === 0 ? <Vacio texto="Hoy no hay partidos." /> : partidos.map(p => (
              <button key={p.matchId} onClick={() => onAbrir(p.item)} className={ROW}>
                <span className="w-10 text-xs font-semibold text-slate-500 tabular-nums">{p.hora ?? '—'}</span>
                <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium text-slate-800 truncate">{p.titulo}</div><div className="text-[11.5px] text-slate-400 truncate">{p.scouts.some(x => x.conInforme) ? 'informe hecho' : 'sin informe aún'}</div></div>
                <div className="flex">{p.scouts.map((x, i) => <span key={x.avatar} className={`w-[22px] h-[22px] rounded-full bg-primary text-white text-[8px] font-semibold inline-flex items-center justify-center ring-2 ring-white ${i ? '-ml-1.5' : ''}`} title={x.conInforme ? `${x.avatar} · informe hecho` : x.avatar}>{x.avatar}</span>)}</div>
              </button>
            ))}
          </Bloque>

          <Bloque titulo="Para hacer" Icon={ListTodo} extra={<>
            {s.vencidas.length > 0 && <span className="ml-auto text-[10.5px] font-semibold px-1.5 py-px rounded bg-red-50 text-red-700">{s.vencidas.length} con retraso</span>}
            <Enlace texto="Mi día" onClick={() => onIr({ tipo: 'mi-dia' })} />
          </>}>
            {s.hoy.length === 0 ? <Vacio texto="Nada para hoy." /> : s.hoy.slice(0, 6).map(it => {
              const retraso = !!it.fecha && it.fecha < hoy
              return (
                <button key={it.id} onClick={() => onAbrir(it)} className={ROW}>
                  <span className={`w-4 h-4 rounded-full border-[1.5px] flex-shrink-0 ${retraso ? 'border-red-500' : 'border-slate-300'}`} />
                  <IconoTipo tipo={it.tipo} />
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium text-slate-800 truncate">{it.titulo}</div><div className="text-[11.5px] text-slate-400 truncate">{[it.playerNombre, it.categoria].filter(Boolean).join(' · ')}</div></div>
                  {retraso && <span className="text-[10.5px] font-semibold px-1.5 py-px rounded bg-red-50 text-red-700 whitespace-nowrap">retraso</span>}
                </button>
              )
            })}
            {s.hoy.length > 6 && <button onClick={() => onIr({ tipo: 'mi-dia' })} className="w-full text-left px-3.5 py-1.5 text-[11.5px] text-slate-400 hover:text-slate-700 border-t border-slate-100">+{s.hoy.length - 6} más</button>}
          </Bloque>

          <Bloque titulo="En curso" Icon={RefreshCw} extra={<span className="ml-auto text-[11px] text-slate-400">nota cada {DIAS_ACTUALIZACION_PROCESO} días</span>}>
            {s.procesos.length === 0 ? <Vacio texto="Nada en curso." /> : s.procesos.map(it => {
              const dias = it.proceso?.diasSinActualizar ?? 0
              const toca = dias >= DIAS_ACTUALIZACION_PROCESO
              return (
                <button key={it.id} onClick={() => onAbrir(it)} className={`${ROW} block`}>
                  <div className="flex items-center gap-2"><div className="text-[13.5px] font-medium text-slate-800 truncate flex-1">{it.titulo}</div><span className={`text-[10.5px] font-semibold px-1.5 py-px rounded whitespace-nowrap ${toca ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{toca ? 'toca nota' : dias === 0 ? 'nota hoy' : `nota hace ${dias} d`}</span></div>
                  {it.playerNombre && <div className="text-[11.5px] text-slate-400 truncate">{it.playerNombre}</div>}
                </button>
              )
            })}
          </Bloque>
        </div>

        {/* Ir a: un recuadro por cada acceso, todos iguales, en el orden acordado */}
        <div className="mt-8 mb-3 flex items-baseline gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">Ir a</h2>
          <p className="text-xs text-slate-400">todo lo que hay en la app</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {accesos.map(a => (
            <Recuadro key={a.id} icono={a.icono} nombre={a.nombre} desc={a.desc} contador={contadores[a.id]} onClick={() => onIr(a.destino)} />
          ))}
        </div>
      </main>
    </div>
  )
}
