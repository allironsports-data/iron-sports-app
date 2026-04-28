-- =====================================================
-- Add 'updates' JSONB column to club_negotiations
-- Stores an array of update/comment objects:
--   { id: string, text: string, date: string, author?: string }
-- Run once in Supabase SQL Editor
-- =====================================================

ALTER TABLE club_negotiations
  ADD COLUMN IF NOT EXISTS updates JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Verify
SELECT id, status, updates FROM club_negotiations LIMIT 5;
