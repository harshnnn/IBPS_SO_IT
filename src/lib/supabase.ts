import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "ibps-quiz-auth",
  },
});

export type Option = "a" | "b" | "c" | "d" | "e";

export interface Chapter {
  id: string;
  name: string;
  slug: string;
  priority: number;
  description: string | null;
}

export interface Subtopic {
  id: string;
  chapter_id: string;
  name: string;
  slug: string;
  priority: number;
}

export interface Question {
  id: string;
  chapter_id: string;
  subtopic_id: string | null;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e?: string | null;
  correct_option: Option;
  explanation: string | null;
  source: "manual" | "ai" | "chatgpt" | "youtube";
  difficulty: "easy" | "medium" | "hard";
  created_by: string;
}

export interface QuizSession {
  id: string;
  user_id: string;
  chapter_id: string | null;
  subtopic_id: string | null;
  mode: "manual" | "ai" | "mixed";
  total_questions: number;
  correct_count: number;
  started_at: string;
  completed_at: string | null;
}

export interface UserAnswer {
  id: string;
  session_id: string;
  user_id: string;
  question_id: string;
  selected_option: Option | null;
  is_correct: boolean;
  answered_at: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  chapter_id: string;
  subtopic_id: string | null;
  total_attempted: number;
  correct_count: number;
  last_attempted_at: string;
}

export interface QuestionWithMeta extends Question {
  chapters?: { name: string; slug: string } | null;
  subtopics?: { name: string; slug: string } | null;
}

export interface UserAnswerWithQuestion extends UserAnswer {
  questions: Question;
}

export interface QuizSessionWithDetails extends QuizSession {
  chapters?: { name: string; slug: string } | null;
  subtopics?: { name: string; slug: string } | null;
}

// ---- Featured Quiz Mock types ----

export interface FeaturedQuiz {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  difficulty: "easy" | "medium" | "hard";
  question_count: number;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeaturedQuestion {
  id: string;
  featured_quiz_id: string;
  position: number;
  chapter: string;
  subtopic: string;
  difficulty: "easy" | "medium" | "hard";
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string | null;
  correct_option: Option;
  explanation: string | null;
  exam_tip: string | null;
  memory_trick: string | null;
  common_mistake: string | null;
  related_concepts: string[];
  summary_title: string | null;
  summary_explanation: string | null;
  option_explanations: Record<string, string>;
  created_at: string;
}

export interface FeaturedQuizAttempt {
  id: string;
  featured_quiz_id: string;
  user_id: string;
  total_questions: number;
  correct_count: number;
  incorrect_count: number;
  skipped_count: number;
  time_taken_seconds: number;
  started_at: string;
  completed_at: string;
}

export interface FeaturedQuizAnswer {
  id: string;
  attempt_id: string;
  featured_question_id: string;
  user_id: string;
  selected_option: Option | null;
  is_correct: boolean;
  answered_at: string;
}

export interface FeaturedQuizWithCreator extends FeaturedQuiz {
  creator_email?: string;
}
