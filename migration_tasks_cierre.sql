-- ══════════════════════════════════════════════════════════════════════
-- TASKS · cierre por tipo
--
-- Una tarea es una promesa; completarla es contar qué pasó. Cada tipo de
-- tarea tiene su cierre (ver src/lib/cierreTarea.ts): una llamada pide si
-- contestó, una reunión el recap, un videoanálisis el vídeo, una
-- negociación el resultado… Aquí se guarda ese cierre en la propia tarea
-- y el enlace a lo que dejó (evento, actividad, sesión, postpartido).
--
--   cierre_resultado → contesto | no_contesto | celebrada | no_celebrada |
--                      comida | visita | acordado | rechazado | aplazado |
--                      descartado | seguir | llamar | sin_novedad | …
--   cierre_nota      → recap / lo que se acordó / enlace
--   cierre_ref       → { eventoId, activityId, videoSessionId,
--                        postpartidoId, siguienteTaskId }
--
-- agenda_eventos.task_id → el evento que nace de completar una tarea
-- apunta de vuelta a ella.
--
-- También renombra dos etiquetas: «General» → «Otra», «Visita» →
-- «Comida/Visita» (la app ya lee las antiguas con el nombre nuevo).
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente. Mientras no se
-- ejecute, la app funciona igual: el cierre se hace (evento, actividad…)
-- pero no queda guardado en la tarea.
-- ══════════════════════════════════════════════════════════════════════

alter table public.tasks
  add column if not exists cierre_resultado text,
  add column if not exists cierre_nota      text,
  add column if not exists cierre_ref       jsonb;

alter table public.agenda_eventos
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

create index if not exists agenda_eventos_task_id_idx
  on public.agenda_eventos (task_id)
  where task_id is not null;

update public.tasks set label = 'Otra'          where label = 'General';
update public.tasks set label = 'Comida/Visita' where label = 'Visita';

select label, status, count(*) from public.tasks group by 1, 2 order by 1, 2;
