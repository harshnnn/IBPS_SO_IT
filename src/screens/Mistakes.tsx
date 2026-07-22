import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { Card, Badge, Spinner, EmptyState, Button } from "../components/ui";
import { BottomNav } from "./Dashboard";
import { XCircle, Trash2, BookOpen, Filter, ArrowLeft } from "lucide-react";

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

interface MistakesProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
}

export default function Mistakes({ onNavigate }: MistakesProps) {
  const { user } = useAuth();
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [chapters, setChapters] = useState<Record<string, string>>({});
  const [subtopics, setSubtopics] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [chapterFilter, setChapterFilter] = useState<string>("");
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

  const deleteWrongAnswer = async (answerId: string) => {
    if (!confirm("Remove this question from your mistakes?")) return;
    const { error } = await supabase.from("user_answers").delete().eq("id", answerId);
    if (error) {
      alert(error.message);
      return;
    }
    setWrongAnswers((prev) => prev.filter((wa) => wa.id !== answerId));
  };

  const clearAll = async () => {
    if (!user || wrongAnswers.length === 0) return;
    if (!confirm(`Delete all ${wrongAnswers.length} incorrect answer records? This cannot be undone.`)) return;
    const ids = wrongAnswers.map((wa) => wa.id);
    const { error } = await supabase.from("user_answers").delete().in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    setWrongAnswers([]);
  };

  const filtered = chapterFilter
    ? wrongAnswers.filter((wa) => wa.questions?.chapter_id === chapterFilter)
    : wrongAnswers;

  const chapterOptions = Array.from(
    new Set(wrongAnswers.map((wa) => wa.questions?.chapter_id).filter(Boolean) as string[])
  ).map((id) => ({ id, name: chapters[id] || "Unknown" }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

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
              <p className="text-xs text-slate-400">{filtered.length} incorrect {filtered.length === 1 ? "answer" : "answers"}</p>
            </div>
          </div>
          {wrongAnswers.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-red-500 hover:bg-red-50">
              Clear All
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {wrongAnswers.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={<XCircle className="w-12 h-12" />}
              title="No mistakes yet"
              description="Questions you answer incorrectly will appear here so you can review and learn from them. Take a quiz to get started!"
            />
          </Card>
        ) : (
          <>
            {/* Chapter filter */}
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

            {/* Wrong answers list */}
            <div className="space-y-3">
              {filtered.map((wa) => {
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

                      {/* Your answer vs correct */}
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

                      {/* Expandable explanation */}
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

            {filtered.length === 0 && (
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
      </main>

      <BottomNav active="progress" onNavigate={onNavigate} />
    </div>
  );
}
