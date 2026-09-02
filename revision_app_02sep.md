# Revisión de la app — 2 de septiembre de 2026

Segunda pasada completa sobre el código (unas 38.000 líneas en `src/`), dos semanas después de la del 18 de agosto. Cuatro revisiones en paralelo (capa de datos y App, Captación/Boulema/estadísticas, Distribución/Clubes/Contactos, Tablero/Ficha de jugador/Admin) y después cuatro tandas de arreglos sobre ficheros distintos. Todo lo del punto 1 está compilado (`tsc` limpio, `vite build` correcto, 49 tests en verde, ESLint con 15 avisos menos que antes y ninguno nuevo) y guardado en tu carpeta `iron-sports-app`. Falta desplegar.

---

## 1. Arreglado ya

### Fechas: la misma trampa en 25 sitios más

La revisión anterior corrigió dos puntos donde `new Date('2026-09-02')` (medianoche UTC = 02:00 en España) hacía que una tarea que vence HOY saliera «vencida». Esta vez he buscado el patrón entero y quedaban muchos más: el tablero (vista kanban, la que usa todo el mundo), la ficha del jugador, la ficha de cada miembro del equipo, el seguimiento de tareas de Admin, las fechas por defecto de los formularios de vídeo/informe/evento (de madrugada proponían ayer), la ventana de partidos sugeridos de Captación y el informe mensual.

Dos bugs más de la misma familia que no se habían visto: lo que vence en **domingo no contaba como «esta semana»** (el límite era domingo a las 00:00), y la columna **«Actividad 4 sem» se desplazaba un día** tras cada cambio de hora porque restaba semanas en milisegundos.

Para que no vuelva a pasar hay un fichero nuevo, `src/lib/fechas.ts`, con una regla escrita arriba y tests: los días se comparan como texto `AAAA-MM-DD` y, cuando hace falta un `Date`, se ancla a las 12:00 locales. Toda la app pasa por ahí ahora.

### Captación: informes que iban a parar al jugador equivocado

El formulario «Nuevo informe» del panel de jugador no se limpiaba al cambiar de jugador. Si un scout abría a A, empezaba a escribir, eligía un partido, cerraba y abría a B, el formulario aparecía relleno con lo de A y al guardar creaba el informe **en B, vinculado al partido de A**. Corregido; además el vínculo con el partido va en su propio bloque, así que si falla el vínculo el informe ya guardado no se vuelve a crear al reintentar (antes salía «error» y se duplicaba).

También: editar solo el texto de un informe que venía de Boulema («Más video, prioritario»…) borraba su conclusión, porque no es una de las opciones del desplegable. Ahora la conserva.

### Estadísticas de scouts: los «debates» se calculaban al revés

Para decidir si dos scouts discrepan sobre un jugador se tomaba la conclusión **más antigua** de cada uno (los informes llegan ordenados de nuevo a viejo y el bucle se quedaba con el último procesado). Un scout que pasó de «Descartar» a «Llamar» seguía apareciendo en debates pendientes. Ahora se usa la más reciente.

### Distribución

- Al mover una negociación de estado no se actualizaba `updated_at` en el estado local: el reloj de «parada >7 días», el filtro de paradas y el semáforo de salud del club seguían en rojo hasta recargar. La base de datos devuelve ahora la fila guardada y se usa esa.
- La prioridad **D** existía al crear pero no al editar.
- El corte de «demasiado joven» para sugerir jugadores a una necesidad estaba fijo en «nacido después de 2009»; ahora se calcula con el año actual (16 años).
- Si una entrada del pipeline apuntaba a un jugador borrado, el panel reventaba la vista entera (`players.find(...)!`). Ahora simplemente no se pinta.
- El buscador de Clubes guardado en `sessionStorage` se aplicaba a Jugadores o Solicitudes al recargar, sin verse en la caja.
- Unas 130 líneas de código muerto (dos desplegables que nunca se abrían, un filtro inalcanzable) eliminadas.

### Ficha del jugador: guardados que parecían guardados

Una docena de sitios (contrato, club, info, vídeo, links, tarea desde el panel) llamaban a guardar sin esperar el resultado: si Supabase fallaba, la interfaz cerraba el modo edición y decía «Guardado ✓». Ahora esperan, avisan y no cierran. De paso: al editar un jugador se valida nombre y fecha de nacimiento (se podían vaciar y la edad salía `NaN`), y los ficheros de contrato y pasaporte deben ser PDF/imagen de hasta 10 MB (antes se subía cualquier cosa sin límite a un bucket privado).

