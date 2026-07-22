import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { fetchChapterStats, type ChapterStat } from "../lib/analytics";
import { Card, Button, Badge, ProgressBar, Spinner, EmptyState } from "../components/ui";
import { ArrowLeft, Target, TrendingUp, TrendingDown, ChevronRight, FileQuestion } from "lucide-react";

interface ChapterDetailProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
  params: Record<string, string>;
}

export default function ChapterDetail({ onNavigate, params }: ChapterDetailProps) {
  const { user } = useAuth();
  const [stat, setStat] = useState<ChapterStat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const s = await fetchChapterStats(user.id, params.chapterId);
      setStat(s);
      setLoading(false);
    })();
  }, [user, params.chapterId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

  if (!stat) return null;

  const strongSubs = stat.subtopics.filter((s) => s.totalAttempted >= 3 && s.accuracy >= 75).sort((a, b) => b.accuracy - a.accuracy);
  const weakSubs = stat.subtopics.filter((s) => s.totalAttempted >= 3 && s.accuracy < 50).sort((a, b) => a.accuracy - b.accuracy);
  const attemptedSubs = stat.subtopics.filter((s) => s.totalAttempted > 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => onNavigate("progress")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 truncate">{stat.chapter.name}</h1>
            <p className="text-xs text-slate-400">Priority #{stat.chapter.priority}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Summary */}
        <Card className="p-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900">{stat.totalAttempted}</p>
              <p className="text-xs text-slate-500">Attempted</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{stat.correctCount}</p>
              <p className="text-xs text-slate-500">Correct</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{stat.accuracy.toFixed(0)}%</p>
              <p className="text-xs text-slate-500">Accuracy</p>
            </div>
          </div>
          {stat.totalAttempted > 0 && (
            <div className="mt-4">
              <ProgressBar value={stat.accuracy} color={stat.accuracy >= 70 ? "green" : stat.accuracy >= 50 ? "amber" : "red"} />
            </div>
          )}
        </Card>

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            onClick={() => onNavigate("quiz-setup", { preselectChapter: stat.chapter.id })}
            size="lg"
          >
            <span className="flex items-center justify-center gap-2"><Target className="w-4 h-4" /> Practice This Chapter</span>
          </Button>
          {stat.totalAttempted > 0 && (
            <Button
              variant="secondary"
              onClick={() => onNavigate("attempted-questions", { chapterId: stat.chapter.id })}
              size="lg"
            >
              <span className="flex items-center justify-center gap-2"><FileQuestion className="w-4 h-4" /> View Attempted ({stat.totalAttempted})</span>
            </Button>
          )}
        </div>

        {stat.totalAttempted === 0 ? (
          <EmptyState
            icon={<Target className="w-12 h-12" />}
            title="No data yet"
            description="Take a quiz on this chapter to see your subtopic-level progress here."
          />
        ) : (
          <>
            {/* Strong / Weak subtopics */}
            {(strongSubs.length > 0 || weakSubs.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {strongSubs.length > 0 && (
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                      <h2 className="font-semibold text-slate-900">Strong Subtopics</h2>
                    </div>
                    <div className="space-y-2">
                      {strongSubs.map((s) => (
                        <div key={s.subtopic.id} className="flex items-center justify-between">
                          <span className="text-sm text-slate-700 truncate flex-1">{s.subtopic.name}</span>
                          <Badge color="green">{s.accuracy.toFixed(0)}%</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {weakSubs.length > 0 && (
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingDown className="w-5 h-5 text-red-500" />
                      <h2 className="font-semibold text-slate-900">Needs Improvement</h2>
                    </div>
                    <div className="space-y-2">
                      {weakSubs.map((s) => (
                        <div key={s.subtopic.id} className="flex items-center justify-between">
                          <span className="text-sm text-slate-700 truncate flex-1">{s.subtopic.name}</span>
                          <Badge color="red">{s.accuracy.toFixed(0)}%</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* All subtopics */}
            <Card className="p-5">
              <h2 className="font-semibold text-slate-900 mb-3">All Subtopics</h2>
              <div className="space-y-3">
                {stat.subtopics.map((s) => (
                  <div key={s.subtopic.id}>
                    <div className="flex items-center justify-between mb-1">
                      <button
                        onClick={() => s.totalAttempted > 0 && onNavigate("attempted-questions", { chapterId: stat.chapter.id, subtopicId: s.subtopic.id })}
                        className={`flex items-center gap-2 min-w-0 text-left ${s.totalAttempted > 0 ? "cursor-pointer" : "cursor-default"}`}
                      >
                        <span className="text-xs text-slate-400">#{s.subtopic.priority}</span>
                        <span className={`text-sm truncate ${s.totalAttempted > 0 ? "text-slate-700 hover:text-blue-600" : "text-slate-700"}`}>{s.subtopic.name}</span>
                      </button>
                      {s.totalAttempted > 0 ? (
                        <span className="text-xs text-slate-500 flex-shrink-0">
                          {s.correctCount}/{s.totalAttempted} · {s.accuracy.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                    {s.totalAttempted > 0 && (
                      <ProgressBar value={s.accuracy} color={s.accuracy >= 70 ? "green" : s.accuracy >= 50 ? "amber" : "red"} />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
