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
    ],
  },
]
