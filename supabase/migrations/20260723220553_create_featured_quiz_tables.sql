/*
# Featured Quiz Mock tables

## Overview
Adds support for public "Featured Quiz Mock" quizzes (Mock #1, Mock #2, etc.) that every
user can attempt once. Questions are fixed (same for everyone) but each user gets their
own attempt record with their own results.

## New Tables
1. `featured_quizzes` - The quiz definition (editable by admin)
   - id, title, slug, description, duration_minutes, difficulty, question_count,
     created_by (who shared it), is_active, created_at, updated_at
2. `featured_questions` - Questions belonging to a featured quiz (rich schema)
   - id, featured_quiz_id (FK), position (order within quiz), chapter (text label),
     subtopic (text label), difficulty, question_text, option_a..d, correct_option,
     explanation, exam_tip, memory_trick, common_mistake, related_concepts (text[]),
     summary_title, summary_explanation, option_explanations (jsonb: {a,b,c,d}), created_at
3. `featured_quiz_attempts` - Each user's single attempt at a featured quiz
   - id, featured_quiz_id (FK), user_id (owner), total_questions, correct_count,
     incorrect_count, skipped_count, time_taken_seconds, started_at, completed_at
   - UNIQUE(user_id, featured_quiz_id) — enforces one attempt per user
4. `featured_quiz_answers` - Per-question answers within a featured attempt
   - id, attempt_id (FK), featured_question_id (FK), user_id (owner),
     selected_option, is_correct, answered_at

## Security
- featured_quizzes: readable by all authenticated users; writable only by creator (admin)
- featured_questions: readable by all authenticated; writable only by the quiz creator
- featured_quiz_attempts: owner-scoped CRUD (auth.uid() = user_id)
- featured_quiz_answers: owner-scoped CRUD (auth.uid() = user_id)
*/

CREATE TABLE IF NOT EXISTS featured_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  duration_minutes int NOT NULL DEFAULT 30,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  question_count int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE featured_quizzes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fq_select_all" ON featured_quizzes;
CREATE POLICY "fq_select_all" ON featured_quizzes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fq_insert_own" ON featured_quizzes;
CREATE POLICY "fq_insert_own" ON featured_quizzes FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "fq_update_own" ON featured_quizzes;
CREATE POLICY "fq_update_own" ON featured_quizzes FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "fq_delete_own" ON featured_quizzes;
CREATE POLICY "fq_delete_own" ON featured_quizzes FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TABLE IF NOT EXISTS featured_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  featured_quiz_id uuid NOT NULL REFERENCES featured_quizzes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  chapter text NOT NULL DEFAULT 'General',
  subtopic text NOT NULL DEFAULT 'General',
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_option text NOT NULL CHECK (correct_option IN ('a','b','c','d')),
  explanation text,
  exam_tip text,
  memory_trick text,
  common_mistake text,
  related_concepts text[] DEFAULT '{}',
  summary_title text,
  summary_explanation text,
  option_explanations jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fq_questions_quiz ON featured_questions(featured_quiz_id);
CREATE INDEX IF NOT EXISTS idx_fq_questions_position ON featured_questions(featured_quiz_id, position);

ALTER TABLE featured_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fqq_select_all" ON featured_questions;
CREATE POLICY "fqq_select_all" ON featured_questions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fqq_insert_own" ON featured_questions;
CREATE POLICY "fqq_insert_own" ON featured_questions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM featured_quizzes WHERE id = featured_quiz_id AND created_by = auth.uid()));
DROP POLICY IF EXISTS "fqq_update_own" ON featured_questions;
CREATE POLICY "fqq_update_own" ON featured_questions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM featured_quizzes WHERE id = featured_quiz_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM featured_quizzes WHERE id = featured_quiz_id AND created_by = auth.uid()));
DROP POLICY IF EXISTS "fqq_delete_own" ON featured_questions;
CREATE POLICY "fqq_delete_own" ON featured_questions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM featured_quizzes WHERE id = featured_quiz_id AND created_by = auth.uid()));

CREATE TABLE IF NOT EXISTS featured_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  featured_quiz_id uuid NOT NULL REFERENCES featured_quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  total_questions int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  incorrect_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  time_taken_seconds int NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz DEFAULT now(),
  UNIQUE (user_id, featured_quiz_id)
);

CREATE INDEX IF NOT EXISTS idx_fqa_quiz ON featured_quiz_attempts(featured_quiz_id);
CREATE INDEX IF NOT EXISTS idx_fqa_user ON featured_quiz_attempts(user_id);

ALTER TABLE featured_quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fqa_select_own" ON featured_quiz_attempts;
CREATE POLICY "fqa_select_own" ON featured_quiz_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "fqa_insert_own" ON featured_quiz_attempts;
CREATE POLICY "fqa_insert_own" ON featured_quiz_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "fqa_update_own" ON featured_quiz_attempts;
CREATE POLICY "fqa_update_own" ON featured_quiz_attempts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "fqa_delete_own" ON featured_quiz_attempts;
CREATE POLICY "fqa_delete_own" ON featured_quiz_attempts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS featured_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES featured_quiz_attempts(id) ON DELETE CASCADE,
  featured_question_id uuid NOT NULL REFERENCES featured_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_option text CHECK (selected_option IN ('a','b','c','d') OR selected_option IS NULL),
  is_correct boolean NOT NULL DEFAULT false,
  answered_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fqa_answers_attempt ON featured_quiz_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_fqa_answers_user ON featured_quiz_answers(user_id);

ALTER TABLE featured_quiz_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fqans_select_own" ON featured_quiz_answers;
CREATE POLICY "fqans_select_own" ON featured_quiz_answers FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "fqans_insert_own" ON featured_quiz_answers;
CREATE POLICY "fqans_insert_own" ON featured_quiz_answers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "fqans_update_own" ON featured_quiz_answers;
CREATE POLICY "fqans_update_own" ON featured_quiz_answers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "fqans_delete_own" ON featured_quiz_answers;
CREATE POLICY "fqans_delete_own" ON featured_quiz_answers FOR DELETE TO authenticated USING (auth.uid() = user_id);