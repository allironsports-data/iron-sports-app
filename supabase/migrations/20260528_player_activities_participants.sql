-- Add participant_profile_ids to track which staff members were present at an event
ALTER TABLE player_activities
  ADD COLUMN IF NOT EXISTS participant_profile_ids text[] DEFAULT '{}';
