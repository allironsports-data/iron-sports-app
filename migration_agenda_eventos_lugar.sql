-- ── Lugar de los eventos de agenda ───────────────────────────────────
-- Dónde es la reunión, la visita, la comida… Opcional. Hasta ejecutar
-- esto, el lugar se ignora al guardar un evento.
-- Ejecutar en el SQL Editor de Supabase.

alter table public.agenda_eventos add column if not exists lugar text;
