import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { fetchAttemptedQuestions } from "../lib/analytics";
import { supabase } from "../lib/supabase";
import { Card, Badge, Spinner, EmptyState } from "../components/ui";
import { BottomNav } from "./Dashboard";
import { ArrowLeft, CheckCircle, XCircle, Filter, FileQuestion } from "lucide-react";

interface AttemptedRow {
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

interface AttemptedQuestionsProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
  params: Record<string, string>;
}

const optionLetter = (opt: string) => opt.toUpperCase();

export default function AttemptedQuestions({ onNavigate, params }: AttemptedQuestionsProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<AttemptedRow[]>([]);
  const [chapters, setChapters] = useState<Record<string, string>>({});
  const [subtopics, setSubtopics] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [chapterFilter, setChapterFilter] = useState<string>(params.chapterId || "");
  const [subtopicFilter, setSubtopicFilter] = useState<string>(params.subtopicId || "");
  const [resultFilter, setResultFilter] = useState<"all" | "correct" | "wrong">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: ch }, { data: sub }] = await Promise.all([
        supabase.from("chapters").select("id, name"),
        supabase.from("subtopics").select("id, name, chapter_id"),
      ]);
      const chMap: Record<string, string> = {};
      (ch || []).forEach((c) => (chMap[c.id] = c.name));
      setChapters(chMap);
      const subMap: Record<string, string> = {};
      (sub || []).forEach((s) => (subMap[s.id] = s.name));
      setSubtopics(subMap);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async (chapterId?: string, subtopicId?: string) => {
    if (!user) return;
    const data = await fetchAttemptedQuestions(user.id, {
      chapterId: chapterId ?? (params.chapterId || undefined),
      subtopicId: subtopicId ?? (params.subtopicId || undefined),
    });
    setRows(data as unknown as AttemptedRow[]);
  };

  // Reload when filters change
  useEffect(() => {
    if (loading) return;
    load(chapterFilter, subtopicFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterFilter, subtopicFilter]);

  const filtered = rows.filter((r) => {
    if (resultFilter === "correct" && !r.is_correct) return false;
    if (resultFilter === "wrong" && r.is_correct) return false;
    return true;
  });

  const correctCount = rows.filter((r) => r.is_correct).length;
  const wrongCount = rows.length - correctCount;

  // Subtopic options for the currently selected chapter filter
  const subtopicOptions = Array.from(
    new Set(rows.filter((r) => r.questions).map((r) => r.questions!.subtopic_id).filter(Boolean) as string[])
  ).map((id) => ({ id, name: subtopics[id] || "Unknown" }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

  const title = params.chapterId
    ? chapters[params.chapterId] || "Chapter Questions"
    : params.subtopicId
      ? subtopics[params.subtopicId] || "Subtopic Questions"
      : "All Attempted Questions";

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => onNavigate(params.chapterId ? "chapter-detail" : "progress", params.chapterId ? { chapterId: params.chapterId } : undefined)}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 truncate">{title}</h1>
            <p className="text-xs text-slate-400">
              {filtered.length} {filtered.length === 1 ? "question" : "questions"} · {correctCount} correct · {wrongCount} wrong
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {rows.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={<FileQuestion className="w-12 h-12" />}
              title="No attempted questions"
              description="Take a quiz to see your attempted questions here."
            />
          </Card>
        ) : (
          <>
            {/* Filters */}
            <Card className="p-3 space-y-3">
              {/* Result filter */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {(["all", "correct", "wrong"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setResultFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      resultFilter === f
                        ? f === "wrong"
                          ? "bg-red-600 text-white"
                          : f === "correct"
                            ? "bg-emerald-600 text-white"
                            : "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {f === "all" ? `All (${rows.length})` : f === "correct" ? `Correct (${correctCount})` : `Wrong (${wrongCount})`}
                  </button>
                ))}
              </div>
              {/* Chapter filter (only when not pre-filtered) */}
              {!params.chapterId && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                  <span className="text-xs text-slate-400 flex-shrink-0">Chapter</span>
                  <button
                    onClick={() => { setChapterFilter(""); setSubtopicFilter(""); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      chapterFilter === "" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    All
                  </button>
                  {Object.entries(chapters).map(([id, name]) => {
                    const count = rows.filter((r) => r.questions?.chapter_id === id).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => { setChapterFilter(id); setSubtopicFilter(""); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                          chapterFilter === id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Subtopic filter (only when a chapter is selected or pre-filtered) */}
              {(params.chapterId || chapterFilter) && subtopicOptions.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                  <span className="text-xs text-slate-400 flex-shrink-0">Subtopic</span>
                  <button
                    onClick={() => setSubtopicFilter("")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      subtopicFilter === "" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    All
                  </button>
                  {subtopicOptions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSubtopicFilter(s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                        subtopicFilter === s.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Question list */}
            <div className="space-y-3">
              {filtered.map((row) => {
                const q = row.questions;
                if (!q) return null;
                const isExpanded = expandedId === row.id;
                const chapterName = chapters[q.chapter_id] || "Unknown";
                const subtopicName = q.subtopic_id ? subtopics[q.subtopic_id] : null;
                const userAnswerText = row.selected_option
                  ? `${optionLetter(row.selected_option)}. ${(q as any)[`option_${row.selected_option}`]}`
                  : "Not answered";
                const correctText = `${optionLetter(q.correct_option)}. ${(q as any)[`option_${q.correct_option}`]}`;

                return (
                  <Card key={row.id} className="overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        {row.is_correct ? (
                          <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge color="slate">{chapterName}</Badge>
                            {subtopicName && <Badge color="blue">{subtopicName}</Badge>}
                            <Badge color="amber">{q.difficulty}</Badge>
                            {q.source === "ai" && <Badge color="purple">AI</Badge>}
                            {row.is_correct ? (
                              <Badge color="green">Correct</Badge>
                            ) : (
                              <Badge color="red">Wrong</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-900 leading-relaxed">
                            {q.question_text}
                          </p>
                        </div>
                      </div>

                      {/* Your answer vs correct */}
                      <div className="space-y-1.5 mb-3 ml-8">
                        <div className={`flex items-start gap-2 p-2.5 rounded-lg ${row.is_correct ? "bg-emerald-50" : "bg-red-50"}`}>
                          <span className={`text-sm font-medium flex-shrink-0 ${row.is_correct ? "text-emerald-700" : "text-red-600"}`}>
                            Your answer:
                          </span>
                          <span className="text-sm text-slate-700">{userAnswerText}</span>
                        </div>
                        {!row.is_correct && (
                          <div className="flex items-start gap-2 p-2.5 bg-emerald-50 rounded-lg">
                            <span className="text-sm font-medium text-emerald-700 flex-shrink-0">Correct:</span>
                            <span className="text-sm text-slate-700">{correctText}</span>
                          </div>
                        )}
                      </div>

                      {/* Expandable explanation */}
                      {q.explanation && (
                        <div className="ml-8">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : row.id)}
                            className="text-xs text-blue-600 font-medium hover:text-blue-700"
                          >
                            {isExpanded ? "Hide explanation" : "Show explanation"}
                          </button>
                          {isExpanded && (
                            <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                              <p className="text-sm text-slate-700">{q.explanation}</p>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-slate-400 mt-3 ml-8">
                        Answered on {new Date(row.answered_at).toLocaleDateString(undefined, {
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
                  icon={<FileQuestion className="w-12 h-12" />}
                  title="No questions match this filter"
                  description="Try changing the filters to see more questions."
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
