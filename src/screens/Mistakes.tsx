import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { Card, Badge, Spinner, EmptyState, Button } from "../components/ui";
import { BottomNav } from "./Dashboard";
import { XCircle, Trash2, BookOpen, Filter, ArrowLeft, FileText, Trophy } from "lucide-react";

type Source = "quiz" | "mock";

interface WrongAnswer {
  id: string;
  session_id: string;
  question_id: string;
  selected_option: string | null;
  is_correct: boolean;
  answered_at: string;
  questions: {
    id: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: string;
    explanation: string | null;
    difficulty: string;
    source: string;
    chapter_id: string;
    subtopic_id: string | null;
  } | null;
}

interface MockWrongAnswer {
  id: string;
  selected_option: string | null;
  is_correct: boolean;
  answered_at: string;
  featured_question_id: string;
  questions: {
    id: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    option_e: string | null;
    correct_option: string;
    explanation: string | null;
    exam_tip: string | null;
    memory_trick: string | null;
    common_mistake: string | null;
    difficulty: string;
    chapter: string;
  } | null;
  attempts: {
    featured_quiz_id: string;
  } | null;
}

interface MockQuizInfo {
  id: string;
  title: string;
}

interface MistakesProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
}

export default function Mistakes({ onNavigate }: MistakesProps) {
  const { user } = useAuth();
  const [source, setSource] = useState<Source>("quiz");
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [mockWrongAnswers, setMockWrongAnswers] = useState<MockWrongAnswer[]>([]);
  const [mockQuizMap, setMockQuizMap] = useState<Record<string, MockQuizInfo>>({});
  const [chapters, setChapters] = useState<Record<string, string>>({});
  const [subtopics, setSubtopics] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [chapterFilter, setChapterFilter] = useState<string>("");
  const [mockFilter, setMockFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: ch }, { data: sub }] = await Promise.all([
        supabase.from("chapters").select("id, name"),
        supabase.from("subtopics").select("id, name"),
      ]);
      const chMap: Record<string, string> = {};
      (ch || []).forEach((c) => (chMap[c.id] = c.name));
      setChapters(chMap);
      const subMap: Record<string, string> = {};
      (sub || []).forEach((s) => (subMap[s.id] = s.name));
      setSubtopics(subMap);
      await loadWrongAnswers();
      await loadMockWrongAnswers();
      setLoading(false);
    })();
  }, [user]);

  const loadWrongAnswers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_answers")
      .select(`
        id, session_id, question_id, selected_option, is_correct, answered_at,
        questions:question_id(id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, source, chapter_id, subtopic_id)
      `)
      .eq("user_id", user.id)
      .eq("is_correct", false)
      .order("answered_at", { ascending: false });
    setWrongAnswers((data || []) as unknown as WrongAnswer[]);
  };

  const loadMockWrongAnswers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("featured_quiz_answers")
      .select(`
        id, selected_option, is_correct, answered_at, featured_question_id,
        questions:featured_question_id(id, question_text, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, exam_tip, memory_trick, common_mistake, difficulty, chapter),
        attempts:attempt_id(featured_quiz_id)
      `)
      .eq("user_id", user.id)
      .eq("is_correct", false)
      .order("answered_at", { ascending: false });
    setMockWrongAnswers((data || []) as unknown as MockWrongAnswer[]);

    const quizIds = Array.from(
      new Set(
        (data || [])
          .map((a: any) => a.attempts?.featured_quiz_id)
          .filter(Boolean) as string[]
      )
    );
    if (quizIds.length > 0) {
      const { data: quizzes } = await supabase
        .from("featured_quizzes")
        .select("id, title")
        .in("id", quizIds);
      const qMap: Record<string, MockQuizInfo> = {};
      (quizzes || []).forEach((q) => (qMap[q.id] = { id: q.id, title: q.title }));
      setMockQuizMap(qMap);
    }
  };

  const deleteWrongAnswer = async (answerId: string) => {
    if (!confirm("Remove this question from your mistakes?")) return;
    const { error } = await supabase.from("user_answers").delete().eq("id", answerId);
    if (error) {
      alert(error.message);
      return;
    }
    setWrongAnswers((prev) => prev.filter((wa) => wa.id !== answerId));
  };

  const deleteMockWrongAnswer = async (answerId: string) => {
    if (!confirm("Remove this question from your mock mistakes?")) return;
    const { error } = await supabase.from("featured_quiz_answers").delete().eq("id", answerId);
    if (error) {
      alert(error.message);
      return;
    }
    setMockWrongAnswers((prev) => prev.filter((wa) => wa.id !== answerId));
  };

  const clearAll = async () => {
    if (!user || wrongAnswers.length === 0) return;
    if (!confirm(`Delete all ${wrongAnswers.length} incorrect quiz answer records? This cannot be undone.`)) return;
    const ids = wrongAnswers.map((wa) => wa.id);
    const { error } = await supabase.from("user_answers").delete().in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    setWrongAnswers([]);
  };

  const clearAllMock = async () => {
    if (!user || mockWrongAnswers.length === 0) return;
    if (!confirm(`Delete all ${mockWrongAnswers.length} incorrect mock answer records? This cannot be undone.`)) return;
    const ids = mockWrongAnswers.map((wa) => wa.id);
    const { error } = await supabase.from("featured_quiz_answers").delete().in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    setMockWrongAnswers([]);
  };

  const filteredQuiz = chapterFilter
    ? wrongAnswers.filter((wa) => wa.questions?.chapter_id === chapterFilter)
    : wrongAnswers;

  const filteredMock = mockFilter
    ? mockWrongAnswers.filter((wa) => wa.attempts?.featured_quiz_id === mockFilter)
    : mockWrongAnswers;

  const chapterOptions = Array.from(
    new Set(wrongAnswers.map((wa) => wa.questions?.chapter_id).filter(Boolean) as string[])
  ).map((id) => ({ id, name: chapters[id] || "Unknown" }));

  const mockOptions = Array.from(
    new Set(mockWrongAnswers.map((wa) => wa.attempts?.featured_quiz_id).filter(Boolean) as string[])
  ).map((id) => ({ id, name: mockQuizMap[id]?.title || "Unknown" }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

  const totalCount = wrongAnswers.length + mockWrongAnswers.length;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("dashboard")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="font-bold text-slate-900">Mistakes</h1>
              <p className="text-xs text-slate-400">
                {totalCount} incorrect {totalCount === 1 ? "answer" : "answers"} total
              </p>
            </div>
          </div>
          {source === "quiz" && wrongAnswers.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-red-500 hover:bg-red-50">
              Clear All
            </Button>
          )}
          {source === "mock" && mockWrongAnswers.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllMock} className="text-red-500 hover:bg-red-50">
              Clear All
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Source toggle */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => { setSource("quiz"); setExpandedId(null); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              source === "quiz" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            <BookOpen className="w-4 h-4" /> Quiz ({wrongAnswers.length})
          </button>
          <button
            onClick={() => { setSource("mock"); setExpandedId(null); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              source === "mock" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            <Trophy className="w-4 h-4" /> Mock Tests ({mockWrongAnswers.length})
          </button>
        </div>

        {/* Quiz mistakes */}
        {source === "quiz" && (
          <>
            {wrongAnswers.length === 0 ? (
              <Card className="p-6">
                <EmptyState
                  icon={<XCircle className="w-12 h-12" />}
                  title="No quiz mistakes yet"
                  description="Questions you answer incorrectly in quizzes will appear here so you can review and learn from them. Take a quiz to get started!"
                />
              </Card>
            ) : (
              <>
                {chapterOptions.length > 1 && (
                  <Card className="p-3">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                      <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <button
                        onClick={() => setChapterFilter("")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                          chapterFilter === "" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        All ({wrongAnswers.length})
                      </button>
                      {chapterOptions.map((ch) => (
                        <button
                          key={ch.id}
                          onClick={() => setChapterFilter(ch.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                            chapterFilter === ch.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {ch.name}
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

                <div className="space-y-3">
                  {filteredQuiz.map((wa) => {
                    const q = wa.questions;
                    if (!q) return null;
                    const isExpanded = expandedId === wa.id;
                    const chapterName = chapters[q.chapter_id] || "Unknown";
                    const subtopicName = q.subtopic_id ? subtopics[q.subtopic_id] : null;
                    const userAnswerText = wa.selected_option
                      ? `${wa.selected_option.toUpperCase()}. ${(q as any)[`option_${wa.selected_option}`]}`
                      : "Not answered";

                    return (
                      <Card key={wa.id} className="overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Badge color="slate">{chapterName}</Badge>
                                {subtopicName && <Badge color="blue">{subtopicName}</Badge>}
                                <Badge color="amber">{q.difficulty}</Badge>
                                {q.source === "ai" && <Badge color="purple">AI</Badge>}
                              </div>
                              <p className="text-sm font-medium text-slate-900 leading-relaxed">
                                {q.question_text}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteWrongAnswer(wa.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                              title="Remove from mistakes"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-1.5 mb-3">
                            <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg">
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                              <div className="text-sm">
                                <span className="text-red-600 font-medium">Your answer: </span>
                                <span className="text-slate-700">{userAnswerText}</span>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-2.5 bg-emerald-50 rounded-lg">
                              <span className="text-emerald-600 font-bold text-sm flex-shrink-0 mt-0.5">
                                {q.correct_option.toUpperCase()}.
                              </span>
                              <div className="text-sm">
                                <span className="text-emerald-700 font-medium">Correct: </span>
                                <span className="text-slate-700">{(q as any)[`option_${q.correct_option}`]}</span>
                              </div>
                            </div>
                          </div>

                          {q.explanation && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : wa.id)}
                              className="text-xs text-blue-600 font-medium hover:text-blue-700"
                            >
                              {isExpanded ? "Hide explanation" : "Show explanation"}
                            </button>
                          )}
                          {isExpanded && q.explanation && (
                            <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                              <p className="text-sm text-slate-700">{q.explanation}</p>
                            </div>
                          )}

                          <p className="text-xs text-slate-400 mt-3">
                            Answered on {new Date(wa.answered_at).toLocaleDateString(undefined, {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {filteredQuiz.length === 0 && (
                  <Card className="p-6">
                    <EmptyState
                      icon={<BookOpen className="w-12 h-12" />}
                      title="No mistakes for this chapter"
                      description="You haven't answered any questions incorrectly in this chapter. Try another filter."
                    />
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {/* Mock test mistakes */}
        {source === "mock" && (
          <>
            {mockWrongAnswers.length === 0 ? (
              <Card className="p-6">
                <EmptyState
                  icon={<Trophy className="w-12 h-12" />}
                  title="No mock test mistakes yet"
                  description="Questions you answer incorrectly in mock tests will appear here collectively. Take a mock test to get started!"
                />
              </Card>
            ) : (
              <>
                {mockOptions.length > 1 && (
                  <Card className="p-3">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                      <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <button
                        onClick={() => setMockFilter("")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                          mockFilter === "" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        All ({mockWrongAnswers.length})
                      </button>
                      {mockOptions.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setMockFilter(m.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                            mockFilter === m.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

                <div className="space-y-3">
                  {filteredMock.map((wa) => {
                    const q = wa.questions;
                    if (!q) return null;
                    const isExpanded = expandedId === wa.id;
                    const quizInfo = wa.attempts?.featured_quiz_id
                      ? mockQuizMap[wa.attempts.featured_quiz_id]
                      : null;
                    const userAnswerText = wa.selected_option
                      ? `${wa.selected_option.toUpperCase()}. ${(q as any)[`option_${wa.selected_option}`]}`
                      : "Not answered";
                    const correctText = (q as any)[`option_${q.correct_option}`];

                    return (
                      <Card key={wa.id} className="overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                {quizInfo && (
                                  <button
                                    onClick={() => onNavigate("featured-quiz", { quizId: quizInfo.id })}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 transition-colors"
                                  >
                                    <FileText className="w-3 h-3" /> {quizInfo.title}
                                  </button>
                                )}
                                <Badge color="slate">{q.chapter}</Badge>
                                <Badge color="amber">{q.difficulty}</Badge>
                              </div>
                              <p className="text-sm font-medium text-slate-900 leading-relaxed">
                                {q.question_text}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteMockWrongAnswer(wa.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                              title="Remove from mistakes"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-1.5 mb-3">
                            <div className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg">
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                              <div className="text-sm">
                                <span className="text-red-600 font-medium">Your answer: </span>
                                <span className="text-slate-700">{userAnswerText}</span>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-2.5 bg-emerald-50 rounded-lg">
                              <span className="text-emerald-600 font-bold text-sm flex-shrink-0 mt-0.5">
                                {q.correct_option.toUpperCase()}.
                              </span>
                              <div className="text-sm">
                                <span className="text-emerald-700 font-medium">Correct: </span>
                                <span className="text-slate-700">{correctText}</span>
                              </div>
                            </div>
                          </div>

                          {(q.explanation || q.exam_tip || q.memory_trick || q.common_mistake) && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : wa.id)}
                              className="text-xs text-blue-600 font-medium hover:text-blue-700"
                            >
                              {isExpanded ? "Hide details" : "Show details"}
                            </button>
                          )}
                          {isExpanded && (
                            <div className="mt-2 space-y-2">
                              {q.explanation && (
                                <div className="p-3 bg-slate-50 rounded-lg">
                                  <p className="text-xs font-semibold text-slate-500 mb-1">Explanation</p>
                                  <p className="text-sm text-slate-700">{q.explanation}</p>
                                </div>
                              )}
                              {q.exam_tip && (
                                <div className="p-3 bg-blue-50 rounded-lg">
                                  <p className="text-xs font-semibold text-blue-600 mb-1">Exam Tip</p>
                                  <p className="text-sm text-slate-700">{q.exam_tip}</p>
                                </div>
                              )}
                              {q.memory_trick && (
                                <div className="p-3 bg-purple-50 rounded-lg">
                                  <p className="text-xs font-semibold text-purple-600 mb-1">Memory Trick</p>
                                  <p className="text-sm text-slate-700">{q.memory_trick}</p>
                                </div>
                              )}
                              {q.common_mistake && (
                                <div className="p-3 bg-amber-50 rounded-lg">
                                  <p className="text-xs font-semibold text-amber-600 mb-1">Common Mistake</p>
                                  <p className="text-sm text-slate-700">{q.common_mistake}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-slate-400 mt-3">
                            Answered on {new Date(wa.answered_at).toLocaleDateString(undefined, {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {filteredMock.length === 0 && (
                  <Card className="p-6">
                    <EmptyState
                      icon={<Trophy className="w-12 h-12" />}
                      title="No mistakes for this mock"
                      description="You haven't answered any questions incorrectly in this mock test. Try another filter."
                    />
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </main>

      <BottomNav active="progress" onNavigate={onNavigate} />
    </div>
  );
}
