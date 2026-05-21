-- Add country and nationality fields to boulema_peticiones
ALTER TABLE boulema_peticiones
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS nationality text;
