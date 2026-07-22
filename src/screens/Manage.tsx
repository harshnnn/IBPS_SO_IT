import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase, type Chapter, type Subtopic, type Question, type Option } from "../lib/supabase";
import { Card, Button, Badge, Spinner, EmptyState } from "../components/ui";
import { BottomNav } from "./Dashboard";
import { Plus, Sparkles, Trash2, FileText, ArrowLeft } from "lucide-react";

interface ManageProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
}

export default function Manage({ onNavigate }: ManageProps) {
  const { user } = useAuth();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"add" | "list">("add");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedSubtopic, setSelectedSubtopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual question form
  const [qText, setQText] = useState("");
  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [optC, setOptC] = useState("");
  const [optD, setOptD] = useState("");
  const [correctOpt, setCorrectOpt] = useState<Option>("a");
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // AI generation
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  useEffect(() => {
    (async () => {
      const [{ data: ch }, { data: sub }] = await Promise.all([
        supabase.from("chapters").select("*").order("priority"),
        supabase.from("subtopics").select("*").order("priority"),
      ]);
      setChapters(ch || []);
      setSubtopics(sub || []);
      setLoading(false);
    })();
  }, []);

  const loadQuestions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("questions")
      .select("*")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setQuestions(data || []);
  };

  useEffect(() => {
    if (tab === "list") loadQuestions();
  }, [tab]);

  const filteredSubtopics = subtopics.filter((s) => s.chapter_id === selectedChapter);

  const resetForm = () => {
    setQText(""); setOptA(""); setOptB(""); setOptC(""); setOptD("");
    setCorrectOpt("a"); setExplanation("");
  };

  const saveManual = async () => {
    if (!user || !selectedChapter || !qText || !optA || !optB || !optC || !optD) {
      alert("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("questions").insert({
        chapter_id: selectedChapter,
        subtopic_id: selectedSubtopic || null,
        question_text: qText,
        option_a: optA,
        option_b: optB,
        option_c: optC,
        option_d: optD,
        correct_option: correctOpt,
        explanation: explanation || null,
        source: "manual",
        difficulty,
        created_by: user.id,
      });
      if (error) throw error;
      resetForm();
      alert("Question saved!");
    } catch (err: any) {
      alert(err.message);
    }
    setSaving(false);
  };

  const generateAI = async () => {
    if (!user || !selectedChapter) {
      alert("Please select a chapter first");
      return;
    }
    setGenerating(true);
    try {
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
            count: aiCount,
            difficulty: aiDifficulty,
            saveToDb: true,
          }),
        },
      );
      if (!res.ok) throw new Error("Generation failed");
      const { questions, error } = await res.json();
      if (error) throw new Error(error);
      alert(`Generated and saved ${questions.length} questions!`);
    } catch (err: any) {
      alert(err.message);
    }
    setGenerating(false);
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await supabase.from("questions").delete().eq("id", id);
    loadQuestions();
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
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="font-bold text-slate-900">Manage Questions</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setTab("add")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "add" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            Add Questions
          </button>
          <button
            onClick={() => setTab("list")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            My Questions ({questions.length})
          </button>
        </div>

        {/* Chapter & subtopic selector (shared) */}
        <Card className="p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Chapter</label>
            <select
              value={selectedChapter}
              onChange={(e) => { setSelectedChapter(e.target.value); setSelectedSubtopic(""); }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
            >
              <option value="">Select chapter...</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.priority}. {ch.name}</option>
              ))}
            </select>
          </div>
          {selectedChapter && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Subtopic (optional)</label>
              <select
                value={selectedSubtopic}
                onChange={(e) => setSelectedSubtopic(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
              >
                <option value="">All subtopics</option>
                {filteredSubtopics.map((s) => (
                  <option key={s.id} value={s.id}>{s.priority}. {s.name}</option>
                ))}
              </select>
            </div>
          )}
        </Card>

        {tab === "add" ? (
          <>
            {/* AI Generation */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h2 className="font-semibold text-slate-900">AI Generate Questions</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Generate IBPS SO IT-specific questions (PYQ-style, frequently asked, or most expected) using AI.
              </p>
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Count</label>
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    {[3, 5, 10, 15].map((n) => <option key={n} value={n}>{n} questions</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Difficulty</label>
                  <select
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white capitalize"
                  >
                    {["easy", "medium", "hard"].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <Button onClick={generateAI} disabled={!selectedChapter || generating} className="w-full">
                {generating ? (
                  <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Generating...</span>
                ) : (
                  <span className="flex items-center justify-center gap-2"><Sparkles className="w-4 h-4" /> Generate & Save</span>
                )}
              </Button>
            </Card>

            {/* Manual entry */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="font-semibold text-slate-900">Add Manually</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Question *</label>
                  <textarea
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                    placeholder="Enter the question..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { key: "a" as Option, val: optA, set: setOptA },
                    { key: "b" as Option, val: optB, set: setOptB },
                    { key: "c" as Option, val: optC, set: setOptC },
                    { key: "d" as Option, val: optD, set: setOptD },
                  ]).map(({ key, val, set }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Option {key.toUpperCase()} {correctOpt === key && "✓"}
                      </label>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                        placeholder={`Option ${key.toUpperCase()}`}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Correct Answer</label>
                  <div className="flex gap-2">
                    {(["a", "b", "c", "d"] as Option[]).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setCorrectOpt(opt)}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold uppercase transition-all ${
                          correctOpt === opt ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Explanation (optional)</label>
                  <textarea
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                    placeholder="Why is this the correct answer?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Difficulty</label>
                  <div className="flex gap-2">
                    {(["easy", "medium", "hard"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                          difficulty === d ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <Button onClick={saveManual} disabled={saving} className="w-full">
                  {saving ? (
                    <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Saving...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Save Question</span>
                  )}
                </Button>
              </div>
            </Card>
          </>
        ) : (
          /* List of my questions */
          <Card className="p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Your Questions</h2>
            {questions.length > 0 ? (
              <div className="space-y-3">
                {questions.map((q) => (
                  <div key={q.id} className="p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-slate-800 flex-1">{q.question_text}</p>
                      <button
                        onClick={() => deleteQuestion(q.id)}
                        className="p-1 text-slate-400 hover:text-red-500 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Badge color="slate">{q.difficulty}</Badge>
                      <Badge color={q.source === "ai" ? "purple" : "blue"}>{q.source}</Badge>
                      <Badge color="green">Ans: {q.correct_option.toUpperCase()}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="No questions yet"
                description="Add questions manually or generate them with AI using the Add tab."
              />
            )}
          </Card>
        )}
      </main>

      <BottomNav active="manage" onNavigate={onNavigate} />
    </div>
  );
}
