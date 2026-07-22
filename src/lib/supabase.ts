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

export type Option = "a" | "b" | "c" | "d";

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
  correct_option: Option;
  explanation: string | null;
  source: "manual" | "ai";
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
