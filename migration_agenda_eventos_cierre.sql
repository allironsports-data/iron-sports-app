-- ══════════════════════════════════════════════════════════════════════
-- AGENDA_EVENTOS · cierre de reuniones
--
-- Una reunión o visita con un jugador del pipeline se «cierra» cuando ya
-- ha pasado: quien asistió apunta el recap y el siguiente paso (que va a
-- la próxima acción de su tarjeta de Firmar). Hasta cerrarla, sale como
-- pendiente en Mi día y en los avisos del Pipeline.
--
--   recap        → qué salió de la reunión
--   cerrado_at   → cuándo se cerró
--   cerrado_por  → quién la cerró (profiles.id)
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente. Mientras no se
-- ejecute, la app funciona igual: el cierre se guarda sin estas columnas
-- (queda solo en el historial de la tarjeta) y la reunión no deja de
-- salir como pendiente.
-- ══════════════════════════════════════════════════════════════════════

alter table public.agenda_eventos
  add column if not exists recap       text,
  add column if not exists cerrado_at  timestamptz,
  add column if not exists cerrado_por uuid references public.profiles(id) on delete set null;

-- Realtime: el Pipeline lee los eventos para los avisos de «reunión sin cerrar»
do $$
begin
  alter publication supabase_realtime add table public.agenda_eventos;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

select count(*) as eventos, count(cerrado_at) as cerrados from public.agenda_eventos;
