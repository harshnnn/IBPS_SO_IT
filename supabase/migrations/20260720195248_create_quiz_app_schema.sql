/*
# IBPS SO IT Quiz App - Core Schema

## Overview
Creates the full schema for an IBPS SO IT exam preparation quiz app with:
- 14 chapters (subjects) in IBPS SO IT priority order
- Subtopics per chapter (priority-ordered)
- Questions (manual + AI-generated) with 4 options each
- Quiz sessions tracking per user
- Individual answer records for progress analytics
- Aggregated progress stats per chapter/subtopic

## New Tables
1. `chapters` - The 14 IBPS SO IT subjects (priority-ordered)
   - id, name, slug, priority (1=highest), description, created_at
2. `subtopics` - Subtopics within each chapter (priority-ordered)
   - id, chapter_id (FK), name, slug, priority, created_at
3. `questions` - Quiz questions (manual or AI-generated)
   - id, chapter_id (FK), subtopic_id (FK nullable), question_text, option_a..d, correct_option (a/b/c/d), explanation, source (manual/ai), difficulty, created_by (user_id), created_at
4. `quiz_sessions` - A single quiz attempt by a user
   - id, user_id (owner), chapter_id (nullable), subtopic_id (nullable), mode (manual/ai/mixed), total_questions, correct_count, started_at, completed_at
5. `user_answers` - Each answer within a quiz session
   - id, session_id (FK), user_id (owner), question_id (FK), selected_option, is_correct, answered_at
6. `user_progress` - Aggregated per-user-per-subtopic stats for fast analytics
   - id, user_id (owner), chapter_id, subtopic_id, total_attempted, correct_count, last_attempted_at (unique per user+subtopic)

## Security
- RLS enabled on all tables.
- chapters/subtopics/questions: readable by all authenticated users (shared question bank); writable only by owner (questions.created_by) for manual entry.
- quiz_sessions/user_answers/user_progress: fully owner-scoped CRUD (auth.uid() = user_id).
- All owner columns default to auth.uid().
*/

-- Chapters (14 IBPS SO IT subjects, priority-ordered)
CREATE TABLE IF NOT EXISTS chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  priority int NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chapters_select_all" ON chapters;
CREATE POLICY "chapters_select_all" ON chapters FOR SELECT TO authenticated USING (true);

-- Subtopics per chapter
CREATE TABLE IF NOT EXISTS subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  priority int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (chapter_id, slug)
);

ALTER TABLE subtopics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subtopics_select_all" ON subtopics;
CREATE POLICY "subtopics_select_all" ON subtopics FOR SELECT TO authenticated USING (true);

-- Questions (shared bank, owner-writable)
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  subtopic_id uuid REFERENCES subtopics(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_option text NOT NULL CHECK (correct_option IN ('a','b','c','d')),
  explanation text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_subtopic ON questions(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_questions_source ON questions(source);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "questions_select_all" ON questions;
CREATE POLICY "questions_select_all" ON questions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "questions_insert_own" ON questions;
CREATE POLICY "questions_insert_own" ON questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "questions_update_own" ON questions;
CREATE POLICY "questions_update_own" ON questions FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "questions_delete_own" ON questions;
CREATE POLICY "questions_delete_own" ON questions FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Quiz sessions (owner-scoped)
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL,
  subtopic_id uuid REFERENCES subtopics(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','ai','mixed')),
  total_questions int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_chapter ON quiz_sessions(chapter_id);

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_select_own" ON quiz_sessions;
CREATE POLICY "sessions_select_own" ON quiz_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "sessions_insert_own" ON quiz_sessions;
CREATE POLICY "sessions_insert_own" ON quiz_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "sessions_update_own" ON quiz_sessions;
CREATE POLICY "sessions_update_own" ON quiz_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "sessions_delete_own" ON quiz_sessions;
CREATE POLICY "sessions_delete_own" ON quiz_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- User answers (owner-scoped, child of session)
CREATE TABLE IF NOT EXISTS user_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option text CHECK (selected_option IN ('a','b','c','d')),
  is_correct boolean NOT NULL DEFAULT false,
  answered_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_answers_user ON user_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_session ON user_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON user_answers(question_id);

ALTER TABLE user_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "answers_select_own" ON user_answers;
CREATE POLICY "answers_select_own" ON user_answers FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "answers_insert_own" ON user_answers;
CREATE POLICY "answers_insert_own" ON user_answers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "answers_update_own" ON user_answers;
CREATE POLICY "answers_update_own" ON user_answers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "answers_delete_own" ON user_answers;
CREATE POLICY "answers_delete_own" ON user_answers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- User progress (aggregated per user+subtopic, owner-scoped)
CREATE TABLE IF NOT EXISTS user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  subtopic_id uuid REFERENCES subtopics(id) ON DELETE CASCADE,
  total_attempted int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  last_attempted_at timestamptz DEFAULT now(),
  UNIQUE (user_id, subtopic_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_chapter ON user_progress(chapter_id);

ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "progress_select_own" ON user_progress;
CREATE POLICY "progress_select_own" ON user_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "progress_insert_own" ON user_progress;
CREATE POLICY "progress_insert_own" ON user_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "progress_update_own" ON user_progress;
CREATE POLICY "progress_update_own" ON user_progress FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "progress_delete_own" ON user_progress;
CREATE POLICY "progress_delete_own" ON user_progress FOR DELETE TO authenticated USING (auth.uid() = user_id);
