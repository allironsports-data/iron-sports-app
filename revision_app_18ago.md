# Revisión en profundidad de la app — 18 de agosto de 2026

Cuatro revisiones en paralelo sobre las 60.000 líneas del proyecto: datos y sincronización, rendimiento, flujo de trabajo, y robustez y seguridad. Abajo está lo que he encontrado, lo que ya he arreglado y lo que queda por decidir.

Antes de nada, lo justo: la app está muy bien construida para lo que es. Hay confirmación y deshacer en las acciones destructivas, vistas específicas para móvil en las pantallas que más se usan en el campo, buscador global, carga diferida por secciones e indicador de guardado. Los problemas de abajo son puntos concretos donde ese cuidado se rompe, no un desastre general.

---

## 1. Arreglado ya (compilado y en tu disco)

### Pérdida silenciosa de datos — lo más grave

Supabase corta cualquier consulta en **1.000 filas sin avisar**. Ya lo sufriste con los jugadores de un partido que no aparecían. La revisión ha encontrado que quedaban tres consultas sin paginar:

- **`players`** — tu plantilla de representados. Al pasar de 1.000 jugadores, los que sobren desaparecen del Dashboard, de Tareas, de Distribución y de los avisos. Sin ningún error.
- **`tasks`** — las tareas van ordenadas de más nueva a más vieja, así que al pasar de 1.000 se perderían **las más antiguas**, que son justo las que llevan tiempo abiertas.
- **`boulema_players`** — la tabla aún es pequeña, pero tenía el mismo fallo esperando.

Las tres paginadas. Además, cuatro consultas se tragaban los errores en silencio: si fallaba la red a mitad de carga, veías una lista vacía y parecía «no hay datos» en vez de «no se ha podido cargar». Ahora queda registrado en la consola con cuántas filas había leído.

### Tareas que salían vencidas el mismo día

`new Date('2026-08-18')` en JavaScript significa medianoche **UTC**, que en España son las 2:00 de la madrugada. Por eso una tarea que vencía *hoy* aparecía en rojo como «Vencida» durante todo el día en el panel de detalle. Y al revés en el Dashboard: entre medianoche y las 2:00, «hoy» todavía era ayer, así que las tareas del día no contaban como vencidas. Ambos corregidos comparando a mediodía local, que es como ya se hacía en otras cuatro partes del Dashboard: era una inconsistencia, no una decisión.

### Pantalla en blanco sin salida

No había ninguna red de seguridad: cualquier error al pintar la interfaz —un dato inesperado, una fecha corrupta— dejaba la app **completamente en blanco**, sin mensaje ni forma de recuperarse. Y si el dato venía de la base de datos, volvía a pasar al recargar y bloqueaba a todo el equipo en esa sección. He añadido una pantalla de error con botón de recargar, de volver al inicio y el detalle técnico plegado para que puedas mandarme una captura.

### Sincronización que faltaba

`scouting_players` no estaba suscrita a los cambios en vivo, aunque varios scouts la tocan a la vez: valoración, fin de contrato, campograma de mercado. Si otro cambiaba algo, tú no lo veías hasta recargar. Ya está. De paso he quitado una recarga duplicada de tareas: cada cambio disparaba dos lecturas completas de la tabla en todos los navegadores conectados.

### Rendimiento: de millones de comparaciones a ninguna

Tres puntos donde el trabajo crecía multiplicando:

| Dónde | Antes | Ahora |
|---|---|---|
| Tabla de Distribución | 3 recorridos completos de negociaciones **por fila** | un índice calculado una vez |
| Tarjetas de club (hasta 1.400 a la vez) | cada tarjeta recorría **todas** las negociaciones, dos veces | cada tarjeta recibe solo las suyas |
| Pipeline de Distribución | por cada tecla del buscador, buscaba jugador + club + entrada en las listas completas | tres índices, búsqueda directa |
| Tabla de jugadores de Captación | 50 filas × 10.000 informes = 500.000 comparaciones por tecla | un contador precalculado |

El patrón correcto ya existía en el propio código (`llamarCountByPlayer` en Captación) — simplemente no se había aplicado en el resto.

### Móvil y datos que se perdían

