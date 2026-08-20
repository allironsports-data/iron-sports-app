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
  /** Novedades que ve todo el equipo en la pantalla de inicio */
  items: string[]
  /** Cambios técnicos o de administración: solo los ven los admin */
  adminItems?: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-08-20',
    items: [
      'Contactos abre mucho más rápido y, sobre todo, el resto de la app también: los 3.065 contactos iban metidos dentro del programa y se los descargaba todo el mundo aunque no entrase nunca ahí. Ahora se piden solo al abrir la pestaña',
      'La tabla de carga semanal por equipos estaba desplazada un día. Corregido',
      'Si al abrir la app falla la carga de algo (partidos, informes, clubes…), sale un aviso rojo diciendo QUÉ ha fallado, en vez de enseñar la lista vacía como si no hubiera datos',
      'Panel de tarea: si alguien cambiaba el estado de la tarea mientras tú escribías, te borraba el texto sin guardar. Ya no',
      'Avisos de «partido nuevo de su equipo»: dejan de saltar por confundir clubes distintos que empiezan igual (Real Madrid / Real Sociedad)',
    ],
    adminItems: [
      'Seguridad: las cuentas nuevas nacen PENDIENTES. Hasta que un admin las activa desde el panel, la base de datos no les entrega absolutamente nada. Antes, cualquiera que se registrase entraba con acceso completo a teléfonos, contratos y pasaportes',
      'Nuevo botón «Activar / ✓ Activa» en Admin → Equipo, y chip «Pendiente» en las cuentas sin aprobar. Sirve también para cortarle el acceso a alguien sin borrar su cuenta ni su historial',
      'Freno de borrado masivo: nadie que no sea admin puede borrar más de 25 filas de una tabla de una sola vez',
      'Pasaportes y contratos: los enlaces guardados duraban 10 AÑOS y abrían el documento sin login. Ahora se guarda la ruta y el enlace se firma al abrirlo, con 5 minutos de validez',
      'Paginación: varias consultas ordenaban por columnas repetidas (sort_pos, fecha, priority…), y en tablas de más de 1.000 filas eso hace que Postgres repita filas y se salte otras sin avisar. Todas llevan ya desempate por id',
      'Cuatro consultas más que seguían sin paginar (apuntes, reuniones y actividades) ya lo están',
      'La comparación de nombres de equipo vivía duplicada en dos sitios, con una versión antigua y con fallo en App.tsx. Ahora hay una sola en lib/equipos.ts',
      'Los enlaces a PDF que salen de las notas del contrato ya no se pintan directos: se validan y se firman al abrirlos',
    ],
  },
  {
    date: '2026-08-18',
    items: [
      'Nueva pestaña Captación → Equipos: el cuadro de control de qué equipos tenéis cubiertos por zona y categoría. Marcas con ★ los que te importan, y la app te dice de cada uno cuántos jugadores tienes apuntados, cuántos informes y cuántos partidos suyos habéis visto esta temporada',
      'Una tira roja arriba te señala dónde falta control («Madrid · Cadetes: 3 sin cubrir») y un clic te lleva a esos equipos',
      'Y puedes dar de alta equipos de los que todavía no tienes a nadie apuntado: son justo los que quieres detectar',
      'Al pulsar un equipo se abre a pantalla partida —la lista se estrecha, no se tapa— con su plantilla, sus partidos y sus marcas. El botón ⤢ lo abre entero',
      'Los botones «📍 Zonas» y «📋 Actualizar plantilla» se mudan de Jugadores a Equipos, que es su sitio',
      'Captación → Jugadores: tercera vista «⊞ Ampliada» con agencia, fin de contrato, zona, estatus en el pipeline y fecha del último informe, además de lo de siempre',
      'Y un botón «📍 Zonas» en esa misma barra para asignar o corregir la zona de cualquier club',
      'Filtro por zona geográfica en los campogramas: en Conclusiones y en Fin de contrato eliges zona (C. Valenciana, Cat/Ara/Bal, Madrid, Mur/Alm/CLM, Andalucía, Norte, CyL/Nav/Rioja, Canarias, Extremadura o Extranjero) y el campograma se queda solo con esos jugadores',
      'Captación → Partidos va mucho más rápido: la lista va ahora de 60 en 60 (como Jugadores) y el buscador ya no se atasca. La app estaba pintando los 1.900 partidos de golpe, dos veces, y recontando jugadores e informes de cada uno en cada tecla',
      'La agenda semanal y el aviso de partidos pendientes también se calculan una sola vez en lugar de en cada repintado',
      'Nueva conclusión «Visto» al escribir un informe: para cuando lo has visto y no da para concluir. No cuenta como veredicto — ni baja la exigencia del scout ni sale como desacuerdo con otro compañero',
      'Si dejas la app abierta y vuelves a ella (o se duerme el ordenador), se refresca sola: se acabó el «lo metí desde el móvil y en el ordenador no aparece hasta recargar»',
      'Ficha de partido: el ⇄ solo sale ya en informes sueltos. Los que pertenecen a otro partido se ven en gris con el nombre de ese partido, pero no se le pueden robar',
      'Y si un informe se enganchó al partido equivocado, se suelta desde el propio informe con «quitar del partido» — el informe no se borra, vuelve a la ficha del jugador',
      'Al escribir un informe desde la ficha del jugador, la app te propone el partido: un toque y queda vinculado (y si lo dejas suelto, te avisa de que no saldrá en la ficha del partido)',
      'Las tareas que vencen hoy dejan de aparecer como «vencidas» todo el día: era un lío de husos horarios',
      'Distribución y Captación van notablemente más rápidas al escribir en los buscadores y al abrir listas largas',
      'Los jugadores de Captación se sincronizan en vivo: si otro scout cambia una valoración o un contrato, lo ves sin recargar',
      'En el móvil ya puedes editar y borrar apuntes del pipeline (los botones solo salían al pasar el ratón)',
      '«Ocultar futuros» en Partidos ya no esconde los de hoy: oculta de mañana en adelante',
      'La ficha del partido se abre ahora a pantalla partida, con más información y sin ventana flotante',
      'Pegar alineación: copias el once de Sofascore, Flashscore o BeSoccer, lo pegas en la ficha del partido y la app te dice quién ya está en la BBDD (para vincularlo de golpe) y quién es nuevo (para crearlo con un clic)',
      'Y si alguno figura con otro equipo, te lo marca y lo corriges desde ahí mismo: la alineación del día manda sobre lo que hubiera en la ficha',
      'Botón «📋 Actualizar plantilla» en Captación → Jugadores: pegas la plantilla de un club y pone a todos esos jugadores en ese equipo de una vez — la forma rápida de ponerse al día con los fichajes sin ir partido a partido',
    ],
    adminItems: [
      'Revisión a fondo del código: tres consultas se cortaban en 1.000 filas sin avisar (jugadores, tareas y Boulema) — ya están paginadas',
      'Red de seguridad ante errores de pantalla: en vez de quedarse en blanco, sale un aviso con botón de recargar',
      'Contactos avisa de que sus cambios se guardan solo en ese dispositivo, mientras lo pasamos a la base de datos',
      'Seguridad: candado en la base de datos para que solo un admin cambie permisos, y las cuentas «solo Captación» dejan de recibir datos que no les tocan',
    ],
  },
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
      'Admin → Estadísticas → pestaña Scouts: análisis del trabajo de cada scout — volumen, muletillas, originalidad, conclusiones, congruencia con los demás, acierto y detección temprana — con glosario de cada métrica',
      'Y estadísticas del equipo completo: ritmo de 12 meses, embudo de la BBDD a la firma, consenso, debates pendientes (Llamar vs Descartar), destacados que se enfrían, reparto del esfuerzo y cobertura por posición',
      'Firmar: acción predefinida «📵 Conseguir teléfono» — al programar la próxima acción, un toque en 📵 la deja lista; la tarjeta del jugador muestra el 📵 y cada columna cuenta cuántos están sin número',
      'Nueva pestaña Captación → Fin de contrato: eliges el año (2026, 2027, 2028…) y ves quién acaba contrato, colocado por posición en lista o campograma, con su equipo y su agencia — y puedes corregir la fecha ahí mismo con el lápiz',
      'Ese campograma de mercado es tuyo: solo salen los jugadores marcados con ★, y en «Toda la BBDD» filtras por 1ª, 2ª y 1ª RFEF para ir añadiendo',
      'La pestaña Firmar pasa a llamarse Pipeline/Firmar y las pestañas de Captación se reordenan: Pipeline, Conclusiones, Fin de contrato, Jugadores, Informes…',
      'Avisos de tarjeta: si eres encargado de un jugador del pipeline, te llega notificación de cualquier cambio — estatus, próxima acción, apuntes, zona, notas — y también cuando te ponen como encargado',
      'En Fin de contrato cada jugador lleva su estatus del pipeline con color: Llamar, Caliente, Templado, Frío, Decidir o Firmado (y un punto hueco si aún no está en el pipeline)',
      'Ficha de partido: si un scout escribió su informe desde la ficha del jugador (sin enganchar el partido), ahora aparece igualmente en gris con un ⇄ para vincularlo al partido de un clic — se acabaron los informes que faltaban',
      'Estadísticas del equipo: las listas de debates pendientes y de destacados que se enfrían ya no se cortan — se despliegan enteras y se descargan a Excel; el embudo muestra además qué porcentaje pasa de cada etapa a la siguiente',
      'Admin → Estadísticas → Modelo de Llamar: aprende del texto de vuestros informes qué se dice de un jugador que acaba en «Llamar» y le pone probabilidad a cada informe — con la lista de «Seguir» que suenan a Llamar, los «Llamar» que el texto no sostiene, las palabras que más pesan y un probador donde pegar un informe nuevo',
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
