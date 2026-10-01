-- ── Viajes en la agenda ──────────────────────────────────────────────
-- Un viaje es un evento de tipo «Viaje» que dura varios días y tiene un
-- destino: fecha_fin = último día; zona = zona geográfica del destino
-- (para sugerir a qué jugadores del pipeline visitar). La ciudad va en
-- `lugar`. Hasta ejecutar esto, un viaje se guarda como evento de un día.
-- Reejecutable. Ejecutar en el SQL Editor de Supabase.

alter table public.agenda_eventos add column if not exists lugar     text;
alter table public.agenda_eventos add column if not exists fecha_fin date;
alter table public.agenda_eventos add column if not exists zona      text;
