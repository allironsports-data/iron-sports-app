-- Pipeline → Firmar: una próxima acción de tipo «Reunión» con fecha crea su
-- evento en la agenda (hora, lugar y asistentes se completan desde el
-- evento) y entra en el circuito de cierre (recap + siguiente paso).
-- Esta columna guarda qué evento es. Sin ella la app funciona igual pero
-- la reunión no se crea como evento. Reejecutable.
alter table public.captacion_firmas add column if not exists next_action_evento_id uuid;
