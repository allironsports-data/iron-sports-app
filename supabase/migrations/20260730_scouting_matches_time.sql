-- ============================================================
-- 20260730 · Hora opcional en partidos de Captación
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table public.scouting_matches
  add column if not exists time text; -- "HH:MM", opcional
