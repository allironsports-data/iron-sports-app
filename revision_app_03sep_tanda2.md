# Tanda 2 — «Dale a todas» — 3 de septiembre de 2026

Continuación de `revision_app_02sep.md`. Se han hecho las 5 decisiones técnicas del punto 3 (menos la temporada, que dijiste no tocar) y las 12 sugerencias del punto 4. Todo compilado: `tsc` limpio, `vite build` correcto, **135 tests** (eran 49), **ESLint a cero** (eran 50 avisos heredados). Los 5 scripts SQL nuevos se han ejecutado dos veces contra un PostgreSQL 16 local con una simulación de Supabase (roles, `auth.uid()`, RLS, tus funciones `es_cuenta_activa`/`es_admin`…) y pasan con pruebas funcionales de permisos; uno tenía un fallo real que ya está corregido (ver abajo).

---

## 1. Qué hay de nuevo (para el equipo)

**Mi día** (☀️ en la barra inferior y en el menú de escritorio). Partidos de hoy asignados, acciones del pipeline Firmar vencidas, tareas del día y postpartidos sin hacer, en una sola lista ordenada (vencidos primero, luego por hora) con botones grandes «Visto» / «Hecho» / «Abrir». El admin puede mirar el día de otra persona (solo lectura). Las cuentas «solo Captación» también lo tienen.

**Aviso de duplicado** al crear un jugador de Captación o un partido: con cuatro letras escritas aparece «¿Es alguno de estos?» con nombre · equipo · nº de informes y un botón «Abrir» que salta a la ficha existente.

**Informes sin cobertura.** El formulario de informe guarda borrador en el móvil mientras se escribe (se recupera al volver a abrir el mismo jugador). Si al pulsar Guardar no hay red, el informe se encola y se envía solo al volver la señal, al abrir la app o cada minuto; chip «📡 N pendientes» en la cabecera de Captación con el último error y clic para reintentar.

**Firmar sin pisarse.** Cada cambio en una tarjeta parchea solo su campo sobre el estado más reciente (con cola por tarjeta), así que notas + apunte en el mismo gesto, dos apuntes rápidos o «Deshacer» ya no se borran entre sí. Las notas se autoguardan mientras se escribe y al cerrar con ESC.

**Mismo club ≠ mismo equipo.** «Villarreal Juv B» → «Villarreal Juv A» ahora se detecta como cambio de equipo dentro del club (aviso en Firmar, y Pegar alineación / Actualizar plantilla proponen corregir la categoría). Los sugeridos de partido siguen a nivel de club, como querías.

**Conflictos al editar.** Si dos personas editan a la vez un jugador, un club o una negociación, la segunda ve «Otro usuario ha modificado esta ficha» con la tabla de campos que difieren y elige «Recargar (perder mis cambios)» o «Sobrescribir». Requiere ejecutar `migration_updated_at_triggers.sql`; hasta entonces la app guarda como antes y lo avisa en consola.

**Contactos compartidos.** La agenda pasa a Supabase con favoritos por usuario y actualización en vivo. Hasta que pulses «Importar ahora» (solo admin) sigue funcionando en cada navegador como hasta ahora, así nadie se queda sin contactos entre el deploy y la migración.

**Historial de cambios** en la ficha del jugador y del club (sección plegada al final de Info), y Admin → Historial con filtro por tabla y búsqueda por id: quién cambió qué y cuándo, con antes → después.

**Admin → Errores.** Cualquier pantalla en blanco o excepción no controlada queda registrada (usuario, versión, ruta, mensaje, stack). Ya no dependes de que alguien te mande una captura.

**Modelo «Llamar»** entrena en un Web Worker con barra de progreso y recuerda el resultado hasta que cambian los informes; botón «Reentrenar».

**Correo diario** a cada persona con sus partidos, acciones vencidas y tareas del día (se activa en el punto 2).

Pequeños: el buscador de Partidos también encuentra por jugador vinculado; todas las listas con acentos ordenadas con `localeCompare('es')`; keys por id donde podía haber homónimos; `createdAt` de tareas desde la ficha del jugador con timestamp completo.

## 2. Qué tienes que hacer tú, en orden