### Panel de tarea

- Al abrir otra tarea con ⌘K sin cerrar el panel, se le pegaba **el jugador de la anterior** y al guardar se reasignaba.
- El desplegable de tipo tenía 8 opciones de las 11 que existen: una tarea «Postpartido» aparecía como «Sin tipo». Hay ahora una única lista `TASK_LABELS` que usan los tres selects.
- Enter dos veces seguidas creaba dos comentarios.

### Permisos y seguridad

- **Cuenta «solo Captación»**: la comprobación estaba después de las ramas de jugador, miembro y Boulema, y el router de hash aceptaba `#/jugador/<id>`. Bastaba pegar un enlace para ver una ficha completa con contrato y pasaporte. Ahora el guard se evalúa antes y el router ignora esas rutas para esa cuenta.
- **Tareas «solo admin»** aparecían para cualquiera en la búsqueda global, en la ficha del jugador y en la de cada miembro. Filtradas en origen.
- **`notify-task`** (la función que manda correos): cualquiera con la clave pública de la app podía llamarla y hacer que Resend enviara un correo con texto arbitrario desde `notificaciones@allironsports.com` a quien quisiera. Exige ahora una cabecera secreta. ⚠ Ver punto 2, hay que configurarla antes de desplegar.
- **`leer-partido`**: descargaba cualquier URL que le pasaran y devolvía el contenido: un proxy abierto desde la IP de Supabase. Ahora solo acepta sofascore, flashscore, besoccer, lapreferente y futbol-regional.
- **Contactos**: vaciar un campo no sobrevivía a la recarga (JSON elimina los `undefined`), y borrar un contacto propio y volver a crearlo con los mismos datos lo dejaba invisible para siempre (id determinista + lista de borrados). Sigue viviendo en `localStorage`, ver punto 3.
- **CSV**: celdas que empiezan por `= + - @` se neutralizan (Excel las ejecutaba como fórmula).

### Robustez

- Si fallaba la lectura del perfil al entrar (red, RLS), la app se quedaba en una rueda infinita. Ahora hay «Reintentar» y «Volver al login».
- Siete lecturas de tablas «opcionales» (partidos, scouts por partido, firmas, Boulema, equipos, zonas) devolvían la lista **a medias** ante cualquier error, y el aviso rojo de «carga incompleta» nunca saltaba para ellas. Ahora solo devuelven vacío si la tabla no existe; cualquier otro fallo avisa.
- Asignar encargado en bloque ignoraba los errores de cada update (la UI decía «asignado») y con más de 1000 jugadores seleccionados solo tocaba los primeros. Va en lotes y comprueba.
- Los avisos en tiempo real (campana y notificación del sistema) se generaban dentro de los `setState(prev => …)` para «leer el estado actual». React ejecuta esos updaters dos veces en desarrollo y a veces en producción: avisos duplicados. Leen ahora de refs.
- Si al sincronizar una acción del pipeline Firmar se creaba la tarea pero fallaba el enlace, cada nuevo intento creaba otra tarea huérfana. Ahora se borra la tarea si no se puede enlazar.

### Rendimiento

Índices en vez de `.find()` en bucles en Boulema (peticiones: era peticiones × informes por tecla), Estadísticas de Captación (12.000 informes × 3.700 jugadores en cada recálculo), las tres vistas de Jugadores del tablero, la tabla de scouting y el panel de jugador de Captación (copiaba y ordenaba los 1.900 partidos en cada tecla del informe). Cinco componentes que se definían dentro del render (`TaskCard`, `PanelExpandBtn`, `HealthCard`, `Group`, `Row`) y por tanto se desmontaban y remontaban en cada pulsación, sacados fuera.

---

## 2. Lo que tienes que hacer tú antes de desplegar

1. **Secreto de `notify-task`.** En Supabase → Edge Functions → `notify-task` → Secrets, crea `WEBHOOK_SECRET` con un valor largo aleatorio. Luego en Database → Webhooks, edita el webhook de `tasks` y añade la cabecera HTTP `x-webhook-secret` con ese mismo valor. Si despliegas la función sin esto, **dejan de llegar los correos** (la función responde 403).
2. Desplegar las dos funciones (`notify-task`, `leer-partido`) además del front.
3. Sigue pendiente de la revisión anterior: ejecutar `fusionar_firmas_duplicadas.sql` y después `revision_seguridad.sql`, y mandarme el diagnóstico de RLS de la parte 1. Es lo único con riesgo real, y varios arreglos de hoy (solo Captación, tareas solo admin) siguen siendo «pintura» mientras no haya políticas en la base de datos.

