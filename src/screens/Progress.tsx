import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { fetchOverallStats, fetchWrongAnswers, type OverallStats } from "../lib/analytics";
import { Card, Badge, ProgressBar, Spinner } from "../components/ui";
import { BottomNav } from "./Dashboard";
import { Award, AlertCircle, XCircle, ChevronRight } from "lucide-react";

interface ProgressProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
}

export default function Progress({ onNavigate }: ProgressProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [wrongAnswers, setWrongAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [s, w] = await Promise.all([
        fetchOverallStats(user.id),
        fetchWrongAnswers(user.id, 200),
      ]);
      setStats(s);
      setWrongAnswers(w);
      setLoading(false);
    })();
  }, [user]);

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
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="font-bold text-slate-900">Your Progress</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Mistakes shortcut */}
        <button
          onClick={() => onNavigate("mistakes")}
          className="group w-full bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-2xl p-4 text-left shadow-sm hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Mistakes</p>
                <p className="text-red-100 text-xs mt-0.5">
                  {wrongAnswers.length} incorrect {wrongAnswers.length === 1 ? "answer" : "answers"} to review
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Overall stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{stats?.totalAttempted ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">Attempted</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats?.totalCorrect ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">Correct</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{(stats?.overallAccuracy ?? 0).toFixed(0)}%</p>
            <p className="text-xs text-slate-500 mt-0.5">Accuracy</p>
          </Card>
        </div>

        {/* Strong / Weak subtopics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-900">Strong Subtopics</h2>
            </div>
            {stats!.strongSubtopics.length > 0 ? (
              <div className="space-y-2">
                {stats!.strongSubtopics.map((s) => (
                  <div key={s.subtopic.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 truncate flex-1">{s.subtopic.name}</span>
                      <Badge color="green">{s.accuracy.toFixed(0)}%</Badge>
                    </div>
                    <ProgressBar value={s.accuracy} color="green" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Answer 3+ questions in a subtopic with 75%+ accuracy to see it here.</p>
            )}
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h2 className="font-semibold text-slate-900">Needs Improvement</h2>
            </div>
            {stats!.weakSubtopics.length > 0 ? (
              <div className="space-y-2">
                {stats!.weakSubtopics.map((s) => (
                  <div key={s.subtopic.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 truncate flex-1">{s.subtopic.name}</span>
                      <Badge color="red">{s.accuracy.toFixed(0)}%</Badge>
                    </div>
                    <ProgressBar value={s.accuracy} color="red" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No weak subtopics. Keep it up!</p>
            )}
          </Card>
        </div>

        {/* Chapter breakdown */}
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Chapter Breakdown</h2>
          <div className="space-y-3">
            {stats?.chapterStats.map((c) => (
              <button
                key={c.chapter.id}
                onClick={() => onNavigate("chapter-detail", { chapterId: c.chapter.id })}
                className="block w-full text-left"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-slate-400 font-bold">#{c.chapter.priority}</span>
                    <span className="text-sm font-medium text-slate-800 truncate">{c.chapter.name}</span>
                  </div>
                  {c.totalAttempted > 0 ? (
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {c.correctCount}/{c.totalAttempted} · {c.accuracy.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Not started</span>
                  )}
                </div>
                {c.totalAttempted > 0 && (
                  <ProgressBar value={c.accuracy} color={c.accuracy >= 70 ? "green" : c.accuracy >= 50 ? "amber" : "red"} />
                )}
              </button>
            ))}
          </div>
        </Card>
      </main>

      <BottomNav active="progress" onNavigate={onNavigate} />
    </div>
  );
}
