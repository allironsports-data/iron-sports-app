import { useState, useMemo, useCallback } from 'react'
import { Search, Plus, ChevronRight, Star, Check, MapPin, ClipboardList, History, CalendarDays } from 'lucide-react'
import type { ScoutingPlayer } from '../../types'
import type { Equipo as EquipoCatalogo } from '../../lib/db'
import { Dialog, Button, Input, Select } from '../../components/ui'
import { ZONAS, ZONA_CORTA, SIN_ZONA, zonaDe, clubBase, normEquipo, type Zona } from '../../lib/zonas'
import { norm as normSearch } from '../../lib/texto'
import { BotonCsv } from '../../components/BotonCsv'
import { type ShowToast, SELECT_CLS, fmtDate } from './helpers'
import { type FilaEquipo, etiquetaTemporada, SIN_CATEGORIA, semaforoEquipo } from './filasEquipos'
// ── Zonas de los clubes ──────────────────────────────────────────────
// La zona va a nivel de CLUB, no de jugador: si cambias «Villarreal», te
// cambian de golpe el primer equipo, el B y todos los juveniles, y los
// fichajes futuros ya nacen con su zona. Se guarda en la base de datos
// (tabla scouting_club_zonas), así que lo que cambia uno lo ven todos.
export function ZonasPanel({ players, clubZonas, onSetClubZona, onClose, showToast }: {
  players: ScoutingPlayer[]
  clubZonas: Record<string, Zona>
  onSetClubZona: (club: string, nombre: string, zona: Zona | null) => Promise<void>
  onClose: () => void
  showToast: ShowToast
}) {
  const [q, setQ] = useState('')
  const [soloSinZona, setSoloSinZona] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)
  // Selección múltiple: 40 clubes extranjeros de uno en uno no tiene sentido
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)

  // Un club por cada equipo distinto de la app, con cuántos jugadores tiene
  const clubes = useMemo(() => {
    const m = new Map<string, { club: string; nombre: string; n: number }>()
    for (const p of players) {
      const club = clubBase(p.team)
      if (!club) continue
      const e = m.get(club)
      if (e) e.n++
      else m.set(club, { club, nombre: (p.team ?? '').trim(), n: 1 })
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.club.localeCompare(b.club))
  }, [players])

  const nq = normSearch(q)
  const visibles = useMemo(() => clubes.filter(c => {
    const zona = zonaDe(c.nombre, clubZonas)
    if (soloSinZona && zona) return false
    if (nq && !normSearch(`${c.club} ${c.nombre}`).includes(nq)) return false
    return true
  }), [clubes, clubZonas, soloSinZona, nq])

  const sinZona = useMemo(
    () => clubes.filter(c => !zonaDe(c.nombre, clubZonas)).length,
    [clubes, clubZonas],
  )

  /** Poner la misma zona a todos los seleccionados */
  async function aplicarASeleccion(valor: string) {
    const lista = clubes.filter(c => sel.has(c.club))
    if (lista.length === 0) return
    setAplicando(true)
    let fallos = 0
    for (const c of lista) {
      try {
        await onSetClubZona(c.club, c.nombre, valor === '' ? null : valor as Zona)
      } catch { fallos++ }
    }
    setAplicando(false)
    setSel(new Set())
    if (fallos) showToast(`${lista.length - fallos} guardados, ${fallos} con error`, 'error')
    else showToast(valor ? `${lista.length} clubes → ${valor}` : `${lista.length} clubes sin zona`)
  }

  async function cambiar(c: { club: string; nombre: string }, valor: string) {
    setGuardando(c.club)
    try {
      await onSetClubZona(c.club, c.nombre, valor === '' ? null : valor as Zona)
      showToast(valor ? `${c.nombre}: ${valor}` : `${c.nombre}: vuelve a la zona por defecto`)
    } catch {
      showToast('No se ha podido guardar la zona', 'error')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Zonas de los clubes"
      description={`${clubes.length} clubes · ${sinZona} sin zona`}
      size="lg"
      historyKey="zonas-clubes"
      className="sm:max-h-[90dvh]"
    >
      <div className="-mx-4 sm:-mx-5 -my-4">
        <div className="px-5 py-3 border-b border-slate-100 space-y-2">
          <p className="text-badge text-slate-500">
            La zona es del club, no del jugador: al cambiar «Villarreal» cambian con él el filial y todos
            los juveniles. Se guarda en la base de datos y lo ve todo el equipo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" aria-hidden="true" />
              <Input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar club…"
                aria-label="Buscar club"
                autoFocus
                className="pl-8"
              />
            </div>
            <label className="flex items-center gap-1.5 text-badge font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={soloSinZona} onChange={e => setSoloSinZona(e.target.checked)} className="accent-blue-600" />
              Solo los que no tienen zona
            </label>
          </div>
        </div>

        {/* Acciones en bloque */}
        <div className="px-5 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60">
          <label className="flex items-center gap-1.5 text-badge font-semibold text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={visibles.length > 0 && visibles.every(c => sel.has(c.club))}
              onChange={e => {
                const next = new Set(sel)
                visibles.slice(0, 200).forEach(c => e.target.checked ? next.add(c.club) : next.delete(c.club))
                setSel(next)
              }}
            />
            Seleccionar los {Math.min(visibles.length, 200)} de la lista
          </label>
          {sel.size > 0 && (
            <>
              <span className="text-badge font-bold text-primary">{sel.size} seleccionado{sel.size !== 1 ? 's' : ''}</span>
              <select
                defaultValue=""
                disabled={aplicando}
                onChange={e => { const v = e.target.value; e.target.value = ''; void aplicarASeleccion(v) }}
                className="text-badge border border-primary rounded-lg px-2 py-1 bg-white text-primary font-semibold focus:outline-none"
              >
                <option value="" disabled>Asignar zona a los {sel.size}…</option>
                {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
              <Button size="sm" variant="link" onClick={() => setSel(new Set())}>quitar selección</Button>
            </>
          )}
          {aplicando && <span className="text-badge text-slate-500">guardando…</span>}
        </div>

        <div className="divide-y divide-slate-50">
          {visibles.length === 0 && (
            <p className="text-secondary text-slate-500 italic px-5 py-6 text-center">No hay clubes que coincidan.</p>
          )}
          {visibles.slice(0, 200).map(c => {
            const zona = zonaDe(c.nombre, clubZonas)
            const aMano = !!clubZonas[c.club]
            return (
              <div key={c.club} className={`flex items-center gap-2 px-5 py-2 ${sel.has(c.club) ? 'bg-blue-50/50' : ''}`}>
                <input
                  type="checkbox"
                  className="accent-blue-600 flex-shrink-0"
                  checked={sel.has(c.club)}
                  onChange={e => {
                    const next = new Set(sel)
                    if (e.target.checked) next.add(c.club); else next.delete(c.club)
                    setSel(next)
                  }}
                  aria-label={`Seleccionar ${c.nombre}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-secondary font-semibold text-slate-700 truncate">
                    {c.nombre}
                    {aMano && <span className="ml-1.5 text-badge font-bold text-blue-600 uppercase">a mano</span>}
                  </div>
                  <div className="text-badge text-slate-500">{c.n} jugador{c.n !== 1 ? 'es' : ''}</div>
                </div>
                <Select
                  value={zona ?? ''}
                  disabled={guardando === c.club}
                  onChange={e => void cambiar(c, e.target.value)}
                  aria-label={`Zona de ${c.nombre}`}
                  className={`w-auto max-w-[230px] py-1 text-meta ${zona ? '' : 'border-amber-300 bg-amber-50 text-amber-700'}`}
                >
                  <option value="">— sin zona —</option>
                  {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                </Select>
              </div>
            )
          })}
          {visibles.length > 200 && (
            <p className="text-badge text-slate-500 italic px-5 py-3 text-center">
              Se muestran 200 de {visibles.length}. Busca por nombre para llegar al resto.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}

export function EquiposTab({
  filas, desde,
  onSaveEquipo, onAbrirEquipo, equipoAbierto, onAbrirZonas, onAbrirPlantilla, showToast,
}: {
  /** Filas calculadas UNA vez en Captacion.tsx con useFilasEquipos (se comparten con el panel lateral) */
  filas: FilaEquipo[]
  /** Inicio de la temporada actual (inicioTemporada()) */
  desde: string
  onSaveEquipo: (e: Partial<EquipoCatalogo> & { nombre: string; club: string }) => Promise<void>
  onAbrirEquipo: (nombre: string) => void
  equipoAbierto: string | null
  onAbrirZonas: () => void
  onAbrirPlantilla: () => void
  showToast: ShowToast
}) {
  const [zonaSel, setZonaSel] = useState<string>('all')
  const [catSel, setCatSel] = useState<string>('all')
  const [soloRelevantes, setSoloRelevantes] = useState(false)
  const [historico, setHistorico] = useState(false)
  const [q, setQ] = useState('')
  const [verMatriz, setVerMatriz] = useState(false)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaCat, setNuevaCat] = useState('')

  const categorias = useMemo(
    () => [...new Set(filas.map(f => f.categoria))].sort((a, b) =>
      a === SIN_CATEGORIA ? 1 : b === SIN_CATEGORIA ? -1 : a.localeCompare(b)),
    [filas],
  )
  const zonas = useMemo(
    () => [...new Set(filas.map(f => f.zona))].sort((a, b) =>
      a === SIN_ZONA ? 1 : b === SIN_ZONA ? -1 : a.localeCompare(b)),
    [filas],
  )

  const nPartidos = useCallback(
    (f: FilaEquipo) => historico ? f.partidosHist : f.partidos,
    [historico],
  )
  const cubierto = useCallback((f: FilaEquipo) => f.cubierto || nPartidos(f) > 0, [nPartidos])

  // ── Resumen: en vez de una matriz enorme, dos tiras de chips que
  //    además FILTRAN. Cada chip dice cuántos relevantes hay cubiertos.
  const resumen = useMemo(() => {
    const porZona: Record<string, { rel: number; cub: number }> = {}
    const porCat: Record<string, { rel: number; cub: number }> = {}
    let rel = 0, cub = 0
    const huecos: { zona: string; cat: string; falta: number }[] = []
    const celdas: Record<string, { rel: number; cub: number }> = {}
    for (const f of filas) {
      if (!f.relevante) continue
      rel++
      const ok = cubierto(f)
      if (ok) cub++
      porZona[f.zona] ??= { rel: 0, cub: 0 }
      porZona[f.zona].rel++; if (ok) porZona[f.zona].cub++
      porCat[f.categoria] ??= { rel: 0, cub: 0 }
      porCat[f.categoria].rel++; if (ok) porCat[f.categoria].cub++
      const k = f.zona + '§' + f.categoria
      celdas[k] ??= { rel: 0, cub: 0 }
      celdas[k].rel++; if (ok) celdas[k].cub++
    }
    for (const [k, v] of Object.entries(celdas)) {
      const falta = v.rel - v.cub
      if (falta > 0) {
        const [zona, cat] = k.split('§')
        huecos.push({ zona, cat, falta })
      }
    }
    huecos.sort((a, b) => b.falta - a.falta)
    return { porZona, porCat, rel, cub, huecos, celdas }
  }, [filas, cubierto])

  const nq = normSearch(q)
  const visibles = useMemo(() => filas.filter(f => {
    if (zonaSel !== 'all' && f.zona !== zonaSel) return false
    if (catSel !== 'all' && f.categoria !== catSel) return false
    if (soloRelevantes && !f.relevante) return false
    if (nq && !normSearch(`${f.nombre} ${f.club}`).includes(nq)) return false
    return true
  }), [filas, zonaSel, catSel, soloRelevantes, nq])

  async function marcar(f: FilaEquipo, campo: 'relevante' | 'cubierto') {
    try {
      await onSaveEquipo({
        nombre: f.nombre,
        club: f.club,
        categoria: f.categoria === SIN_CATEGORIA ? undefined : f.categoria,
        [campo]: !f[campo],
      })
    } catch {
      showToast('No se ha podido guardar', 'error')
    }
  }

  async function crearEquipo() {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    if (filas.some(f => f.clave === normEquipo(nombre))) {
      showToast('Ese equipo ya está en la lista', 'info')
      return
    }
    try {
      await onSaveEquipo({ nombre, club: clubBase(nombre), categoria: nuevaCat || undefined, relevante: true, manual: true })
      showToast(`${nombre} añadido como relevante`)
      setNuevoNombre(''); setNuevaCat(''); setAltaAbierta(false)
    } catch {
      showToast('No se ha podido crear el equipo', 'error')
    }
  }

  const chipCls = (d: { rel: number; cub: number } | undefined, activo: boolean) => {
    if (activo) return 'bg-primary text-white border-primary'
    if (!d || d.rel === 0) return 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
    const pct = d.cub / d.rel
    if (pct >= 1) return 'bg-green-50 text-green-700 border-green-300 hover:border-green-500'
    if (pct >= 0.5) return 'bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-500'
    return 'bg-red-50 text-red-700 border-red-300 hover:border-red-500'
  }

  return (
    <div className="flex-1 max-w-[1500px] mx-auto w-full px-3 sm:px-6 py-4 space-y-3">

      {/* ── Cabecera: una línea con el estado y las herramientas ── */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-800">Control de equipos</h2>
        {resumen.rel > 0 ? (
          <span className="text-xs text-slate-500">
            <strong className="text-slate-800">{resumen.cub}</strong> de {resumen.rel} relevantes cubiertos
            {resumen.huecos.length > 0 && <span className="text-red-600 font-semibold"> · {resumen.rel - resumen.cub} sin cubrir</span>}
          </span>
        ) : (
          <span className="text-secondary text-slate-500 inline-flex items-center gap-1">Marca con <Star className="w-3.5 h-3.5 text-amber-500" aria-label="la estrella" /> los equipos que te importan y esto se convierte en tu cuadro de control</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            icon={historico ? <History /> : <CalendarDays />}
            onClick={() => setHistorico(h => !h)}
            aria-pressed={historico}
            title={historico
              ? 'Ahora se cuentan TODOS los partidos, de cualquier temporada. Pulsa para contar solo los de esta.'
              : `Ahora solo se cuentan los partidos del ${fmtDate(desde)} en adelante. Pulsa para contar todo el histórico.`}
          >
            {historico ? 'Todo el histórico' : `Temporada ${etiquetaTemporada(desde)} · desde ${fmtDate(desde)}`}
          </Button>
          <Button size="sm" variant="secondary" icon={<MapPin />} onClick={onAbrirZonas}>Zonas</Button>
          <Button size="sm" variant="secondary" icon={<ClipboardList />} onClick={onAbrirPlantilla}>Actualizar plantilla</Button>
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setAltaAbierta(a => !a)} aria-expanded={altaAbierta}>Equipo</Button>
        </div>
      </div>

      {altaAbierta && (
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-badge font-bold text-slate-500 uppercase mb-1">Equipo</label>
            <Input
              value={nuevoNombre}
              onChange={e => setNuevoNombre(e.target.value)}
              placeholder="Ej.: Rayo Vallecano Juv A"
              aria-label="Nombre del equipo"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') void crearEquipo() }}
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-badge font-bold text-slate-500 uppercase mb-1">Categoría</label>
            <select value={nuevaCat} onChange={e => setNuevaCat(e.target.value)} className={SELECT_CLS + ' w-full'}>
              <option value="">— sin categoría —</option>
              {categorias.filter(c => c !== SIN_CATEGORIA).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Button variant="primary" icon={<Star />} onClick={() => void crearEquipo()}>
            Añadir como relevante
          </Button>
          <p className="w-full text-badge text-slate-500">
            Para equipos que te importan y de los que <strong>todavía no tienes a nadie apuntado</strong>.
          </p>
        </div>
      )}

      {/* ── Zonas y categorías: chips que resumen Y filtran ── */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-badge font-bold text-slate-500 uppercase w-14">Zona</span>
          <button onClick={() => setZonaSel('all')} className={`text-badge font-semibold rounded-full border px-2 py-0.5 ${chipCls(undefined, zonaSel === 'all')}`}>Todas</button>
          {zonas.map(z => {
            const d = resumen.porZona[z]
            return (
              <button
                key={z}
                onClick={() => setZonaSel(zonaSel === z ? 'all' : z)}
                title={z}
                className={`text-badge font-semibold rounded-full border px-2 py-0.5 ${chipCls(d, zonaSel === z)}`}
              >
                {z === SIN_ZONA ? 'Sin zona' : (ZONA_CORTA[z as Zona] ?? z)}
                {d && <span className="ml-1 opacity-70">{d.cub}/{d.rel}</span>}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-badge font-bold text-slate-500 uppercase w-14">Categ.</span>
          <button onClick={() => setCatSel('all')} className={`text-badge font-semibold rounded-full border px-2 py-0.5 ${chipCls(undefined, catSel === 'all')}`}>Todas</button>
          {categorias.map(c => {
            const d = resumen.porCat[c]
            return (
              <button
                key={c}
                onClick={() => setCatSel(catSel === c ? 'all' : c)}
                className={`text-badge font-semibold rounded-full border px-2 py-0.5 ${chipCls(d, catSel === c)}`}
              >
                {c === SIN_CATEGORIA ? 'Sin categoría' : c}
                {d && <span className="ml-1 opacity-70">{d.cub}/{d.rel}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Huecos: lo accionable de verdad ── */}
      {resumen.huecos.length > 0 && (
        <div className="bg-red-50/60 border border-red-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-1.5">
          <span className="text-badge font-bold text-red-700">Dónde falta control:</span>
          {resumen.huecos.slice(0, 8).map(h => (
            <button
              key={h.zona + h.cat}
              onClick={() => { setZonaSel(h.zona); setCatSel(h.cat); setSoloRelevantes(true) }}
              className="text-badge font-semibold bg-white border border-red-200 text-red-700 rounded-full px-2 py-0.5 hover:border-red-400"
            >
              {(ZONA_CORTA[h.zona as Zona] ?? h.zona)} · {h.cat === SIN_CATEGORIA ? '—' : h.cat}
              <span className="ml-1 font-bold">{h.falta}</span>
            </button>
          ))}
          {resumen.huecos.length > 8 && <span className="text-badge text-red-600">y {resumen.huecos.length - 8} más</span>}
          <button onClick={() => setVerMatriz(v => !v)} className="ml-auto text-badge font-semibold text-red-700 hover:underline">
            {verMatriz ? 'Ocultar cuadro' : 'Ver cuadro completo'}
          </button>
        </div>
      )}

      {/* ── Cuadro completo, plegado por defecto ── */}
      {verMatriz && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-badge">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-1.5 font-semibold text-slate-500 uppercase">Zona</th>
                {categorias.map(c => <th key={c} className="px-2 py-1.5 font-semibold text-slate-500 uppercase text-center whitespace-nowrap">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {zonas.map(z => (
                <tr key={z} className="hover:bg-slate-50/60">
                  <td className="px-3 py-1.5 font-semibold text-slate-700 whitespace-nowrap">{z === SIN_ZONA ? 'Sin zona' : (ZONA_CORTA[z as Zona] ?? z)}</td>
                  {categorias.map(c => {
                    const d = resumen.celdas[z + '§' + c]
                    return (
                      <td key={c} className="px-2 py-1.5 text-center">
                        {d
                          ? <button onClick={() => { setZonaSel(z); setCatSel(c); setSoloRelevantes(true) }} className={`rounded px-1.5 py-0.5 font-bold border ${chipCls(d, false)}`}>{d.cub}/{d.rel}</button>
                          : <span className="text-slate-200">·</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Filtros finos ── */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <label className="flex items-center gap-1.5 text-badge font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={soloRelevantes} onChange={e => setSoloRelevantes(e.target.checked)} className="accent-blue-600" />
          Solo <Star className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" /> relevantes
        </label>
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" aria-hidden="true" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar equipo…"
            aria-label="Buscar equipo"
            className="pl-8"
          />
        </div>
        <span className="text-xs text-slate-500">{visibles.length} equipos</span>
        <BotonCsv
          nombre="equipos-control"
          cabeceras={['Equipo', 'Club', 'Zona', 'Categoría', 'Relevante', 'Cubierto', 'Jugadores', 'Informes', 'Partidos temporada', 'Partidos total', 'Último partido']}
          filas={() => visibles.map(f => [
            f.nombre, f.club, f.zona, f.categoria,
            f.relevante ? 'Sí' : '', f.cubierto ? 'Sí' : '',
            f.jugadores, f.informes, f.partidos, f.partidosHist, f.ultimoPartido ?? '',
          ])}
        />
      </div>

      {/* ── Lista ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-badge text-slate-500 uppercase tracking-wide">
                <th className="px-2 py-2 font-semibold w-10" title="Relevante: este equipo nos importa"><Star className="w-3.5 h-3.5 inline" aria-label="Relevante" /></th>
                <th className="px-2 py-2 font-semibold w-10" title="Cubierto esta temporada"><Check className="w-3.5 h-3.5 inline" aria-label="Cubierto" /></th>
                <th className="text-left px-3 py-2 font-semibold">Equipo</th>
                <th className="text-left px-2 py-2 font-semibold">Zona</th>
                <th className="text-left px-2 py-2 font-semibold">Categoría</th>
                <th className="text-center px-2 py-2 font-semibold" title="Jugadores en la app">Jug.</th>
                <th className="text-center px-2 py-2 font-semibold" title="Informes sobre jugadores de este equipo">Inf.</th>
                <th className="text-center px-2 py-2 font-semibold" title="Partidos suyos en la pestaña Partidos">Part.</th>
                <th className="text-left px-2 py-2 font-semibold">Último</th>
                <th className="text-left px-2 py-2 font-semibold">Control</th>
                <th className="px-2 py-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibles.length === 0 && (
                <tr><td colSpan={11} className="text-center py-10 text-slate-500 text-sm">No hay equipos que coincidan.</td></tr>
              )}
              {visibles.slice(0, 300).map(f => {
                const sem = semaforoEquipo(f, nPartidos(f))
                return (
                  <tr
                    key={f.clave}
                    onClick={() => onAbrirEquipo(f.nombre)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir ${f.nombre}`}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrirEquipo(f.nombre) } }}
                    className={`cursor-pointer hover:bg-slate-50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${equipoAbierto && normEquipo(equipoAbierto) === f.clave ? 'bg-blue-50/50' : ''}`}
                  >
                    <td className="px-1 py-1 text-center" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void marcar(f, 'relevante')}
                        aria-pressed={f.relevante}
                        aria-label={f.relevante ? `Quitar ${f.nombre} de relevantes` : `Marcar ${f.nombre} como relevante`}
                        title={f.relevante ? 'Quitar de relevantes' : 'Marcar como relevante'}
                        className={`inline-flex items-center justify-center min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 sm:w-8 sm:h-8 rounded-lg ${f.relevante ? 'text-amber-500' : 'text-slate-500 hover:text-amber-500'}`}
                      ><Star className={`w-4 h-4 ${f.relevante ? 'fill-current' : ''}`} /></button>
                    </td>
                    <td className="px-1 py-1 text-center" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void marcar(f, 'cubierto')}
                        aria-pressed={f.cubierto}
                        aria-label={f.cubierto ? `Marcar ${f.nombre} como no cubierto` : `Marcar ${f.nombre} como cubierto esta temporada`}
                        title={f.cubierto ? 'Marcar como NO cubierto' : 'Marcar como cubierto esta temporada'}
                        className={`inline-flex items-center justify-center min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 sm:w-8 sm:h-8 rounded-lg ${f.cubierto ? 'text-green-600' : 'text-slate-500 hover:text-green-600'}`}
                      ><Check className="w-4 h-4" strokeWidth={f.cubierto ? 3 : 2} /></button>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {f.nombre}
                      {!f.enCatalogo && <span className="ml-1.5 text-badge font-bold text-blue-500 uppercase" title="Todavía no está en el catálogo">nuevo</span>}
                    </td>
                    <td className="px-2 py-2 text-badge text-slate-500 whitespace-nowrap">
                      {f.zona === SIN_ZONA ? <span className="text-amber-600">sin zona</span> : (ZONA_CORTA[f.zona as Zona] ?? f.zona)}
                    </td>
                    <td className="px-2 py-2 text-badge text-slate-500 whitespace-nowrap">
                      {f.categoria === SIN_CATEGORIA ? <span className="text-amber-600">—</span> : f.categoria}
                    </td>
                    <td className={`px-2 py-2 text-center text-xs font-semibold ${f.jugadores ? 'text-slate-700' : 'text-slate-500'}`}>{f.jugadores || '—'}</td>
                    <td className={`px-2 py-2 text-center text-xs ${f.informes ? 'text-slate-600' : 'text-slate-500'}`}>{f.informes || '—'}</td>
                    <td className="px-2 py-2 text-center text-xs">
                      <span
                        className={nPartidos(f) ? 'font-semibold text-slate-700' : 'text-slate-500'}
                        title={historico ? 'Partidos de todas las temporadas' : `Partidos desde el ${fmtDate(desde)}`}
                      >{nPartidos(f) || '—'}</span>
                      {!historico && f.partidosHist > f.partidos && (
                        <span className="text-badge text-slate-500" title={`${f.partidosHist} partidos suyos en total, contando temporadas anteriores`}> ({f.partidosHist})</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-badge text-slate-500 whitespace-nowrap">
                      {f.ultimoPartido ? fmtDate(f.ultimoPartido) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex text-badge font-bold rounded-full border px-2 py-0.5 ${sem.cls}`}>{sem.txt}</span>
                    </td>
                    <td className="px-2 py-2 text-right"><ChevronRight className="w-3.5 h-3.5 text-slate-500 inline" aria-hidden="true" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {visibles.length > 300 && (
          <p className="text-badge text-slate-500 italic px-4 py-3 text-center border-t border-slate-100">
            Se muestran 300 de {visibles.length}. Filtra por zona o categoría para ver el resto.
          </p>
        )}
      </div>
    </div>
  )
}
