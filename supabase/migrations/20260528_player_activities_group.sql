-- Add group support to player_activities
-- group_id links rows belonging to the same multi-player event
-- linked_player_ids stores all player IDs in the group (for display without extra queries)

ALTER TABLE player_activities
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS linked_player_ids text[] DEFAULT '{}';

-- Index for efficient group lookups
CREATE INDEX IF NOT EXISTS idx_player_activities_group_id
  ON player_activities (group_id)
  WHERE group_id IS NOT NULL;
