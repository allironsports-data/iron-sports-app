-- ── Tareas recurrentes ───────────────────────────────────────────────
-- tasks.recurrence: null = no se repite · 'semanal' · 'mensual'.
-- Al completar una tarea que se repite, la app crea la siguiente con la
-- fecha calculada. Hasta ejecutar esto, «Repetir» se ignora al guardar.
-- Ejecutar en el SQL Editor de Supabase.

alter table public.tasks
  add column if not exists recurrence text
  check (recurrence is null or recurrence in ('semanal', 'mensual'));

-- Prioridad: NO hace falta migración. tasks.priority ya existe
-- ('alta' | 'media' | 'baja'); la app solo distingue ahora entre «alta»
-- (punto rojo) y el resto («normal»).