- Los botones de editar y borrar un apunte del pipeline solo aparecían **al pasar el ratón**: en el móvil eran invisibles, así que un scout no podía corregir una nota desde el campo. Ahora se ven siempre por debajo de tamaño tablet.
- Los campos de «edad máxima» aceptaban texto: al escribir algo no numérico se guardaba vacío sin avisar. Ahora se ignora el valor inválido en vez de borrar el dato.
- **Contactos** lleva ahora un aviso visible de «⚠ Solo en este dispositivo» (ver punto 3).

---

## 2. Lo que tienes que ejecutar tú — `revision_seguridad.sql`

Esto es lo más serio del informe y no puedo aplicarlo desde aquí.

**Cualquier usuario con sesión abierta puede hacerse administrador.** La app es 100% cliente: la comprobación de si eres admin vive en el botón, no en la base de datos. Con la consola del navegador, cualquiera de tu equipo —incluida una cuenta «solo Captación»— puede lanzar la llamada que pone `is_admin = true` en su propia ficha. Lo mismo aplica a quitarse la restricción de Captación.

Por la misma razón, **la restricción «solo Captación» es solo pintura**: esa cuenta ya tiene cargados en memoria los teléfonos, contratos y enlaces a pasaportes de todos los jugadores, aunque la interfaz no se los enseñe, y puede leer o escribir en cualquier tabla si no hay políticas RLS que lo impidan.

El script tiene tres partes: **la primera solo mira** y te dice qué tablas tienen la protección RLS activada y cuáles están abiertas de par en par (esa lista es la que quiero ver). La segunda pone un candado en la base de datos para que solo un admin pueda cambiar permisos — lo he probado en una base local: el no-admin recibe un error, el admin sigue pudiendo pulsar sus botones, y cada uno puede cambiarse su propio nombre. La tercera impide que dos personas creen la misma tarjeta duplicada en el pipeline.

Mándame el resultado de la parte 1 y te digo exactamente qué políticas faltan.

---

## 3. Decisiones que dependen de ti

**Contactos vive solo en tu navegador.** La sección entera guarda en `localStorage`: contactos añadidos, correcciones, favoritos y borrados. Si un agente corrige el teléfono de un director deportivo desde su móvil, **nadie más lo ve nunca**, y se pierde si cambia de dispositivo o limpia el navegador. De momento he puesto un aviso visible para que nadie se confíe. Pasarlo a la base de datos como el resto de la app es medio día de trabajo y creo que merece mucho la pena.

**Los pasaportes se firman con enlaces de 10 años.** Si uno se filtra —una captura, un WhatsApp reenviado— da acceso al documento durante una década y no se puede revocar salvo borrando el fichero. Lo correcto es firmarlos al abrirlos con una hora de validez, como ya se hace con los adjuntos de las tareas. Cambio de código pequeño, dime y lo hago.

**Dos personas editando el mismo jugador: gana el último.** Si tú abres la ficha de un jugador y un compañero cambia otro dato mientras tanto, al guardar tú se pierde lo suyo sin ningún aviso. Se arregla comprobando la fecha de modificación antes de guardar y avisando («esto lo ha tocado otro, ¿sobrescribo?»).

**Aviso de contratos que no lleva a ninguna parte.** El aviso de contratos de representación a punto de expirar se le muestra a todo el mundo en el Dashboard, pero la ficha del contrato solo la ven los admin: un scout pulsa «Abrir ficha» y no encuentra nada. O se oculta el aviso a quien no puede actuar, o se le enseña la ficha en modo lectura.

---

## 4. Siguientes pasos que propongo, por orden

1. **Ejecutar `revision_seguridad.sql`** y mandarme el diagnóstico. Es lo único con riesgo real hoy.
2. **Contactos a la base de datos** — es la funcionalidad que más silenciosamente os está fallando.
3. **Modal de edición con protección de cambios**: hoy un toque fuera del modal de negociación descarta la nota que acabas de escribir, sin preguntar.
4. **Vista de edición rápida en móvil**: la tabla de 13 columnas de Captación → Jugadores es inservible con el pulgar, pero el botón para abrirla se ve igual en el teléfono. O se oculta, o se hace una versión de fichas.
5. **Objetivos táctiles del tablero de tareas**: el círculo para cambiar el estado de una tarea mide 16 píxeles. Es la acción más repetida del día y en el móvil se falla constantemente. En Partidos ya se arregló subiéndolo a 40 píxeles; falta hacer lo mismo aquí.

---

*Revisión hecha sobre el código del 18-ago-2026. Todo lo del punto 1 está compilado (TypeScript sin errores, build correcto) y guardado en tu carpeta; falta desplegar.*
