// ── Versión de la app y novedades ────────────────────────────
// BUILD_ID lo inyecta vite en cada build (plugin build-id en vite.config.ts),
// que además emite /version.json con el mismo id. La app compara ambos
// periódicamente: si difieren, hay una versión nueva desplegada.
//
// CHANGELOG: añade una entrada arriba en cada deploy con cambios visibles.
// Tras actualizar, la home muestra "🆕 Novedades" con la última entrada
// hasta que el usuario la descarta.

export const BUILD_ID: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

export interface ChangelogEntry {
  date: string      // "YYYY-MM-DD"
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-08-17',
    items: [
      'Overview → Postpartidos: estadísticas de quién hace qué y qué jugadores acumulan más informes postpartido',
      'Añadir negociación en Distribución: el club se elige escribiendo en un buscador, se acabó el scroll infinito',
      'Botón «Ocultar futuros» en Captación → Partidos para quedarte solo con lo ya jugado',
      'La pestaña Informes muestra los últimos 150 de cada persona (antes 60)',
      'Pretemporada incluye ahora la Best Cup y cualquier partido de julio o agosto',
      'Fusión manual de partidos: botón «⇄ Fusionar» en Partidos — selecciona los duplicados, elige cuál se queda y su fecha, y el resto le pasa scouts, jugadores e informes',
      'Cuentas «solo Captación»: en Admin puedes restringir a cualquier miembro para que solo vea Jugadores, Partidos e Informes — ideal para colaboradores que meten informes',
      'Admin → Estadísticas → pestaña Scouts: análisis del trabajo de cada scout — volumen, muletillas, originalidad, conclusiones, congruencia con los demás, acierto y detección temprana',
    ],
  },
  {
    date: '2026-08-16',
    items: [
      'Ficha de partido: haz clic en cualquier partido de Captación y se abre una ventana con sus jugadores, informes y scouts',
      'Un partido puede tener varios scouts asignados, y cada uno marca su parte como vista por separado',
      'Varios informes del mismo jugador en el mismo partido: cada scout escribe el suyo (antes solo cabía uno)',
      'Los jugadores sugeridos al vincular ya no mezclan equipos parecidos (Real Madrid / Atlético Madrid / Atlético Baleares)',
      'La lista de sugeridos ya no se corta en 16: salen todos, y el buscador muestra hasta 60 resultados',
      'Tarjetas de club en Distribución: se acabó el texto montado sobre los avatares',
      'Los partidos duplicados (una copia por scout) se han fusionado en uno solo: 2001 → 1862 partidos',
      'Captación se sincroniza en vivo: si otro scout vincula un jugador o escribe un informe, lo ves sin recargar',
    ],
  },
  {
    date: '2026-08-07',
    items: [
      'Las próximas acciones de Firmar crean una tarea real en el tablero: asignada a su encargado y con la fecha como límite',
      'Sincronización en ambos sentidos: completa la tarea y se marca hecha en Firmar, o al revés',
      'Botón «Crear tareas» en la Agenda de Firmar para convertir de golpe las acciones que ya tenías',
    ],
  },
  {
    date: '2026-07-31',
    items: [
      'Nueva pestaña Captación → Firmar: el pipeline de captación activa (ex-Trello) con zonas, estatus, próximas acciones, avisos y agenda',
      'Boulema es ahora una sección propia, con pestaña de Mantenimiento para sus jugadores',
      'Búsqueda global: ⌘K en ordenador o el botón Buscar de la barra inferior en el móvil',
      'Barra de navegación inferior en el móvil y revamp móvil de Firmar',
      'Vista Semana en tareas y agenda semanal de partidos',
      'Estado del equipo automático: se muestra la tarea en curso de cada uno, sin actualizar nada a mano',
      'Enlaces compartibles: copia la URL de cualquier ficha y mándala por WhatsApp',
      'Avisos de contratos de representación que expiran, deshacer acciones, indicador de guardado y más',
      'Los jugadores ya cerrados desaparecen de clubes, pipeline y ofrecimientos (sus datos siguen en su ficha)',
      'La app avisa en la home cuando hay una versión nueva, con este panel de novedades',
      'Botón «Añadir a Firmar» en la ficha de cada jugador de Captación: crea su tarjeta en el pipeline ya vinculada',
    ],
  },
]
