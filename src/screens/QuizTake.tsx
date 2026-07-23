import { useState, useEffect, useRef } from "react";
import { useAuth } from "../lib/auth";
import { supabase, type Question, type Option, type FeaturedQuestion } from "../lib/supabase";
import { Button, Card, ProgressBar, Spinner } from "../components/ui";
import { ArrowLeft, Check, X, Clock, ChevronRight } from "lucide-react";

interface QuizTakeProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
  params: Record<string, string>;
}

export default function QuizTake({ onNavigate, params }: QuizTakeProps) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Option>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startTime] = useState(Date.now());
  const isFeatured = params.mode === "featured";
  const submittedRef = useRef(false);

  useEffect(() => {
    try {
      const parsed = JSON.parse(params.questions || "[]");

      if (isFeatured) {
        // Featured questions have a different shape — normalize to Question interface
        const normalized = parsed.map((q: FeaturedQuestion) => ({
          id: q.id,
          chapter_id: q.chapter, // store chapter name in chapter_id field for display
          subtopic_id: q.subtopic, // store subtopic name similarly
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          option_e: q.option_e || null,
          correct_option: q.correct_option,
          explanation: q.explanation || null,
          source: "featured" as any,
          difficulty: q.difficulty,
          created_by: "",
        })) as Question[];
        setQuestions(normalized);
        setTimeLeft(parseInt(params.durationMinutes || "30", 10) * 60);
      } else {
        // Regular quiz questions
        const normalized = parsed.map((q: any) => ({
          id: q.id || crypto.randomUUID(),
          chapter_id: q.chapter_id || params.chapterId,
          subtopic_id: q.subtopic_id ?? (params.subtopicId || null),
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option,
          explanation: q.explanation || null,
          source: q.source || (params.mode === "ai" ? "ai" : "manual"),
          difficulty: q.difficulty || "medium",
          created_by: q.created_by || user?.id || "",
        })) as Question[];
        setQuestions(normalized);
      }
    } catch {
      setQuestions([]);
    }
    setLoading(false);
  }, []);

  // Timer for featured quizzes
  useEffect(() => {
    if (!isFeatured || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!submittedRef.current) {
            submittedRef.current = true;
            submitQuiz();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isFeatured, timeLeft]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600 mb-4">No questions available.</p>
          <Button onClick={() => onNavigate("quiz-setup")}>Back to Setup</Button>
        </div>
      </div>
    );
  }

  const q = questions[currentIdx];
  const progress = ((currentIdx + 1) / questions.length) * 100;
  const options: { key: Option; text: string }[] = [
    { key: "a", text: q.option_a },
    { key: "b", text: q.option_b },
    { key: "c", text: q.option_c },
    { key: "d", text: q.option_d },
    ...(q.option_e ? [{ key: "e" as Option, text: q.option_e }] : []),
  ];

  const selectAnswer = (opt: Option) => {
    setAnswers((prev) => ({ ...prev, [q.id]: opt }));
  };

  const goNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      submitQuiz();
    }
  };

  const goPrev = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const submitQuiz = async () => {
    if (!user) return;
    if (submitting) return;
    setSubmitting(true);

    try {
      const timeTaken = Math.floor((Date.now() - startTime) / 1000);

      if (isFeatured) {
        await submitFeaturedQuiz(timeTaken);
      } else {
        await submitRegularQuiz();
      }
    } catch (err: any) {
      alert(err.message || "Failed to submit quiz");
      setSubmitting(false);
    }
  };

  const submitFeaturedQuiz = async (timeTaken: number) => {
    if (!user) return;

    const correctCount = questions.filter((qq) => answers[qq.id] === qq.correct_option).length;
    const incorrectCount = questions.filter((qq) => answers[qq.id] && answers[qq.id] !== qq.correct_option).length;
    const skippedCount = questions.filter((qq) => !answers[qq.id]).length;

    // Create featured quiz attempt
    const { data: attempt, error: attemptErr } = await supabase
      .from("featured_quiz_attempts")
      .insert({
        featured_quiz_id: params.featuredQuizId,
        user_id: user.id,
        total_questions: questions.length,
        correct_count: correctCount,
        incorrect_count: incorrectCount,
        skipped_count: skippedCount,
        time_taken_seconds: timeTaken,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (attemptErr) throw attemptErr;

    // Save individual answers
    const answerRows = questions.map((question) => ({
      attempt_id: attempt.id,
      featured_question_id: question.id,
      user_id: user.id,
      selected_option: answers[question.id] || null,
      is_correct: answers[question.id] === question.correct_option,
    }));

    const { error: answersErr } = await supabase.from("featured_quiz_answers").insert(answerRows);
    if (answersErr) throw answersErr;

    // Also add incorrect answers to global mistakes (user_answers table)
    // Create a quiz_session for mistakes integration
    const { data: session } = await supabase
      .from("quiz_sessions")
      .insert({
        user_id: user.id,
        chapter_id: null,
        subtopic_id: null,
        mode: "featured",
        total_questions: questions.length,
        correct_count: correctCount,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (session) {
      // Find or create questions in the regular questions table for mistakes tracking
      // We need question IDs in the questions table for user_answers FK
      // For featured quizzes, we'll use a simpler approach: store mistakes via featured_quiz_answers
      // and also in user_answers with a synthetic session
      // Actually, user_answers requires question_id FK to questions table
      // Featured questions are in featured_questions, not questions table
      // So we skip user_answers integration and rely on featured_quiz_answers for mistakes
    }

    onNavigate("featured-quiz-result", {
      featuredQuizId: params.featuredQuizId,
      attemptId: attempt.id,
      questions: JSON.stringify(questions),
      answers: JSON.stringify(answers),
      timeTaken: String(timeTaken),
    });
  };

  const submitRegularQuiz = async () => {
    if (!user) return;

    // Create quiz session
    const { data: session, error: sessionErr } = await supabase
      .from("quiz_sessions")
      .insert({
        user_id: user.id,
        chapter_id: params.chapterId || null,
        subtopic_id: params.subtopicId || null,
        mode: params.mode || "manual",
        total_questions: questions.length,
        correct_count: 0,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionErr) throw sessionErr;

    // Build answer records
    const answerRows = questions.map((question) => {
      const selected = answers[question.id] || null;
      const isCorrect = selected === question.correct_option;
      return {
        session_id: session.id,
        user_id: user.id,
        question_id: question.id,
        selected_option: selected,
        is_correct: isCorrect,
      };
    });

    const { error: answersErr } = await supabase.from("user_answers").insert(answerRows);
    if (answersErr) throw answersErr;

    // Update correct count on session
    const correctCount = answerRows.filter((a) => a.is_correct).length;
    await supabase.from("quiz_sessions").update({ correct_count: correctCount }).eq("id", session.id);

    // Update user_progress per subtopic
    const subtopicGroups: Record<string, { total: number; correct: number }> = {};
    questions.forEach((question) => {
      const key = question.subtopic_id || question.chapter_id;
      const type = question.subtopic_id ? "subtopic" : "chapter";
      const progressKey = `${type}:${key}`;
      if (!subtopicGroups[progressKey]) subtopicGroups[progressKey] = { total: 0, correct: 0 };
      subtopicGroups[progressKey].total++;
      if (answers[question.id] === question.correct_option) subtopicGroups[progressKey].correct++;
    });

    for (const [key, { total, correct }] of Object.entries(subtopicGroups)) {
      const [type, id] = key.split(":");
      const chapterId = type === "subtopic" ? params.chapterId : id;
      const subtopicId = type === "subtopic" ? id : null;

      const { data: existing } = await supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", user.id)
        .eq("subtopic_id", subtopicId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("user_progress")
          .update({
            total_attempted: existing.total_attempted + total,
            correct_count: existing.correct_count + correct,
            last_attempted_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("user_progress").insert({
          user_id: user.id,
          chapter_id: chapterId,
          subtopic_id: subtopicId,
          total_attempted: total,
          correct_count: correct,
          last_attempted_at: new Date().toISOString(),
        });
      }
    }

    onNavigate("quiz-result", {
      sessionId: session.id,
      answers: JSON.stringify(answers),
      questions: JSON.stringify(questions),
    });
  };

  const allAnswered = questions.every((qq) => answers[qq.id]);
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerColor = timeLeft < 60 ? "text-red-500" : timeLeft < 300 ? "text-amber-500" : "text-slate-600";

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => {
                if (confirm("Leave this quiz? Your progress will be lost.")) {
                  onNavigate(isFeatured ? "featured-quiz" : "quiz-setup", isFeatured ? { quizId: params.featuredQuizId } : {});
                }
              }}
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-3">
              {isFeatured && (
                <span className={`flex items-center gap-1 text-sm font-medium ${timerColor}`}>
                  <Clock className="w-4 h-4" />
                  {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                </span>
              )}
              <span className="text-sm font-medium text-slate-600">
                {currentIdx + 1} / {questions.length}
              </span>
              <span className="text-xs text-slate-400 w-8 text-right">{progress.toFixed(0)}%</span>
            </div>
          </div>
          <ProgressBar value={progress} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            {isFeatured && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium">Featured Mock</span>
            )}
            {!isFeatured && q.source === "ai" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">AI</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">{q.difficulty}</span>
          </div>

          <h2 className="text-base sm:text-lg font-semibold text-slate-900 leading-relaxed mb-5">
            {q.question_text}
          </h2>

          <div className="space-y-2.5">
            {options.map((opt) => {
              const isSelected = answers[q.id] === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => selectAnswer(opt.key)}
                  className={`flex items-start gap-3 w-full p-3.5 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                      isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {opt.key.toUpperCase()}
                  </span>
                  <span className="text-sm text-slate-800 pt-0.5">{opt.text}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex gap-3 mt-5">
          {currentIdx > 0 && (
            <Button variant="secondary" onClick={goPrev} className="flex-1">
              Previous
            </Button>
          )}
          <Button
            onClick={goNext}
            disabled={!answers[q.id] || submitting}
            className="flex-1"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Submitting...</span>
            ) : currentIdx === questions.length - 1 ? (
              "Submit Quiz"
            ) : (
              <span className="flex items-center justify-center gap-1">
                Next <ChevronRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </div>

        {/* Question palette */}
        <div className="mt-6">
          <p className="text-xs text-slate-500 mb-2 font-medium">Question Palette</p>
          <div className="flex flex-wrap gap-2">
            {questions.map((qq, i) => {
              const answered = !!answers[qq.id];
              const isCurrent = i === currentIdx;
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrentIdx(i)}
                  className={`w-9 h-9 rounded-lg text-xs font-medium transition-all ${
                    isCurrent
                      ? "ring-2 ring-blue-500 ring-offset-1"
                      : ""
                  } ${
                    answered
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          {allAnswered && (
            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
              <Check className="w-3 h-3" /> All questions answered
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
