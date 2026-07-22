import { useState, useEffect } from "react";
import { type Question, type Option } from "../lib/supabase";
import { Button, Card, ProgressBar, Badge } from "../components/ui";
import { ArrowLeft, Check, X, RotateCcw, Home, BookOpen } from "lucide-react";

interface QuizResultProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
  params: Record<string, string>;
}

export default function QuizResult({ onNavigate, params }: QuizResultProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Option>>({});

  useEffect(() => {
    try {
      setQuestions(JSON.parse(params.questions || "[]"));
      setAnswers(JSON.parse(params.answers || "{}"));
    } catch {}
  }, []);

  const correctCount = questions.filter((q) => answers[q.id] === q.correct_option).length;
  const accuracy = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
  const accuracyColor = accuracy >= 70 ? "green" : accuracy >= 50 ? "amber" : "red";

  const grade = accuracy >= 90 ? "Excellent!" : accuracy >= 70 ? "Good job!" : accuracy >= 50 ? "Keep practicing" : "Needs work";

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => onNavigate("dashboard")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="font-bold text-slate-900">Quiz Results</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Score card */}
        <Card className="p-6 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 mb-3">
            <span className={`text-2xl font-bold ${accuracy >= 70 ? "text-emerald-600" : accuracy >= 50 ? "text-amber-600" : "text-red-500"}`}>
              {accuracy.toFixed(0)}%
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">{grade}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {correctCount} out of {questions.length} correct
          </p>
          <div className="mt-4 max-w-xs mx-auto">
            <ProgressBar value={accuracy} color={accuracyColor} />
          </div>
          <div className="flex justify-center gap-6 mt-5">
            <div className="text-center">
              <div className="flex items-center gap-1 text-emerald-600">
                <Check className="w-4 h-4" />
                <span className="text-lg font-bold">{correctCount}</span>
              </div>
              <p className="text-xs text-slate-400">Correct</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1 text-red-500">
                <X className="w-4 h-4" />
                <span className="text-lg font-bold">{questions.length - correctCount}</span>
              </div>
              <p className="text-xs text-slate-400">Incorrect</p>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => onNavigate("quiz-setup")} className="flex-1">
            <span className="flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> New Quiz</span>
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("dashboard")} className="flex-1">
            <span className="flex items-center justify-center gap-2"><Home className="w-4 h-4" /> Home</span>
          </Button>
        </div>

        {/* Answer review */}
        <div>
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-slate-500" /> Review Answers
          </h3>
          <div className="space-y-3">
            {questions.map((q, i) => {
              const userAnswer = answers[q.id];
              const isCorrect = userAnswer === q.correct_option;
              return (
                <Card key={q.id} className="p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <span
                      className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                      }`}
                    >
                      {isCorrect ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </span>
                    <p className="text-sm font-medium text-slate-900 leading-relaxed">
                      {i + 1}. {q.question_text}
                    </p>
                  </div>

                  <div className="space-y-1.5 ml-8">
                    {(["a", "b", "c", "d"] as Option[]).map((opt) => {
                      const isUser = userAnswer === opt;
                      const isRight = q.correct_option === opt;
                      return (
                        <div
                          key={opt}
                          className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                            isRight
                              ? "bg-emerald-50 text-emerald-800"
                              : isUser
                              ? "bg-red-50 text-red-700"
                              : "text-slate-600"
                          }`}
                        >
                          <span className="font-bold uppercase">{opt}.</span>
                          <span className="flex-1">{(q as any)[`option_${opt}`]}</span>
                          {isRight && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                          {isUser && !isRight && <X className="w-4 h-4 text-red-500 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="ml-8 mt-3 p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs font-medium text-slate-500 mb-1">Explanation</p>
                      <p className="text-sm text-slate-700">{q.explanation}</p>
                    </div>
                  )}

                  <div className="ml-8 mt-2 flex gap-2">
                    <Badge color="slate">{q.difficulty}</Badge>
                    {q.source === "ai" ? <Badge color="purple">AI</Badge> : <Badge color="blue">Manual</Badge>}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
