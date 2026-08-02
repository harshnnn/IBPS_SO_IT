/*
# Add score recalculation function for featured quizzes

## Overview
When a quiz creator edits a question (text, options, or correct answer), the
scores of all existing attempts on that quiz should be automatically updated
to reflect the new correct answer. This migration adds a SECURITY DEFINER
function that recalculates correct_count, incorrect_count, and skipped_count
for every attempt of a given featured quiz, based on the current
featured_questions.correct_option values.

## New Functions
1. `recalculate_featured_quiz_scores(featured_quiz_id uuid)` — SECURITY DEFINER
   - For every attempt of the quiz, re-derives is_correct for each answer
     by comparing the stored selected_option against the current correct_option
     on the featured_questions row.
   - Updates featured_quiz_answers.is_correct for all answers in those attempts.
   - Updates featured_quiz_attempts.correct_count, incorrect_count,
     skipped_count for each attempt.
   - Returns a summary: number of attempts updated and answers corrected.
   - Callable only by authenticated users (EXECUTE granted to authenticated).
   - Safe to call repeatedly — idempotent.

## Security
- SECURITY DEFINER so it can update all attempts regardless of which user owns them.
- EXECUTE granted to authenticated only.
- No RLS changes needed — the function operates with definer privileges.
*/

CREATE OR REPLACE FUNCTION recalculate_featured_quiz_scores(p_quiz_id uuid)
RETURNS TABLE(attempts_updated int, answers_corrected int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts_updated int := 0;
  v_answers_corrected int := 0;
  v_attempt RECORD;
  v_answer RECORD;
  v_new_is_correct boolean;
  v_correct_count int;
  v_incorrect_count int;
  v_skipped_count int;
BEGIN
  -- Recalculate is_correct for every answer across all attempts of this quiz
  FOR v_answer IN
    SELECT a.id, a.selected_option, q.correct_option, a.attempt_id
    FROM featured_quiz_answers a
    JOIN featured_questions q ON q.id = a.featured_question_id
    WHERE q.featured_quiz_id = p_quiz_id
  LOOP
    v_new_is_correct := (v_answer.selected_option IS NOT NULL
      AND v_answer.selected_option = v_answer.correct_option);

    UPDATE featured_quiz_answers
      SET is_correct = v_new_is_correct
      WHERE id = v_answer.id;

    IF v_new_is_correct THEN
      v_answers_corrected := v_answers_corrected + 1;
    END IF;
  END LOOP;

  -- Recalculate aggregate counts for each attempt
  FOR v_attempt IN
    SELECT id FROM featured_quiz_attempts WHERE featured_quiz_id = p_quiz_id
  LOOP
    SELECT
      COUNT(*) FILTER (WHERE is_correct = true),
      COUNT(*) FILTER (WHERE is_correct = false AND selected_option IS NOT NULL),
      COUNT(*) FILTER (WHERE selected_option IS NULL)
    INTO v_correct_count, v_incorrect_count, v_skipped_count
    FROM featured_quiz_answers
    WHERE attempt_id = v_attempt.id;

    UPDATE featured_quiz_attempts
      SET
        correct_count = COALESCE(v_correct_count, 0),
        incorrect_count = COALESCE(v_incorrect_count, 0),
        skipped_count = COALESCE(v_skipped_count, 0)
      WHERE id = v_attempt.id;

    v_attempts_updated := v_attempts_updated + 1;
  END LOOP;

  RETURN QUERY SELECT v_attempts_updated, v_answers_corrected;
END;
$$;

GRANT EXECUTE ON FUNCTION recalculate_featured_quiz_scores(uuid) TO authenticated;