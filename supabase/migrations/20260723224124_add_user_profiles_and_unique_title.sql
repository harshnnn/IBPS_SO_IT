/*
# Add user_profiles table and unique title constraint on featured_quizzes

## Overview
1. Creates a `user_profiles` table that stores each user's email so the app can
   display "Shared by <email>" instead of "Admin" for featured quizzes.
   The `auth.users` table is not queryable with the anon key, so we mirror the
   email into a public table.
2. Adds a UNIQUE constraint on `featured_quizzes.title` so two different quizzes
   can never share the same name (prevents accidental duplicates).

## New Tables
- `user_profiles`
  - `user_id` (uuid, primary key, references auth.users ON DELETE CASCADE)
  - `email` (text, not null)
  - `created_at` (timestamptz)

## Modified Tables
- `featured_quizzes` — add UNIQUE constraint on `title`

## Security
- `user_profiles`: each authenticated user can read all profiles (needed to show
  creator emails) and insert/update only their own row.
*/

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "up_select_all" ON user_profiles;
CREATE POLICY "up_select_all" ON user_profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "up_insert_own" ON user_profiles;
CREATE POLICY "up_insert_own" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "up_update_own" ON user_profiles;
CREATE POLICY "up_update_own" ON user_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "up_delete_own" ON user_profiles;
CREATE POLICY "up_delete_own" ON user_profiles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Backfill profiles for existing auth users
INSERT INTO user_profiles (user_id, email)
SELECT id, email FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.users.id);

-- Prevent duplicate quiz titles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'featured_quizzes_title_key'
  ) THEN
    ALTER TABLE featured_quizzes ADD CONSTRAINT featured_quizzes_title_key UNIQUE (title);
  END IF;
END $$;