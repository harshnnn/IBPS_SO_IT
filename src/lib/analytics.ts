import { supabase, type Chapter, type Subtopic, type UserProgress } from "./supabase";

export interface ChapterStat {
  chapter: Chapter;
  totalAttempted: number;
  correctCount: number;
  accuracy: number;
  subtopics: SubtopicStat[];
}

export interface SubtopicStat {
  subtopic: Subtopic;
  totalAttempted: number;
  correctCount: number;
  accuracy: number;
}

export interface OverallStats {
  totalAttempted: number;
  totalCorrect: number;
  overallAccuracy: number;
  totalSessions: number;
  chapterStats: ChapterStat[];
  strongChapters: ChapterStat[];
  weakChapters: ChapterStat[];
  strongSubtopics: SubtopicStat[];
  weakSubtopics: SubtopicStat[];
}

export async function fetchOverallStats(userId: string): Promise<OverallStats> {
  const [chaptersRes, subtopicsRes, progressRes, sessionsRes] = await Promise.all([
    supabase.from("chapters").select("*").order("priority"),
    supabase.from("subtopics").select("*").order("priority"),
    supabase.from("user_progress").select("*").eq("user_id", userId),
    supabase.from("quiz_sessions").select("id").eq("user_id", userId),
  ]);

  const chapters: Chapter[] = chaptersRes.data || [];
  const subtopics: Subtopic[] = subtopicsRes.data || [];
  const progress: UserProgress[] = progressRes.data || [];
  const totalSessions = sessionsRes.data?.length || 0;

  const subtopicMap = new Map(subtopics.map((s) => [s.id, s]));
  const chapterMap = new Map(chapters.map((c) => [c.id, c]));

  const chapterStats: ChapterStat[] = chapters.map((chapter) => {
    const chapterProgress = progress.filter((p) => p.chapter_id === chapter.id);
    const totalAttempted = chapterProgress.reduce((sum, p) => sum + p.total_attempted, 0);
    const correctCount = chapterProgress.reduce((sum, p) => sum + p.correct_count, 0);

    const subtopicStats: SubtopicStat[] = subtopics
      .filter((s) => s.chapter_id === chapter.id)
      .map((subtopic) => {
        const sp = chapterProgress.find((p) => p.subtopic_id === subtopic.id);
        const ta = sp?.total_attempted || 0;
        const cc = sp?.correct_count || 0;
        return {
          subtopic,
          totalAttempted: ta,
          correctCount: cc,
          accuracy: ta > 0 ? (cc / ta) * 100 : 0,
        };
      });

    return {
      chapter,
      totalAttempted,
      correctCount,
      accuracy: totalAttempted > 0 ? (correctCount / totalAttempted) * 100 : 0,
      subtopics: subtopicStats,
    };
  });

  const totalAttempted = chapterStats.reduce((s, c) => s + c.totalAttempted, 0);
  const totalCorrect = chapterStats.reduce((s, c) => s + c.correctCount, 0);

  const allSubtopicStats = chapterStats.flatMap((c) => c.subtopics);

  const strongChapters = chapterStats
    .filter((c) => c.totalAttempted >= 3 && c.accuracy >= 70)
    .sort((a, b) => b.accuracy - a.accuracy);

  const weakChapters = chapterStats
    .filter((c) => c.totalAttempted >= 3 && c.accuracy < 50)
    .sort((a, b) => a.accuracy - b.accuracy);

  const strongSubtopics = allSubtopicStats
    .filter((s) => s.totalAttempted >= 3 && s.accuracy >= 75)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 10);

  const weakSubtopics = allSubtopicStats
    .filter((s) => s.totalAttempted >= 3 && s.accuracy < 50)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10);

  return {
    totalAttempted,
    totalCorrect,
    overallAccuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0,
    totalSessions,
    chapterStats,
    strongChapters,
    weakChapters,
    strongSubtopics,
    weakSubtopics,
  };
}

export async function fetchChapterStats(userId: string, chapterId: string): Promise<ChapterStat | null> {
  const [chapterRes, subtopicsRes, progressRes] = await Promise.all([
    supabase.from("chapters").select("*").eq("id", chapterId).maybeSingle(),
    supabase.from("subtopics").select("*").eq("chapter_id", chapterId).order("priority"),
    supabase.from("user_progress").select("*").eq("user_id", userId).eq("chapter_id", chapterId),
  ]);

  const chapter = chapterRes.data as Chapter | null;
  if (!chapter) return null;

  const subtopics: Subtopic[] = subtopicsRes.data || [];
  const progress: UserProgress[] = progressRes.data || [];

  const subtopicStats: SubtopicStat[] = subtopics.map((subtopic) => {
    const sp = progress.find((p) => p.subtopic_id === subtopic.id);
    const ta = sp?.total_attempted || 0;
    const cc = sp?.correct_count || 0;
    return { subtopic, totalAttempted: ta, correctCount: cc, accuracy: ta > 0 ? (cc / ta) * 100 : 0 };
  });

  const totalAttempted = subtopicStats.reduce((s, st) => s + st.totalAttempted, 0);
  const correctCount = subtopicStats.reduce((s, st) => s + st.correctCount, 0);

  return {
    chapter,
    totalAttempted,
    correctCount,
    accuracy: totalAttempted > 0 ? (correctCount / totalAttempted) * 100 : 0,
    subtopics: subtopicStats,
  };
}

export async function fetchRecentSessions(userId: string, limit = 10) {
  const { data } = await supabase
    .from("quiz_sessions")
    .select(`
      *,
      chapters:chapter_id(name, slug),
      subtopics:subtopic_id(name, slug)
    `)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export async function fetchAttemptedQuestions(
  userId: string,
  opts: { chapterId?: string; subtopicId?: string; limit?: number } = {},
) {
  let q = supabase
    .from("user_answers")
    .select(`
      id, session_id, question_id, selected_option, is_correct, answered_at,
      questions:question_id(id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, source, chapter_id, subtopic_id)
    `)
    .eq("user_id", userId)
    .order("answered_at", { ascending: false })
    .limit(opts.limit ?? 500);

  if (opts.subtopicId) {
    // filter via the joined question's subtopic_id
    q = q.eq("questions.subtopic_id", opts.subtopicId);
  } else if (opts.chapterId) {
    q = q.eq("questions.chapter_id", opts.chapterId);
  }

  const { data } = await q;
  // supabase join filter returns rows with null questions when they don't match — drop those
  return (data || []).filter((row: any) => row.questions !== null);
}

export async function fetchWrongAnswers(userId: string, limit = 50) {
  const { data } = await supabase
    .from("user_answers")
    .select(`
      *,
      questions:question_id(*)
    `)
    .eq("user_id", userId)
    .eq("is_correct", false)
    .order("answered_at", { ascending: false })
    .limit(limit);
  return data || [];
}
