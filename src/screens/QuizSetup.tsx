import { useEffect, useState } from "react";
import { supabase, type Chapter, type Subtopic } from "../lib/supabase";
import { Card, Button, Badge, Spinner } from "../components/ui";
import { BottomNav } from "./Dashboard";
import { ChevronRight, Sparkles, FileText, ArrowLeft, Check } from "lucide-react";

interface QuizSetupProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
  initialMode?: string;
  initialParams?: Record<string, string>;
}

export default function QuizSetup({ onNavigate, initialMode, initialParams }: QuizSetupProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>("");
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>("");
  const [mode, setMode] = useState<"manual" | "ai">(initialMode === "ai" ? "ai" : "manual");
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: ch }, { data: sub }] = await Promise.all([
        supabase.from("chapters").select("*").order("priority"),
        supabase.from("subtopics").select("*").order("priority"),
      ]);
      setChapters(ch || []);
      setSubtopics(sub || []);
      if (initialParams?.preselectChapter) {
        setSelectedChapter(initialParams.preselectChapter);
      }
      setLoading(false);
    })();
  }, []);

  const filteredSubtopics = subtopics.filter((s) => s.chapter_id === selectedChapter);

  const startQuiz = async () => {
    if (!selectedChapter) return;
    setStarting(true);

    try {
      if (mode === "ai") {
        const chapter = chapters.find((c) => c.id === selectedChapter);
        const subtopic = subtopics.find((s) => s.id === selectedSubtopic);
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-questions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({
              chapterName: chapter?.name,
              subtopicName: subtopic?.name,
              count: numQuestions,
              difficulty,
              saveToDb: true,
            }),
          },
        );
        if (!res.ok) throw new Error("Failed to generate questions");
        const { questions, error } = await res.json();
        if (error) throw new Error(error);
        onNavigate("quiz-take", {
          mode: "ai",
          chapterId: selectedChapter,
          subtopicId: selectedSubtopic,
          questions: JSON.stringify(questions),
        });
      } else {
        let query = supabase.from("questions").select("*").eq("chapter_id", selectedChapter);
        if (selectedSubtopic) query = query.eq("subtopic_id", selectedSubtopic);
        const { data: questions, error } = await query.limit(numQuestions);
        if (error) throw error;
        if (!questions || questions.length === 0) {
          alert("No questions found for this selection. Try adding questions or use AI generation.");
          setStarting(false);
          return;
        }
        onNavigate("quiz-take", {
          mode: "manual",
          chapterId: selectedChapter,
          subtopicId: selectedSubtopic,
          questions: JSON.stringify(questions),
        });
      }
    } catch (err: any) {
      alert(err.message || "Failed to start quiz");
      setStarting(false);
    }
  };

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
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => onNavigate("dashboard")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="font-bold text-slate-900">Set Up Quiz</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Mode selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Question Source</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("manual")}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                mode === "manual" ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
              }`}
            >
              <FileText className={`w-5 h-5 mb-2 ${mode === "manual" ? "text-blue-600" : "text-slate-400"}`} />
              <p className="font-medium text-sm text-slate-900">Existing Questions</p>
              <p className="text-xs text-slate-500 mt-0.5">From the question bank</p>
            </button>
            <button
              onClick={() => setMode("ai")}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                mode === "ai" ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
              }`}
            >
              <Sparkles className={`w-5 h-5 mb-2 ${mode === "ai" ? "text-blue-600" : "text-slate-400"}`} />
              <p className="font-medium text-sm text-slate-900">AI Generated</p>
              <p className="text-xs text-slate-500 mt-0.5">Fresh IBPS SO IT questions</p>
            </button>
          </div>
        </div>

        {/* Chapter selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Chapter <span className="text-slate-400 font-normal">(priority order)</span>
          </label>
          <Card className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {chapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setSelectedChapter(ch.id);
                  setSelectedSubtopic("");
                }}
                className={`flex items-center justify-between w-full p-3 text-left transition-colors ${
                  selectedChapter === ch.id ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                    {ch.priority}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{ch.name}</p>
                    <p className="text-xs text-slate-400 truncate">{ch.description}</p>
                  </div>
                </div>
                {selectedChapter === ch.id && <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />}
              </button>
            ))}
          </Card>
        </div>

        {/* Subtopic selection */}
        {selectedChapter && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Subtopic <span className="text-slate-400 font-normal">(optional — leave empty for all)</span>
            </label>
            <Card className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              <button
                onClick={() => setSelectedSubtopic("")}
                className={`flex items-center justify-between w-full p-3 text-left transition-colors ${
                  selectedSubtopic === "" ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="text-sm font-medium text-slate-700">All subtopics</span>
                {selectedSubtopic === "" && <Check className="w-5 h-5 text-blue-600" />}
              </button>
              {filteredSubtopics.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setSelectedSubtopic(sub.id)}
                  className={`flex items-center justify-between w-full p-3 text-left transition-colors ${
                    selectedSubtopic === sub.id ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-slate-400">#{sub.priority}</span>
                    <span className="text-sm font-medium text-slate-700 truncate">{sub.name}</span>
                  </div>
                  {selectedSubtopic === sub.id && <Check className="w-5 h-5 text-blue-600" />}
                </button>
              ))}
            </Card>
          </div>
        )}

        {/* Number of questions */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Number of Questions</label>
          <div className="flex gap-2">
            {[5, 10, 15, 20].map((n) => (
              <button
                key={n}
                onClick={() => setNumQuestions(n)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  numQuestions === n ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty (AI mode only) */}
        {mode === "ai" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Difficulty</label>
            <div className="flex gap-2">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${
                    difficulty === d ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Start */}
        <Button
          onClick={startQuiz}
          disabled={!selectedChapter || starting}
          size="lg"
          className="w-full"
        >
          {starting ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size={18} /> {mode === "ai" ? "Generating questions..." : "Loading..."}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              {mode === "ai" ? <Sparkles className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              Start {mode === "ai" ? "AI " : ""}Quiz
            </span>
          )}
        </Button>
      </main>

      <BottomNav active="quiz-setup" onNavigate={onNavigate} />
    </div>
  );
}
