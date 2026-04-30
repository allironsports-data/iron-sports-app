-- Add optional label/type column to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS label text;
