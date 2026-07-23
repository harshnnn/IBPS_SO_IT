/*
# Add option_e support to Featured Quiz tables

## Overview
Some questions have 5 options (A, B, C, D, E). This migration adds support
for a 5th option in featured quizzes without breaking existing 4-option questions.

## Changes
1. `featured_questions` — add `option_e` column (nullable; null for 4-option questions)
2. `featured_questions` — update `correct_option` CHECK constraint to allow 'e'
3. `featured_quiz_answers` — update `selected_option` CHECK constraint to allow 'e'

## Notes
- `option_e` is nullable so existing 4-option questions are unaffected.
- CHECK constraints are dropped and recreated with the expanded value set.
*/

ALTER TABLE featured_questions ADD COLUMN IF NOT EXISTS option_e text;

DO $$
BEGIN
  ALTER TABLE featured_questions DROP CONSTRAINT IF EXISTS featured_questions_correct_option_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE featured_questions ADD CONSTRAINT fq_correct_option_check
  CHECK (correct_option IN ('a','b','c','d','e'));

DO $$
BEGIN
  ALTER TABLE featured_quiz_answers DROP CONSTRAINT IF EXISTS featured_quiz_answers_selected_option_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE featured_quiz_answers ADD CONSTRAINT fqa_selected_option_check
  CHECK (selected_option IN ('a','b','c','d','e') OR selected_option IS NULL);