---

## 3. Decisiones que dependen de ti

**La temporada de Distribución está fija en «2025-26».** `CURRENT_SEASON` en `Distribution.tsx` y el valor por defecto de `fetchDistributionEntries` siguen en 2025-26, y estamos en septiembre de 2026. No lo he cambiado porque afecta a datos: al pasar a «2026-27» la pestaña Jugadores se queda vacía hasta que se crean las entradas de la nueva temporada (el año pasado se hizo con `migration_2025_26_distribution.sql`). Hay además una inconsistencia que conviene arreglar en el mismo movimiento: la pestaña Jugadores filtra por temporada, pero el pipeline, el modal de nueva negociación y los paneles de necesidad/club usan **todas** las temporadas y cogen la primera entrada que encuentran. Propuesta: función `temporadaActual()` (julio cambia de año), un botón «Abrir temporada 2026-27» en Admin que copie las entradas activas, y usar `seasonEntries` en todas partes. Dime cómo quieres arrancar la 26-27 y lo hago.

**Firmas: escrituras que se pisan.** El panel de una tarjeta manda siempre la tarjeta entera (`{...entry, ...cambios}`) con la copia que tenía al pintarse. Escribir en «Notas» y pulsar «Enviar apunte» en el mismo gesto hace que el segundo guardado borre las notas del primero; dos apuntes rápidos seguidos, igual. No es un arreglo de una línea (hay que pasar a «parchea estos campos de esta tarjeta» y meter el apunte dentro del updater), así que lo dejo para una tanda propia. Es el siguiente bug de pérdida de datos más probable en el día a día.

**Contactos a Supabase.** Sigue en `localStorage`; hoy he arreglado dos bugs de esa capa, pero el problema de fondo (nadie ve las correcciones de nadie) sigue. Medio día de trabajo.

**«Mismo equipo» significa dos cosas.** `teamMatchKind` iguala «Villarreal», «Villarreal B» y «Villarreal Juv A» como «exacto» (descarta A/B/Juv/Cadete antes de comparar). Efectos: los sugeridos de un partido incluyen a todo el club; los avisos de «cambió de club» y el pegado de alineaciones no detectan ascensos Juv B → Juv A → primer equipo, que es justo lo que traen las alineaciones. Hace falta un tercer nivel («club» vs «exacto») y decidir cuál usa cada sitio.

**Modelo «Llamar»** reentrena en el hilo principal cada vez que se abre la pestaña y cada vez que alguien añade un informe: varios segundos de interfaz bloqueada. Cachear por número de informes y moverlo a un Web Worker.

**Crear usuario desde Admin** usa `signUp` con la sesión del admin: si en Supabase está desactivada la confirmación por correo, el admin pasa a estar logueado como el usuario recién creado. Lo correcto es una Edge Function con `auth.admin.createUser`. Compruébalo en Authentication → Providers → Email → «Confirm email».

---

## 4. Sugerencias para la app

Ordenadas por lo que creo que os ahorra más tiempo o más disgustos. Ninguna está hecha.

1. **Aviso de duplicado al crear un jugador de Captación.** Habéis limpiado cientos de fichas duplicadas por SQL (agosto). Lo barato es cortar en origen: al escribir el nombre en «Nuevo jugador», buscar con el quita-acentos de `lib/texto.ts` y enseñar «¿Es este? · Víctor Peña · Villarreal Juv A · 3 informes» con un botón para abrirlo en vez de crear otro. Lo mismo al crear partidos (ya existe la fusión manual; mejor no tener que usarla).

2. **Informes sin cobertura en el campo.** Los scouts escriben en gradas con mala señal. Guardar el borrador del informe en el dispositivo mientras se escribe (por jugador) y, si el envío falla, dejarlo en una cola que reintente al volver la conexión, con un indicador «1 informe pendiente de enviar». Hoy un fallo de red al pulsar Guardar significa reescribir.

