import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase, type FeaturedQuiz, type FeaturedQuizAttempt } from "../lib/supabase";
import { fetchOverallStats, fetchRecentSessions, type OverallStats } from "../lib/analytics";
import { Card, Button, ProgressBar, Badge, EmptyState, Spinner } from "../components/ui";
import {
  Brain, TrendingUp, TrendingDown, Target, Clock, ChevronRight, Award, AlertCircle, BookOpen, Trophy,
} from "lucide-react";

interface DashboardProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [featuredQuizzes, setFeaturedQuizzes] = useState<FeaturedQuiz[]>([]);
  const [featuredAttempts, setFeaturedAttempts] = useState<Record<string, FeaturedQuizAttempt>>({});
  const [featuredCreator, setFeaturedCreator] = useState<Record<string, string>>({});
  const [featuredTotalCount, setFeaturedTotalCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [s, r] = await Promise.all([
          fetchOverallStats(user.id),
          fetchRecentSessions(user.id, 5),
        ]);
        setStats(s);
        setRecent(r);

        // Fetch latest featured quiz and user attempts
        const { data: fqs } = await supabase
          .from("featured_quizzes")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);
        setFeaturedQuizzes((fqs || []) as FeaturedQuiz[]);

        // Also get the total count for "View All (N)"
        const { count } = await supabase
          .from("featured_quizzes")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true);
        setFeaturedTotalCount(count || 0);

        const { data: attempts } = await supabase
          .from("featured_quiz_attempts")
          .select("*")
          .eq("user_id", user.id);
        const attMap: Record<string, FeaturedQuizAttempt> = {};
        (attempts || []).forEach((a: any) => { attMap[a.featured_quiz_id] = a; });
        setFeaturedAttempts(attMap);

        // Fetch creator emails
        const creatorIds = Array.from(new Set((fqs || []).map((q: any) => q.created_by)));
        if (creatorIds.length > 0) {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("user_id, email")
            .in("user_id", creatorIds);
          const cMap: Record<string, string> = {};
          (profiles || []).forEach((p: any) => { cMap[p.user_id] = p.email; });
          setFeaturedCreator(cMap);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

  const accuracy = stats?.overallAccuracy ?? 0;
  const accuracyColor = accuracy >= 70 ? "green" : accuracy >= 50 ? "amber" : "red";

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 to-blue-950 text-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">IBPS SO IT Quiz</h1>
              <p className="text-xs text-slate-400 leading-tight">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-slate-300 hover:bg-white/10">
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Hero stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Target className="w-4 h-4" />
              <span className="text-xs font-medium">Accuracy</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{accuracy.toFixed(0)}%</p>
            <div className="mt-2"><ProgressBar value={accuracy} color={accuracyColor} /></div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-medium">Attempted</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats?.totalAttempted ?? 0}</p>
            <p className="text-xs text-slate-400 mt-1">{stats?.totalCorrect ?? 0} correct</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium">Sessions</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats?.totalSessions ?? 0}</p>
            <p className="text-xs text-slate-400 mt-1">Quizzes taken</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Award className="w-4 h-4" />
              <span className="text-xs font-medium">Strong areas</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{stats?.strongChapters.length ?? 0}</p>
            <p className="text-xs text-slate-400 mt-1">{stats?.weakChapters.length ?? 0} weak</p>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate("quiz-setup")}
            className="group bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-5 text-left shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-base">Start Quiz</p>
                <p className="text-blue-100 text-sm mt-0.5">Practice with existing questions</p>
              </div>
              <ChevronRight className="w-5 h-5 text-blue-200 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
          <button
            onClick={() => onNavigate("quiz-setup", { mode: "ai" })}
            className="group bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-5 text-left shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-base">Generate AI Quiz</p>
                <p className="text-slate-300 text-sm mt-0.5">AI-generated IBPS SO IT questions</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>

        {/* Latest Featured Mock Test */}
        {featuredQuizzes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h2 className="font-semibold text-slate-900">Latest Mock Test</h2>
              </div>
              <button
                onClick={() => onNavigate("featured-mocks")}
                className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-0.5"
              >
                View All ({featuredTotalCount}) <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {(() => {
              const fq = featuredQuizzes[0];
              const att = featuredAttempts[fq.id];
              const completed = !!att;
              const score = att ? (att.correct_count / att.total_questions) * 100 : 0;
              const creatorName = featuredCreator[fq.created_by] || "Unknown";
              return (
                <Card key={fq.id} className="p-5 ring-1 ring-amber-200">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge color="amber">Latest</Badge>
                        {completed ? (
                          <Badge color="green">Completed</Badge>
                        ) : (
                          <Badge color="blue">Not Attempted</Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-slate-900 mt-1">{fq.title}</h3>
                      <p className="text-xs text-slate-400 mb-3">Shared by {creatorName}</p>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className="flex items-center gap-1 text-slate-600">
                          <BookOpen className="w-4 h-4 text-slate-400" /> {fq.question_count} Questions
                        </span>
                        <span className="flex items-center gap-1 text-slate-600">
                          <Clock className="w-4 h-4 text-slate-400" /> {fq.duration_minutes} min
                        </span>
                        <span className="flex items-center gap-1 text-slate-600 capitalize">
                          <Target className="w-4 h-4 text-slate-400" /> {fq.difficulty}
                        </span>
                        {completed && (
                          <span className="flex items-center gap-1 text-slate-600">
                            <Award className="w-4 h-4 text-slate-400" /> {score.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {completed ? (
                        <Button variant="secondary" onClick={() => onNavigate("featured-quiz", { quizId: fq.id, attemptId: att.id })}>
                          <span className="flex items-center gap-1.5">Review <ChevronRight className="w-4 h-4" /></span>
                        </Button>
                      ) : (
                        <Button onClick={() => onNavigate("featured-quiz", { quizId: fq.id })}>
                          <span className="flex items-center gap-1.5">Start <ChevronRight className="w-4 h-4" /></span>
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })()}
          </div>
        )}

        {/* Strong / Weak summary */}
        {(stats?.strongChapters.length || stats?.weakChapters.length) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h2 className="font-semibold text-slate-900">Strong Chapters</h2>
              </div>
              {stats!.strongChapters.length > 0 ? (
                <div className="space-y-2">
                  {stats!.strongChapters.slice(0, 5).map((c) => (
                    <div key={c.chapter.id} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700 truncate flex-1">{c.chapter.name}</span>
                      <Badge color="green">{c.accuracy.toFixed(0)}%</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Take more quizzes to see your strengths.</p>
              )}
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <h2 className="font-semibold text-slate-900">Weak Chapters</h2>
              </div>
              {stats!.weakChapters.length > 0 ? (
                <div className="space-y-2">
                  {stats!.weakChapters.slice(0, 5).map((c) => (
                    <button
                      key={c.chapter.id}
                      onClick={() => onNavigate("chapter-detail", { chapterId: c.chapter.id })}
                      className="flex items-center justify-between w-full hover:bg-slate-50 rounded-lg px-2 py-1 -mx-2"
                    >
                      <span className="text-sm text-slate-700 truncate flex-1 text-left">{c.chapter.name}</span>
                      <Badge color="red">{c.accuracy.toFixed(0)}%</Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No weak chapters detected yet. Keep practicing!</p>
              )}
            </Card>
          </div>
        ) : null}

        {/* Strong / Weak subtopics */}
        {(stats?.strongSubtopics.length || stats?.weakSubtopics.length) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-5 h-5 text-emerald-600" />
                <h2 className="font-semibold text-slate-900">Strong Subtopics</h2>
              </div>
              {stats!.strongSubtopics.length > 0 ? (
                <div className="space-y-2">
                  {stats!.strongSubtopics.map((s) => (
                    <div key={s.subtopic.id} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700 truncate flex-1">{s.subtopic.name}</span>
                      <Badge color="green">{s.accuracy.toFixed(0)}%</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Answer 3+ questions correctly in a subtopic to see it here.</p>
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
                    <div key={s.subtopic.id} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700 truncate flex-1">{s.subtopic.name}</span>
                      <Badge color="red">{s.accuracy.toFixed(0)}%</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No weak subtopics detected. Great job!</p>
              )}
            </Card>
          </div>
        ) : null}

        {/* Recent sessions */}
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Recent Activity</h2>
          {recent.length > 0 ? (
            <div className="space-y-2">
              {recent.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {s.chapters?.name || "Mixed"} {s.subtopics?.name ? `— ${s.subtopics.name}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(s.started_at).toLocaleDateString()} · {s.mode === "ai" ? "AI" : s.mode}
                    </p>
                  </div>
                  <div className="text-right ml-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {s.correct_count}/{s.total_questions}
                    </span>
                    <p className="text-xs text-slate-400">
                      {s.total_questions > 0 ? ((s.correct_count / s.total_questions) * 100).toFixed(0) : 0}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Clock className="w-12 h-12" />}
              title="No quizzes yet"
              description="Start your first quiz to track progress and see analytics here."
            />
          )}
        </Card>

        {/* Chapter list */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Chapters (by priority)</h2>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("progress")}>
              View all
            </Button>
          </div>
          <div className="space-y-1.5">
            {stats?.chapterStats.map((c) => (
              <button
                key={c.chapter.id}
                onClick={() => onNavigate("chapter-detail", { chapterId: c.chapter.id })}
                className="flex items-center justify-between w-full p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                    {c.chapter.priority}
                  </span>
                  <span className="text-sm font-medium text-slate-700 truncate">{c.chapter.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {c.totalAttempted > 0 ? (
                    <Badge color={c.accuracy >= 70 ? "green" : c.accuracy >= 50 ? "amber" : "red"}>
                      {c.accuracy.toFixed(0)}%
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-400">Not started</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        </Card>
      </main>

      {/* Bottom nav */}
      <BottomNav active="dashboard" onNavigate={onNavigate} />
    </div>
  );
}

export function BottomNav({ active, onNavigate }: { active: string; onNavigate: (s: string) => void }) {
  const items = [
    { id: "dashboard", label: "Home", icon: Brain },
    { id: "quiz-setup", label: "Quiz", icon: Target },
    { id: "featured-mocks", label: "Mocks", icon: Trophy },
    { id: "progress", label: "Progress", icon: TrendingUp },
    { id: "manage", label: "Questions", icon: BookOpen },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20">
      <div className="max-w-5xl mx-auto flex">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
                isActive ? "text-blue-600" : "text-slate-400"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
