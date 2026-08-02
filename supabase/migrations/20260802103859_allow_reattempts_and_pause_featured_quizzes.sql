/*
# Allow reattempts on featured mock tests

## Overview
Previously, each user could attempt a featured mock test only once, enforced by
a UNIQUE(user_id, featured_quiz_id) constraint. This change removes that
constraint so users can reattempt mock tests multiple times, and adds an
attempt_number column to track which attempt it is.

## Changes
1. `featured_quiz_attempts` table:
   - Added `attempt_number` (int, not null, default 1) — tracks attempt sequence per user per quiz
   - Dropped the UNIQUE(user_id, featured_quiz_id) constraint that blocked reattempts
   - Added a new UNIQUE(user_id, featured_quiz_id, attempt_number) so attempts are unique by number
   - Backfilled attempt_number for existing rows (all set to 1)

## Security
- No policy changes. RLS remains owner-scoped (auth.uid() = user_id) for all CRUD.
- No data is lost — existing attempt rows are preserved.
*/

-- Add attempt_number column
ALTER TABLE featured_quiz_attempts
  ADD COLUMN IF NOT EXISTS attempt_number int NOT NULL DEFAULT 1;

-- Backfill existing rows to attempt_number = 1
UPDATE featured_quiz_attempts SET attempt_number = 1 WHERE attempt_number IS NULL;

-- Drop the old unique constraint that limited one attempt per user per quiz
ALTER TABLE featured_quiz_attempts DROP CONSTRAINT IF EXISTS featured_quiz_attempts_user_id_featured_quiz_id_key;

-- Add new unique constraint allowing multiple attempts, each with a unique number
CREATE UNIQUE INDEX IF NOT EXISTS idx_fqa_user_quiz_attempt
  ON featured_quiz_attempts(user_id, featured_quiz_id, attempt_number);