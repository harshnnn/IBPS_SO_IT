import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase, type FeaturedQuiz, type FeaturedQuestion, type FeaturedQuizAttempt, type FeaturedQuizAnswer, type Option } from "../lib/supabase";
import { Card, Button, Badge, Spinner, EmptyState } from "../components/ui";
import { CircularProgress } from "../components/CircularProgress";
import { BottomNav } from "./Dashboard";
import {
  ArrowLeft, Clock, Target, Award, Play, Eye, XCircle, Trash2,
  CheckCircle, X, BookOpen, Lightbulb, Brain, AlertTriangle, Link2, Pencil, RotateCcw,
} from "lucide-react";

interface FeaturedQuizProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
  params: Record<string, string>;
}

type Tab = "overview" | "review" | "mistakes" | "manage";

export default function FeaturedQuiz({ onNavigate, params }: FeaturedQuizProps) {
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<FeaturedQuiz | null>(null);
  const [questions, setQuestions] = useState<FeaturedQuestion[]>([]);
  const [attempt, setAttempt] = useState<FeaturedQuizAttempt | null>(null);
  const [answers, setAnswers] = useState<FeaturedQuizAnswer[]>([]);
  const [creatorEmail, setCreatorEmail] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [editDifficulty, setEditDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [editSaving, setEditSaving] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<FeaturedQuestion | null>(null);
  const [editQText, setEditQText] = useState("");
  const [editQOptions, setEditQOptions] = useState<Record<string, string>>({ a: "", b: "", c: "", d: "", e: "" });
  const [editQHasE, setEditQHasE] = useState(false);
  const [editQCorrect, setEditQCorrect] = useState<Option>("a");
  const [editQExplanation, setEditQExplanation] = useState("");
  const [editQExamTip, setEditQExamTip] = useState("");
  const [editQMemoryTrick, setEditQMemoryTrick] = useState("");
  const [editQCommonMistake, setEditQCommonMistake] = useState("");
  const [editQSaving, setEditQSaving] = useState(false);
  const [recalcNotice, setRecalcNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !params.quizId) return;
    (async () => {
      try {
        const [{ data: fq }, { data: fqs }, { data: atts }] = await Promise.all([
          supabase.from("featured_quizzes").select("*").eq("id", params.quizId).maybeSingle(),
          supabase.from("featured_questions").select("*").eq("featured_quiz_id", params.quizId).order("position"),
          supabase.from("featured_quiz_attempts").select("*").eq("featured_quiz_id", params.quizId).eq("user_id", user.id).order("completed_at", { ascending: false }),
        ]);

        setQuiz(fq as FeaturedQuiz | null);
        setQuestions((fqs || []) as FeaturedQuestion[]);

        const latestAtt = (atts && atts.length > 0) ? atts[0] as FeaturedQuizAttempt : null;
        if (latestAtt) {
          setAttempt(latestAtt);
          setAttemptCount(atts.length);
          const { data: ans } = await supabase
            .from("featured_quiz_answers")
            .select("*")
            .eq("attempt_id", latestAtt.id)
            .order("answered_at");
          setAnswers((ans || []) as FeaturedQuizAnswer[]);
        }

        if (fq) {
          const { data: creator } = await supabase
            .from("user_profiles")
            .select("email")
            .eq("user_id", fq.created_by)
            .maybeSingle();
          setCreatorEmail(creator?.email || "Unknown");
          setIsCreator(user?.id === fq.created_by);
          setEditTitle(fq.title);
          setEditDuration(fq.duration_minutes);
          setEditDifficulty(fq.difficulty);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user, params.quizId]);

  const startQuiz = () => {
    onNavigate("quiz-take", {
      mode: "featured",
      featuredQuizId: params.quizId,
      questions: JSON.stringify(questions),
      durationMinutes: String(quiz?.duration_minutes || 30),
    });
  };

  const reattempt = () => {
    startQuiz();
  };

  const saveEdit = async () => {
    if (!quiz || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from("featured_quizzes")
        .update({
          title: editTitle.trim(),
          duration_minutes: editDuration,
          difficulty: editDifficulty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quiz.id);
      if (error) throw error;
      setQuiz({ ...quiz, title: editTitle.trim(), duration_minutes: editDuration, difficulty: editDifficulty });
      setShowEdit(false);
    } catch (err: any) {
      alert(err.message || "Failed to save changes");
    }
    setEditSaving(false);
  };

  const saveQuestionEdit = async () => {
    if (!editingQuestion || !quiz) return;
    setEditQSaving(true);
    try {
      const updateData: Record<string, any> = {
        question_text: editQText.trim(),
        option_a: editQOptions.a.trim(),
        option_b: editQOptions.b.trim(),
        option_c: editQOptions.c.trim(),
        option_d: editQOptions.d.trim(),
        option_e: editQHasE ? editQOptions.e.trim() : null,
        correct_option: editQCorrect,
        explanation: editQExplanation.trim() || null,
        exam_tip: editQExamTip.trim() || null,
        memory_trick: editQMemoryTrick.trim() || null,
        common_mistake: editQCommonMistake.trim() || null,
      };

      const { error } = await supabase
        .from("featured_questions")
        .update(updateData)
        .eq("id", editingQuestion.id);
      if (error) throw error;

      const { data: recalcResult, error: recalcErr } = await supabase
        .rpc("recalculate_featured_quiz_scores", { p_quiz_id: quiz.id });
      if (recalcErr) throw recalcErr;

      const { data: refreshedQs } = await supabase
        .from("featured_questions")
        .select("*")
        .eq("featured_quiz_id", quiz.id)
        .order("position");
      setQuestions((refreshedQs || []) as FeaturedQuestion[]);

      if (user) {
        const { data: atts } = await supabase
          .from("featured_quiz_attempts")
          .select("*")
          .eq("featured_quiz_id", quiz.id)
          .eq("user_id", user.id)
          .order("completed_at", { ascending: false });
        const latestAtt = (atts && atts.length > 0) ? atts[0] as FeaturedQuizAttempt : null;
        if (latestAtt) {
          setAttempt(latestAtt);
          setAttemptCount(atts!.length);
          const { data: ans } = await supabase
            .from("featured_quiz_answers")
            .select("*")
            .eq("attempt_id", latestAtt.id)
            .order("answered_at");
          setAnswers((ans || []) as FeaturedQuizAnswer[]);
        }
      }

      if (recalcResult && recalcResult.length > 0) {
        const r = recalcResult[0] as any;
        setRecalcNotice(`Scores recalculated: ${r.attempts_updated} attempt(s) updated, ${r.answers_corrected} correct answer(s).`);
      } else {
        setRecalcNotice("Question saved. No attempts to recalculate.");
      }
      setEditingQuestion(null);
    } catch (err: any) {
      alert(err.message || "Failed to save question");
    }
    setEditQSaving(false);
  };

  // Load answers from params if we just returned from result
  useEffect(() => {
    if (params.attemptId && params.attemptId !== "loaded" && !attempt) {
      (async () => {
        const { data: atts2 } = await supabase
          .from("featured_quiz_attempts")
          .select("*")
          .eq("user_id", user!.id)
          .eq("featured_quiz_id", params.quizId)
          .order("completed_at", { ascending: false });
        const latestAtt = (atts2 && atts2.length > 0) ? atts2[0] as FeaturedQuizAttempt : null;
        if (latestAtt) {
          setAttempt(latestAtt);
          setAttemptCount(atts2!.length);
          const { data: ans } = await supabase
            .from("featured_quiz_answers")
            .select("*")
            .eq("attempt_id", latestAtt.id)
            .order("answered_at");
          setAnswers((ans || []) as FeaturedQuizAnswer[]);
          setTab("review");
        }
        setLoading(false);
      })();
    }
  }, [params.attemptId]);

  // Mistakes: filter answers where is_correct = false
  const mistakes = answers.filter((a) => !a.is_correct);

  const removeMistake = async (answerId: string) => {
    if (!confirm("Remove this question from your mistakes?")) return;
    const { error } = await supabase.from("featured_quiz_answers").delete().eq("id", answerId);
    if (error) {
      alert(error.message);
      return;
    }
    setAnswers((prev) => prev.filter((a) => a.id !== answerId));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Quiz not found.</p>
          <Button onClick={() => onNavigate("dashboard")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  const completed = !!attempt;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-gradient-to-r from-slate-900 to-blue-950 text-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => onNavigate("dashboard")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">{quiz.title}</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-400">Shared by {creatorEmail}</p>
              {isCreator && (
                <button
                  onClick={() => setShowEdit(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Edit modal for creator */}
      {showEdit && quiz && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowEdit(false)}>
          <Card className="p-6 w-full max-w-md" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Pencil className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900">Edit Mock Test</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Duration (minutes)</label>
                <input
                  type="number"
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  min={1}
                  max={180}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Difficulty</label>
                <div className="flex gap-2">
                  {(["easy", "medium", "hard"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setEditDifficulty(d)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                        editDifficulty === d ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowEdit(false)} className="flex-1">Cancel</Button>
                <Button onClick={saveEdit} disabled={!editTitle || editSaving} className="flex-1">
                  {editSaving ? <Spinner size={16} /> : "Save Changes"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Tabs */}
        {(completed || isCreator) && (
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setTab("overview")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === "overview" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              Overview
            </button>
            {completed && (
              <button
                onClick={() => setTab("review")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === "review" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                Review
              </button>
            )}
            {completed && (
              <button
                onClick={() => setTab("mistakes")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === "mistakes" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                Mistakes ({mistakes.length})
              </button>
            )}
            {isCreator && (
              <button
                onClick={() => setTab("manage")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === "manage" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                Manage
              </button>
            )}
          </div>
        )}

        {/* Overview Tab */}
        {tab === "overview" && (
          <>
            <Card className="p-6">
              <p className="text-sm text-slate-600 leading-relaxed mb-5">{quiz.description || "A comprehensive mock test covering multiple topics from the IBPS SO IT syllabus."}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <BookOpen className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-slate-900">{quiz.question_count}</p>
                  <p className="text-xs text-slate-400">Questions</p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-slate-900">{quiz.duration_minutes}</p>
                  <p className="text-xs text-slate-400">Minutes</p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <Target className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-slate-900 capitalize">{quiz.difficulty}</p>
                  <p className="text-xs text-slate-400">Difficulty</p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <Award className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-slate-900">{completed ? "Done" : "New"}</p>
                  <p className="text-xs text-slate-400">Status</p>
                </div>
              </div>

              {completed && attempt ? (
                <div className="flex flex-col items-center mb-5">
                  <CircularProgress
                    value={attempt.total_questions > 0 ? (attempt.correct_count / attempt.total_questions) * 100 : 0}
                    size={140}
                    color={attempt.correct_count / attempt.total_questions >= 0.7 ? "#10b981" : attempt.correct_count / attempt.total_questions >= 0.5 ? "#f59e0b" : "#ef4444"}
                    label={`${((attempt.correct_count / attempt.total_questions) * 100).toFixed(0)}%`}
                    sublabel="Score"
                  />
                  <div className="flex gap-4 mt-4">
                    <div className="text-center">
                      <p className="text-sm font-bold text-emerald-600">{attempt.correct_count}</p>
                      <p className="text-xs text-slate-400">Correct</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-red-500">{attempt.incorrect_count}</p>
                      <p className="text-xs text-slate-400">Incorrect</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-400">{attempt.skipped_count}</p>
                      <p className="text-xs text-slate-400">Skipped</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-slate-600">{Math.floor(attempt.time_taken_seconds / 60)}m {attempt.time_taken_seconds % 60}s</p>
                      <p className="text-xs text-slate-400">Time</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {completed ? (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => setTab("review")} className="flex-1">
                      <span className="flex items-center justify-center gap-2"><Eye className="w-4 h-4" /> Review Answers</span>
                    </Button>
                    <Button variant="secondary" onClick={() => setTab("mistakes")} className="flex-1">
                      <span className="flex items-center justify-center gap-2"><XCircle className="w-4 h-4" /> View Mistakes</span>
                    </Button>
                  </div>
                  <Button onClick={reattempt} size="lg" className="w-full">
                    <span className="flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Reattempt Mock Test</span>
                  </Button>
                  {attemptCount > 1 && (
                    <p className="text-center text-xs text-slate-400">You've attempted this mock {attemptCount} times</p>
                  )}
                </div>
              ) : (
                <Button onClick={startQuiz} size="lg" className="w-full">
                  <span className="flex items-center justify-center gap-2"><Play className="w-4 h-4" /> Start Mock Test</span>
                </Button>
              )}
            </Card>

            {!completed && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-800 leading-relaxed">
                  <strong>Tip:</strong> You can pause the test at any time and resume when ready. You can also reattempt this mock test as many times as you'd like after completing it.
                </p>
              </div>
            )}
          </>
        )}

        {/* Review Tab */}
        {tab === "review" && completed && (
          <ReviewTab questions={questions} answers={answers} expandedId={expandedId} setExpandedId={setExpandedId} />
        )}

        {/* Manage Questions Tab (creator only) */}
        {tab === "manage" && isCreator && (
          <>
            {recalcNotice && (
              <div className="p-3 bg-emerald-50 rounded-xl text-sm text-emerald-800 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {recalcNotice}
              </div>
            )}
            <ManageQuestionsTab
              questions={questions}
              attempt={attempt}
              onEditQuestion={(q) => {
                setEditingQuestion(q);
                setEditQText(q.question_text);
                setEditQOptions({ a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e || "" });
                setEditQHasE(!!q.option_e);
                setEditQCorrect(q.correct_option);
                setEditQExplanation(q.explanation || "");
                setEditQExamTip(q.exam_tip || "");
                setEditQMemoryTrick(q.memory_trick || "");
                setEditQCommonMistake(q.common_mistake || "");
                setRecalcNotice(null);
              }}
            />
          </>
        )}

        {/* Mistakes Tab */}
        {tab === "mistakes" && completed && (
          <>
            {mistakes.length === 0 ? (
              <Card className="p-6">
                <EmptyState
                  icon={<CheckCircle className="w-12 h-12" />}
                  title="No mistakes!"
                  description="You answered all questions correctly in this mock test. Excellent work!"
                />
              </Card>
            ) : (
              <div className="space-y-3">
                {mistakes.map((ans) => {
                  const q = questions.find((qq) => qq.id === ans.featured_question_id);
                  if (!q) return null;
                  const isExpanded = expandedId === ans.id;
                  return (
                    <Card key={ans.id} className="overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge color="slate">{q.chapter}</Badge>
                              <Badge color="blue">{q.subtopic}</Badge>
                              <Badge color="amber">{q.difficulty}</Badge>
                            </div>
                            <p className="text-sm font-medium text-slate-900 leading-relaxed">{q.question_text}</p>
                          </div>
                          <button onClick={() => removeMistake(ans.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0" title="Remove from mistakes">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-1.5 mb-3">
                          <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg">
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm">
                              <span className="text-red-600 font-medium">Your answer: </span>
                              <span className="text-slate-700">{ans.selected_option ? `${ans.selected_option.toUpperCase()}. ${(q as any)[`option_${ans.selected_option}`]}` : "Not answered"}</span>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 p-2.5 bg-emerald-50 rounded-lg">
                            <span className="text-emerald-600 font-bold text-sm flex-shrink-0 mt-0.5">{q.correct_option.toUpperCase()}.</span>
                            <div className="text-sm">
                              <span className="text-emerald-700 font-medium">Correct: </span>
                              <span className="text-slate-700">{(q as any)[`option_${q.correct_option}`]}</span>
                            </div>
                          </div>
                        </div>

                        {q.explanation && (
                          <button onClick={() => setExpandedId(isExpanded ? null : ans.id)} className="text-xs text-blue-600 font-medium hover:text-blue-700">
                            {isExpanded ? "Hide details" : "Show details"}
                          </button>
                        )}
                        {isExpanded && <RichQuestionDetails q={q} />}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Question edit modal (creator only) */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setEditingQuestion(null)}>
          <Card className="p-6 w-full max-w-lg my-8" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-slate-900">Edit Question</h2>
              </div>
              <button onClick={() => setEditingQuestion(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Question Text</label>
                <textarea
                  value={editQText}
                  onChange={(e) => setEditQText(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                />
              </div>
              {(["a", "b", "c", "d", ...(editQHasE ? ["e"] : [])] as const).map((opt) => (
                <div key={opt}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Option {opt.toUpperCase()}
                    {editQCorrect === opt && <span className="ml-2 text-emerald-600 text-xs">(Correct)</span>}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editQOptions[opt]}
                      onChange={(e) => setEditQOptions({ ...editQOptions, [opt]: e.target.value })}
                      className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                    <button
                      onClick={() => setEditQCorrect(opt as Option)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        editQCorrect === opt ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      Set Correct
                    </button>
                  </div>
                </div>
              ))}
              <div>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={editQHasE} onChange={(e) => {
                    setEditQHasE(e.target.checked);
                    if (!e.target.checked && editQCorrect === "e") setEditQCorrect("a");
                  }} className="rounded" />
                  Has Option E (5 options)
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Explanation</label>
                <textarea
                  value={editQExplanation}
                  onChange={(e) => setEditQExplanation(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Exam Tip (optional)</label>
                <input
                  type="text"
                  value={editQExamTip}
                  onChange={(e) => setEditQExamTip(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Memory Trick (optional)</label>
                <input
                  type="text"
                  value={editQMemoryTrick}
                  onChange={(e) => setEditQMemoryTrick(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Common Mistake (optional)</label>
                <input
                  type="text"
                  value={editQCommonMistake}
                  onChange={(e) => setEditQCommonMistake(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-800">
                Saving will automatically recalculate scores for all users who have attempted this mock.
              </div>
              <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
                <Button variant="secondary" onClick={() => setEditingQuestion(null)} className="flex-1">Cancel</Button>
                <Button onClick={saveQuestionEdit} disabled={!editQText.trim() || !editQOptions.a.trim() || !editQOptions.b.trim() || !editQOptions.c.trim() || !editQOptions.d.trim() || editQSaving} className="flex-1">
                  {editQSaving ? <Spinner size={16} /> : "Save & Recalculate"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <BottomNav active="dashboard" onNavigate={onNavigate} />
    </div>
  );
}

// ---- Manage Questions Tab Component ----

function ManageQuestionsTab({
  questions, attempt, onEditQuestion,
}: {
  questions: FeaturedQuestion[];
  attempt: FeaturedQuizAttempt | null;
  onEditQuestion: (q: FeaturedQuestion) => void;
}) {
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-start gap-2">
          <BookOpen className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Manage Questions</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Edit any question's text, options, or correct answer. When you save, all existing attempt scores are automatically recalculated.
              {attempt && <span className="block mt-1 text-emerald-600">Your latest score: {attempt.correct_count}/{attempt.total_questions}</span>}
            </p>
          </div>
        </div>
      </Card>
      {questions.map((q, i) => (
        <Card key={q.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400">Q{i + 1}</span>
                <Badge color="slate">{q.chapter}</Badge>
                <Badge color="amber">{q.difficulty}</Badge>
              </div>
              <p className="text-sm font-medium text-slate-900 leading-relaxed mb-2">{q.question_text}</p>
              <div className="space-y-1">
                {(["a", "b", "c", "d", ...(q.option_e ? ["e" as Option] : [])] as Option[]).map((opt) => (
                  <div key={opt} className={`flex items-start gap-1.5 text-xs ${q.correct_option === opt ? "text-emerald-700 font-medium" : "text-slate-500"}`}>
                    <span className="uppercase font-bold flex-shrink-0">{opt}.</span>
                    <span className="flex-1 truncate">{(q as any)[`option_${opt}`]}</span>
                    {q.correct_option === opt && <CheckCircle className="w-3 h-3 text-emerald-600 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => onEditQuestion(q)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors flex-shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---- Review Tab Component ----

function ReviewTab({
  questions, answers, expandedId, setExpandedId,
}: {
  questions: FeaturedQuestion[];
  answers: FeaturedQuizAnswer[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const ans = answers.find((a) => a.featured_question_id === q.id);
        const userAnswer = ans?.selected_option || null;
        const isCorrect = ans?.is_correct ?? false;
        const isExpanded = expandedId === q.id;

        return (
          <Card key={q.id} className="overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-2 mb-3">
                <span className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${isCorrect ? "bg-emerald-100 text-emerald-700" : userAnswer ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                  {isCorrect ? <CheckCircle className="w-4 h-4" /> : userAnswer ? <X className="w-4 h-4" /> : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 leading-relaxed">{i + 1}. {q.question_text}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge color="slate">{q.chapter}</Badge>
                    <Badge color="blue">{q.subtopic}</Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 ml-8">
                {(["a", "b", "c", "d", ...(q.option_e ? ["e" as Option] : [])] as Option[]).map((opt) => {
                  const isUser = userAnswer === opt;
                  const isRight = q.correct_option === opt;
                  return (
                    <div key={opt} className={`flex items-start gap-2 p-2 rounded-lg text-sm ${isRight ? "bg-emerald-50 text-emerald-800" : isUser ? "bg-red-50 text-red-700" : "text-slate-600"}`}>
                      <span className="font-bold uppercase">{opt}.</span>
                      <span className="flex-1">{(q as any)[`option_${opt}`]}</span>
                      {isRight && <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                      {isUser && !isRight && <X className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>

              <button onClick={() => setExpandedId(isExpanded ? null : q.id)} className="ml-8 mt-3 text-xs text-blue-600 font-medium hover:text-blue-700">
                {isExpanded ? "Hide details" : "Show detailed explanation"}
              </button>
              {isExpanded && <div className="ml-8 mt-2"><RichQuestionDetails q={q} /></div>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---- Rich Question Details (exam tip, memory trick, etc.) ----

function RichQuestionDetails({ q }: { q: FeaturedQuestion }) {
  const optionExps = q.option_explanations || {};
  return (
    <div className="mt-3 space-y-3">
      {/* Per-option explanations */}
      {Object.keys(optionExps).length > 0 && (
        <div className="p-3 bg-slate-50 rounded-lg">
          <p className="text-xs font-medium text-slate-500 mb-2">Option Explanations</p>
          {(["a", "b", "c", "d", ...(q.option_e ? ["e" as Option] : [])] as Option[]).map((opt) =>
            optionExps[opt] ? (
              <div key={opt} className="text-sm text-slate-700 mb-1.5">
                <span className="font-bold uppercase">{opt}.</span> {optionExps[opt]}
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Summary */}
      {(q.summary_title || q.summary_explanation) && (
        <div className="p-3 bg-blue-50 rounded-lg">
          {q.summary_title && <p className="text-sm font-semibold text-blue-900 mb-1">{q.summary_title}</p>}
          {q.summary_explanation && <p className="text-sm text-blue-800 leading-relaxed">{q.summary_explanation}</p>}
        </div>
      )}

      {/* Explanation */}
      {q.explanation && (
        <div className="p-3 bg-slate-50 rounded-lg">
          <p className="text-xs font-medium text-slate-500 mb-1">Explanation</p>
          <p className="text-sm text-slate-700">{q.explanation}</p>
        </div>
      )}

      {/* Exam Tip */}
      {q.exam_tip && (
        <div className="p-3 bg-amber-50 rounded-lg flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-700 mb-0.5">Exam Tip</p>
            <p className="text-sm text-amber-800">{q.exam_tip}</p>
          </div>
        </div>
      )}

      {/* Memory Trick */}
      {q.memory_trick && (
        <div className="p-3 bg-purple-50 rounded-lg flex items-start gap-2">
          <Brain className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-purple-700 mb-0.5">Memory Trick</p>
            <p className="text-sm text-purple-800">{q.memory_trick}</p>
          </div>
        </div>
      )}

      {/* Common Mistake */}
      {q.common_mistake && (
        <div className="p-3 bg-red-50 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-700 mb-0.5">Common Mistake</p>
            <p className="text-sm text-red-800">{q.common_mistake}</p>
          </div>
        </div>
      )}

      {/* Related Concepts */}
      {q.related_concepts && q.related_concepts.length > 0 && (
        <div className="flex items-start gap-2">
          <Link2 className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="flex flex-wrap gap-1.5">
            {q.related_concepts.map((c, idx) => (
              <span key={idx} className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}