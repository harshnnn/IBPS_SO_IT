import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase, type FeaturedQuizWithCreator } from "../lib/supabase";
import { Card, Badge, Spinner, EmptyState } from "../components/ui";
import { BottomNav } from "./Dashboard";
import { Trophy, Clock, BookOpen, Play, CheckCircle, Trophy as TrophyIcon } from "lucide-react";

interface FeaturedMocksProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
}

export default function FeaturedMocks({ onNavigate }: FeaturedMocksProps) {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<FeaturedQuizWithCreator[]>([]);
  const [attemptedIds, setAttemptedIds] = useState<Set<string>>(new Set());
  const [attemptCountMap, setAttemptCountMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: fqs } = await supabase
          .from("featured_quizzes")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        const { data: attempts } = await supabase
          .from("featured_quiz_attempts")
          .select("featured_quiz_id, id")
          .eq("user_id", user.id);

        const creatorIds = Array.from(new Set((fqs || []).map((q: any) => q.created_by)));
        const creatorMap: Record<string, string> = {};
        if (creatorIds.length > 0) {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("user_id, email")
            .in("user_id", creatorIds);
          (profiles || []).forEach((p: any) => { creatorMap[p.user_id] = p.email; });
        }

        const mapped = (fqs || []).map((fq: any) => ({
          ...fq,
          creator_email: creatorMap[fq.created_by] || "Unknown",
        })) as FeaturedQuizWithCreator[];

        setQuizzes(mapped);
        setAttemptedIds(new Set((attempts || []).map((a) => a.featured_quiz_id)));
        setAttemptCountMap(
          Object.fromEntries(
            (attempts || []).reduce<Record<string, number>>((acc, a) => {
              acc[a.featured_quiz_id] = (acc[a.featured_quiz_id] || 0) + 1;
              return acc;
            }, {}),
            Object.entries({} as Record<string, number>)
          )
        );
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

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-gradient-to-r from-slate-900 to-blue-950 text-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <TrophyIcon className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="font-bold text-lg">Featured Mock Tests</h1>
            <p className="text-xs text-slate-400">All shared mock tests</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {quizzes.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={<Trophy className="w-12 h-12" />}
              title="No mock tests yet"
              description="Featured mock tests will appear here once they're shared."
            />
          </Card>
        ) : (
          quizzes.map((quiz, idx) => {
            const attempted = attemptedIds.has(quiz.id);
            const isLatest = idx === 0;
            return (
              <Card
                key={quiz.id}
                className={`p-5 cursor-pointer hover:shadow-md transition-shadow ${isLatest ? "ring-2 ring-amber-300" : ""}`}
                onClick={() => onNavigate("featured-quiz", { quizId: quiz.id })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isLatest && <Badge color="amber">Latest</Badge>}
                      {attempted ? (
                        <Badge color="green">
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> {(attemptCountMap[quiz.id] || 0) > 1 ? `Done x${attemptCountMap[quiz.id]}` : "Completed"}
                          </span>
                        </Badge>
                      ) : (
                        <Badge color="blue">New</Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 truncate">{quiz.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Shared by {quiz.creator_email || "Unknown"}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" /> {quiz.question_count} Qs
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {quiz.duration_minutes} min
                      </span>
                      <Badge color="slate">{quiz.difficulty}</Badge>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <Play className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </main>

      <BottomNav active="featured-mocks" onNavigate={onNavigate} />
    </div>
  );
}