3. **Vista «Mi día» para scouts y encargados.** La información existe pero está en cuatro pestañas: partidos asignados hoy (banner del Dashboard), acciones del pipeline Firmar vencidas, tareas del día y postpartidos sin hacer. Una sola lista ordenada por hora, con botones de «Visto», «Hecho» y «Llamar», sobre todo en móvil.

4. **Recordatorio diario por correo (o notificación) de acciones del pipeline vencidas.** Ya tenéis Resend y una Edge Function: un cron a las 8:00 que mande a cada encargado sus «próxima acción» vencidas y sus tareas del día. Es la pieza que hace que el pipeline no se enfríe sin que nadie tenga que abrir la app.

5. **Historial de cambios en fichas (quién cambió qué y cuándo).** Un trigger en Postgres que copie la fila anterior a una tabla `audit_log` para jugadores, negociaciones, tarjetas de Firmar y clubes. Resuelve tres cosas a la vez: saber quién puso ese teléfono, deshacer un cambio equivocado, y la pregunta recurrente de «¿esto lo cambió alguien o se ha perdido?». Sin tocar el front.

6. **Detección de conflicto al editar.** Al guardar jugador/club/negociación, mandar el `updated_at` que se leyó y que la actualización falle si ha cambiado (`.eq('updated_at', visto)`); si falla, «Otro usuario ha modificado esta ficha, ¿recargar o sobrescribir?». Con la auditoría del punto 5, incluso puede mostrar qué cambió el otro.

7. **Registro de errores del cliente.** El `ErrorBoundary` del 18 de agosto evita la pantalla en blanco, pero tú solo te enteras si alguien te manda la captura. Un `insert` en una tabla `client_errors` (mensaje, stack, usuario, versión de build, ruta) desde el boundary y desde `window.onerror`, y una pestaña en Admin que los liste. Diez líneas y dejas de depender de que te avisen.

8. **Comprobación automática en cada push.** Tenéis `tsc`, `vitest` y ESLint, pero se ejecutan solo si alguien se acuerda. Un workflow de GitHub Actions de 15 líneas que los lance en cada push y marque en rojo el commit en GitHub Desktop antes de que Vercel despliegue. Hoy `eslint` reporta 50 problemas heredados (la mayoría del plugin nuevo de React 19: componentes creados en render, `setState` síncrono en efectos); merece una tanda de limpieza para dejarlo a cero y poder exigirlo.

9. **Partir `Captacion.tsx` (9.300 líneas) y `Distribution.tsx` (5.400).** No cambia nada para el usuario, pero cada revisión y cada cambio cuestan el doble. Cortes limpios que ya reciben todo por props: el módulo Firmar entero (~2.300 líneas), la ficha de partido con pegado de alineaciones, Conclusiones, Contratos, y el panel de jugador con su formulario de informe. En Distribución, una pestaña por fichero y un hook con los índices compartidos. Con los tests actuales como red, es trabajo mecánico.

10. **Un solo proveedor de toasts.** `PlayerDetail` monta siete `useToast` + `ToastStack` (uno por pestaña) y se pasa `showToast` por props por media app. Un `ToastProvider` en `App` con `useToast()` de contexto elimina duplicados superpuestos y decenas de props.

11. **Paginación por cursor en las lecturas grandes.** Las 12 páginas de `scouting_reports` se leen por offset; si alguien inserta un informe entre la página 1 y la 12 (pasa constantemente: cada evento realtime relanza la lectura en todos los navegadores), una fila se repite o se salta. Mitigación barata ahora: deduplicar por id al final de `leerTodo` y descartar respuestas que lleguen fuera de orden. Solución de fondo: cursor por `id` o una función RPC que devuelva todo de una vez.

12. **Pequeños roces vistos por el camino** (cada uno, minutos): el placeholder de Partidos dice «Buscar equipo, jugador…» pero no busca por jugador; las listas de equipos/categorías se ordenaban sin comparador (Álava detrás de Zaragoza — arreglado en Captación, quedan otras); ESC en el panel de Firmar pierde las notas escritas (solo se guardan en `blur`); `AddTaskModal` de la ficha del jugador aún crea `createdAt` con el día UTC; keys de React por nombre en listas donde puede haber homónimos.

---

*Revisión sobre el código del 22-ago-2026 (último commit «update distribucion»). Lo del punto 1 está en tu carpeta y compila; los puntos 2 y 3 necesitan una decisión tuya; el 4 son propuestas.*
