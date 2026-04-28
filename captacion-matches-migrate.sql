-- ─────────────────────────────────────────────────────────────────
-- MIGRACIÓN: añadir view_mode y status a scouting_matches
-- Ejecutar UNA VEZ en Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- 1. Nuevas columnas
ALTER TABLE public.scouting_matches
  ADD COLUMN IF NOT EXISTS view_mode text,   -- 'video' | 'campo'
  ADD COLUMN IF NOT EXISTS status    text DEFAULT 'pendiente';  -- 'pendiente' | 'visto'

-- 2. Extraer view_mode de los datos históricos (campo si notes contiene "(campo)")
UPDATE public.scouting_matches
SET
  view_mode = CASE
    WHEN notes LIKE '%(campo)%' THEN 'campo'
    ELSE 'video'
  END,
  notes = TRIM(
    REPLACE(REPLACE(notes, ' (campo)', ''), '(campo)', '')
  )
WHERE view_mode IS NULL;

-- 3. Marcar como 'visto' todos los partidos ya cargados (son datos históricos)
UPDATE public.scouting_matches
SET status = 'visto'
WHERE status IS NULL OR status = 'pendiente';