1. **SQL** (editor de Supabase, cada script entero; todos son reejecutables):
   1. `migration_updated_at_triggers.sql` — conflictos al editar.
   2. `migration_audit_log.sql` — historial (necesita `es_cuenta_activa`/`es_captacion_only`, que ya tienes por los scripts de seguridad).
   3. `migration_client_errors.sql` — errores de cliente (necesita `es_admin`).
   4. `migration_contactos_supabase.sql` — contactos.
   5. `migration_cron_resumen_diario.sql` — **edítalo antes**: sustituye `<project-ref>` y `<CAMBIA-ESTO-POR-EL-CRON_SECRET>`. Ojo: si lo reejecutas sin editar pisa los valores reales.
2. **Edge Functions**: `supabase secrets set CRON_SECRET="$(openssl rand -hex 32)" APP_URL="https://<tu-dominio>"`, luego `supabase functions deploy crear-usuario`, `supabase functions deploy resumen-diario --no-verify-jwt`, y las dos de la tanda anterior (`notify-task` con `WEBHOOK_SECRET` + cabecera en el webhook, `leer-partido`).
3. **Front**: deploy normal. Después, entrar en Contactos como admin **desde el navegador que tenga los datos locales buenos** y pulsar «Importar ahora» (una sola vez; es upsert).
4. **Probar el correo**: `curl -X POST https://<ref>.supabase.co/functions/v1/resumen-diario -H "x-cron-secret: <secreto>" -H "Content-Type: application/json" -d '{"dry": true}'` devuelve el resumen sin enviar; `{"solo":"<profile_id>"}` envía a uno. El cron está a las 06:00 UTC (08:00 en verano, 07:00 en invierno; cambia a `0 7` en octubre si quieres 08:00 fijas).
5. **CI**: al hacer push, GitHub Actions ejecuta tsc + tests + eslint + build (`.github/workflows/ci.yml`). Sin configurar nada más.

## 3. Lo que NO he tocado, por decisión tuya

La temporada de Distribución sigue en «2025-26» (`CURRENT_SEASON`). Cuando quieras arrancar la 26-27, la propuesta sigue siendo `temporadaActual()` + botón «Abrir temporada» que copie las entradas activas.

## 4. Cambios técnicos (para ti)

- `Captacion.tsx` (9.300 líneas) → `src/views/captacion/` (26 ficheros, el mayor 1.700): raíz + pestañas + `firmas/` + `partidos/` + `PlayerPanel`. `Distribution.tsx` (5.400) → `src/views/distribution/` + `src/lib/distribution.ts` (lógica pura con 17 tests; `suggestPlayersForNeed` compartida con ClubDetail). Los ficheros antiguos quedan como reexport, así que App no cambia. Único cambio visible: el orden de los filtros del pipeline en escritorio (ahora un solo bloque móvil/escritorio).
- Lecturas paginadas: `dedupePorId` en `leerTodo` y en los 13 bucles a mano; `refetchTable` descarta respuestas fuera de orden.
- `ToastProvider` único; `useToast()` cae al contexto si existe, así que las vistas no migradas siguen funcionando sin duplicar toasts.
- Nuevas libs con tests: `equipos` (equipoMatchKind/categoriaDe), `duplicados` (Levenshtein), `colaInformes`, `miDia`, `modeloLlamar` (+ worker), `coleccion`, `formato`, `distribution`, `dbContactos`, `dbAudit`, `dbErrors`.
- ESLint: única regla desactivada, `react-refresh/only-export-components` en `src/main.tsx` (punto de entrada sin exports). Todo lo demás resuelto moviendo código.
- El SQL de `updated_at` tenía un fallo real que la prueba en Postgres cazó: en `captacion_firmas` la columna ya existía sin `default`, `add column if not exists` la saltaba y las tarjetas nuevas habrían nacido con `updated_at` NULL. Corregido con `set default now()`.

## 5. Siguientes pasos que propongo

1. Ejecutar los SQL y desplegar (punto 2); mandarme cualquier `NOTICE` raro del editor.
2. Cuando lleve una semana en producción: mirar Admin → Errores y Admin → Historial para ver si el volumen de `audit_log` en `scouting_reports` (guarda antes/después completos) aconseja retención a 6 meses en vez de 12.
3. Temporada 2026-27 cuando decidas.
4. Migrar `Captación`, `Distribución`, `Boulema` y `Contactos` del `useToast` local al `ToastProvider` (ahora mismo funcionan por el fallback; es limpieza).
