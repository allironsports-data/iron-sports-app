-- ── Tipo de tarea «Reunión/Comida» → «Reunión» ───────────────────────
-- El tipo se llama ahora igual que el tipo de evento. La app ya trata las
-- antiguas «Reunión/Comida» como «Reunión»; esto solo deja la base limpia.
-- Opcional. Reejecutable. Ejecutar en el SQL Editor de Supabase.

update public.tasks set label = 'Reunión' where label = 'Reunión/Comida';
