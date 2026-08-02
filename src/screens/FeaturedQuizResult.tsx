import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { supabase, type FeaturedQuestion, type Option } from "../lib/supabase";
import { Card, Button, Badge, ProgressBar } from "../components/ui";
import { CircularProgress } from "../components/CircularProgress";
import { ArrowLeft, Check, X, Clock, Home, Eye, MinusCircle, RotateCcw } from "lucide-react";

interface FeaturedQuizResultProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
  params: Record<string, string>;
}

interface ChapterPerf {
  chapter: string;
  total: number;
  correct: number;
}
interface TopicPerf {
  topic: string;
  total: number;
  correct: number;
}

export default function FeaturedQuizResult({ onNavigate, params }: FeaturedQuizResultProps) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<FeaturedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, Option | null>>({});
  const [timeTaken, setTimeTaken] = useState(0);
  const [attemptId, setAttemptId] = useState("");

  useEffect(() => {
    try {
      setQuestions(JSON.parse(params.questions || "[]"));
      setAnswers(JSON.parse(params.answers || "{}"));
      setTimeTaken(parseInt(params.timeTaken || "0", 10));
      setAttemptId(params.attemptId || "");
    } catch {}
  }, []);

  const correctCount = questions.filter((q) => answers[q.id] === q.correct_option).length;
  const incorrectCount = questions.filter((q) => answers[q.id] && answers[q.id] !== q.correct_option).length;
  const skippedCount = questions.filter((q) => !answers[q.id]).length;
  const accuracy = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
  const accuracyColor = accuracy >= 70 ? "#10b981" : accuracy >= 50 ? "#f59e0b" : "#ef4444";

  // Chapter-wise performance
  const chapterMap = new Map<string, ChapterPerf>();
  questions.forEach((q) => {
    const entry = chapterMap.get(q.chapter) || { chapter: q.chapter, total: 0, correct: 0 };
    entry.total++;
    if (answers[q.id] === q.correct_option) entry.correct++;
    chapterMap.set(q.chapter, entry);
  });
  const chapterPerf = Array.from(chapterMap.values()).sort((a, b) => b.total - a.total);

  // Topic-wise (subtopic) performance
  const topicMap = new Map<string, TopicPerf>();
  questions.forEach((q) => {
    const entry = topicMap.get(q.subtopic) || { topic: q.subtopic, total: 0, correct: 0 };
    entry.total++;
    if (answers[q.id] === q.correct_option) entry.correct++;
    topicMap.set(q.subtopic, entry);
  });
  const topicPerf = Array.from(topicMap.values()).sort((a, b) => b.total - a.total);

  const grade = accuracy >= 90 ? "Outstanding!" : accuracy >= 75 ? "Excellent!" : accuracy >= 60 ? "Good job!" : accuracy >= 40 ? "Keep practicing" : "Needs improvement";
  const mins = Math.floor(timeTaken / 60);
  const secs = timeTaken % 60;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-gradient-to-r from-slate-900 to-blue-950 text-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => onNavigate("featured-quiz", { quizId: params.featuredQuizId, attemptId })} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-base">Mock Test Results</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Score card with circular progress */}
        <Card className="p-6 text-center">
          <CircularProgress
            value={accuracy}
            size={150}
            strokeWidth={12}
            color={accuracyColor}
            label={`${accuracy.toFixed(0)}%`}
            sublabel="Accuracy"
          />
          <h2 className="text-xl font-bold text-slate-900 mt-4">{grade}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {correctCount} out of {questions.length} correct
          </p>

          <div className="flex justify-center gap-6 mt-5">
            <div className="text-center">
              <div className="flex items-center gap-1 text-emerald-600 justify-center">
                <Check className="w-4 h-4" />
                <span className="text-lg font-bold">{correctCount}</span>
              </div>
              <p className="text-xs text-slate-400">Correct</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1 text-red-500 justify-center">
                <X className="w-4 h-4" />
                <span className="text-lg font-bold">{incorrectCount}</span>
              </div>
              <p className="text-xs text-slate-400">Incorrect</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1 text-slate-400 justify-center">
                <MinusCircle className="w-4 h-4" />
                <span className="text-lg font-bold">{skippedCount}</span>
              </div>
              <p className="text-xs text-slate-400">Skipped</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1 text-blue-600 justify-center">
                <Clock className="w-4 h-4" />
                <span className="text-lg font-bold">{mins}m {secs}s</span>
              </div>
              <p className="text-xs text-slate-400">Time</p>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => onNavigate("featured-quiz", { quizId: params.featuredQuizId, attemptId })} className="flex-1">
            <span className="flex items-center justify-center gap-2"><Eye className="w-4 h-4" /> Review</span>
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("dashboard")} className="flex-1">
            <span className="flex items-center justify-center gap-2"><Home className="w-4 h-4" /> Home</span>
          </Button>
        </div>
        <Button onClick={() => onNavigate("featured-quiz", { quizId: params.featuredQuizId })} size="lg" className="w-full">
          <span className="flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Reattempt Mock Test</span>
        </Button>

        {/* Chapter-wise performance */}
        {chapterPerf.length > 1 && (
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Chapter-wise Performance</h3>
            <div className="space-y-3">
              {chapterPerf.map((c) => {
                const pct = c.total > 0 ? (c.correct / c.total) * 100 : 0;
                return (
                  <div key={c.chapter}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 truncate">{c.chapter}</span>
                      <span className="text-xs text-slate-500 ml-2 flex-shrink-0">{c.correct}/{c.total}</span>
                    </div>
                    <ProgressBar value={pct} color={pct >= 70 ? "green" : pct >= 50 ? "amber" : "red"} />
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Topic-wise performance */}
        {topicPerf.length > 1 && (
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Topic-wise Performance</h3>
            <div className="space-y-3">
              {topicPerf.map((t) => {
                const pct = t.total > 0 ? (t.correct / t.total) * 100 : 0;
                return (
                  <div key={t.topic}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 truncate">{t.topic}</span>
                      <span className="text-xs text-slate-500 ml-2 flex-shrink-0">{t.correct}/{t.total}</span>
                    </div>
                    <ProgressBar value={pct} color={pct >= 70 ? "green" : pct >= 50 ? "amber" : "red"} />
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
