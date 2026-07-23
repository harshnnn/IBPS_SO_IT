import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase, type Chapter, type Subtopic, type Question, type Option } from "../lib/supabase";
import { Card, Button, Badge, Spinner, EmptyState } from "../components/ui";
import { BottomNav } from "./Dashboard";
import { Plus, Sparkles, Trash2, FileText, Link2, Youtube, MessageSquare, CheckCircle, AlertCircle, Trophy, Clipboard } from "lucide-react";

interface ManageProps {
  onNavigate: (screen: string, params?: Record<string, string>) => void;
}

export default function Manage({ onNavigate }: ManageProps) {
  const { user } = useAuth();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"add" | "import" | "featured" | "list">("add");

  // Featured Quiz Mock creation
  const [fqJson, setFqJson] = useState("");
  const [fqTitle, setFqTitle] = useState("Featured Quiz Mock #1");
  const [fqDuration, setFqDuration] = useState(30);
  const [fqDifficulty, setFqDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [fqImportCount, setFqImportCount] = useState(25);
  const [fqSaving, setFqSaving] = useState(false);
  const [fqError, setFqError] = useState("");
  const [fqSuccess, setFqSuccess] = useState("");
  const [existingFeaturedQuizzes, setExistingFeaturedQuizzes] = useState<any[]>([]);
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

  // Import from URL
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; sourceType: string; distribution: Record<string, number> } | null>(null);
  const [importError, setImportError] = useState("");

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
    if (tab === "featured") loadFeaturedQuizzes();
  }, [tab]);

  const loadFeaturedQuizzes = async () => {
    const { data } = await supabase
      .from("featured_quizzes")
      .select("*")
      .order("created_at", { ascending: false });
    setExistingFeaturedQuizzes(data || []);
  };

  const validateAndSaveFeaturedQuiz = async () => {
    if (!user) return;
    setFqError("");
    setFqSuccess("");

    let parsed: any[];
    try {
      parsed = JSON.parse(fqJson);
    } catch (e: any) {
      setFqError("Invalid JSON: " + e.message);
      return;
    }

    if (!Array.isArray(parsed)) {
      setFqError("JSON must be an array of question objects.");
      return;
    }

    if (parsed.length === 0) {
      setFqError("No questions found in the JSON array.");
      return;
    }

    // Take only the requested number of questions
    const toImport = parsed.slice(0, fqImportCount);

    // Validate each question
    const errors: string[] = [];
    toImport.forEach((q, i) => {
      const num = i + 1;
      if (!q.question) errors.push(`Q${num}: missing "question" field`);
      if (!q.options || !Array.isArray(q.options) || q.options.length < 4)
        errors.push(`Q${num}: "options" must be an array with at least 4 items`);
      if (!q.answer || !"abcdeABCDE".includes(q.answer))
        errors.push(`Q${num}: "answer" must be A, B, C, D, or E`);
      if (q.difficulty && !["easy", "medium", "hard", "Easy", "Medium", "Hard"].includes(q.difficulty))
        errors.push(`Q${num}: "difficulty" must be easy, medium, or hard`);
    });

    if (errors.length > 0) {
      setFqError("Validation errors:\n• " + errors.join("\n• "));
      return;
    }

    setFqSaving(true);
    try {
      // Create or update featured quiz
      const slug = fqTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: existingQuiz } = await supabase
        .from("featured_quizzes")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      let quizId: string;

      if (existingQuiz) {
        // Update existing quiz
        const { data: updated, error: updErr } = await supabase
          .from("featured_quizzes")
          .update({
            title: fqTitle,
            duration_minutes: fqDuration,
            difficulty: fqDifficulty,
            question_count: toImport.length,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingQuiz.id)
          .select()
          .single();
        if (updErr) throw updErr;
        quizId = updated.id;
        // Delete old questions
        await supabase.from("featured_questions").delete().eq("featured_quiz_id", quizId);
      } else {
        const { data: newQuiz, error: quizErr } = await supabase
          .from("featured_quizzes")
          .insert({
            title: fqTitle,
            slug,
            description: `A ${fqDifficulty} mock test with ${toImport.length} questions.`,
            duration_minutes: fqDuration,
            difficulty: fqDifficulty,
            question_count: toImport.length,
            created_by: user.id,
            is_active: true,
          })
          .select()
          .single();
        if (quizErr) throw quizErr;
        quizId = newQuiz.id;
      }

      // Insert questions
      const rows = toImport.map((q, i) => {
        const answer = q.answer.toLowerCase();
        const options = q.options;
        const optionExplanations: Record<string, string> = {};
        (options || []).forEach((opt: any) => {
          const key = (opt.id || "").toLowerCase();
          if ("abcde".includes(key) && opt.explanation) {
            optionExplanations[key] = opt.explanation;
          }
        });

        return {
          featured_quiz_id: quizId,
          position: i + 1,
          chapter: q.chapter || "General",
          subtopic: q.subtopic || "General",
          difficulty: (q.difficulty || "medium").toLowerCase(),
          question_text: q.question,
          option_a: options[0]?.text || options[0] || "",
          option_b: options[1]?.text || options[1] || "",
          option_c: options[2]?.text || options[2] || "",
          option_d: options[3]?.text || options[3] || "",
          option_e: options[4]?.text || options[4] || null,
          correct_option: answer,
          explanation: options.find((o: any) => (o.id || "").toLowerCase() === answer)?.explanation || q.summary?.explanation || null,
          exam_tip: q.examTip || null,
          memory_trick: q.memoryTrick || null,
          common_mistake: q.commonMistake || null,
          related_concepts: q.relatedConcepts || [],
          summary_title: q.summary?.title || null,
          summary_explanation: q.summary?.explanation || null,
          option_explanations: optionExplanations,
        };
      });

      const { error: qErr } = await supabase.from("featured_questions").insert(rows);
      if (qErr) throw qErr;

      setFqSuccess(`Successfully saved "${fqTitle}" with ${rows.length} questions!`);
      setFqJson("");
      loadFeaturedQuizzes();
    } catch (err: any) {
      setFqError(err.message || "Failed to save featured quiz");
    }
    setFqSaving(false);
  };

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

  const importFromUrl = async () => {
    if (!user || !selectedChapter || !importUrl) {
      setImportError("Please select a chapter and enter a URL.");
      return;
    }
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-questions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            url: importUrl,
            chapterId: selectedChapter,
            subtopicId: selectedSubtopic || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }
      setImportResult({
        count: data.count,
        sourceType: data.sourceType,
        distribution: data.distribution,
      });
    } catch (err: any) {
      setImportError(err.message);
    }
    setImporting(false);
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
            Add
          </button>
          <button
            onClick={() => setTab("import")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "import" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            Import
          </button>
          <button
            onClick={() => setTab("featured")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "featured" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            Featured Mock
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
              onChange={(e) => { setSelectedChapter(e.target.value); setSelectedSubtopic(""); setImportResult(null); }}
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
                <option value="">All subtopics (auto-detect)</option>
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
        ) : tab === "import" ? (
          <>
            {/* Import from URL */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-5 h-5 text-blue-600" />
                <h2 className="font-semibold text-slate-900">Import Questions from URL</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Paste a shared ChatGPT conversation link or a YouTube video/playlist link. The AI will extract all multiple-choice questions and automatically sort them into the correct subtopics within the selected chapter.
              </p>

              {/* Source type badges */}
              <div className="flex gap-2 mb-4">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium text-slate-600">ChatGPT Shares</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                  <Youtube className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-medium text-slate-600">YouTube</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">URL *</label>
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => {
                      setImportUrl(e.target.value);
                      setImportResult(null);
                      setImportError("");
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="https://chatgpt.com/share/... or https://youtube.com/watch?v=..."
                  />
                </div>

                {importError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{importError}</p>
                  </div>
                )}

                {importResult && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
                      <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-emerald-800">
                          {importResult.count} questions imported from {importResult.sourceType === "youtube" ? "YouTube" : importResult.sourceType === "chatgpt" ? "ChatGPT" : "the web"}!
                        </p>
                      </div>
                    </div>

                    {/* Subtopic distribution */}
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <p className="text-xs font-medium text-slate-600 mb-2">Distributed across subtopics:</p>
                      <div className="space-y-1.5">
                        {Object.entries(importResult.distribution).map(([subName, count]) => (
                          <div key={subName} className="flex items-center justify-between text-sm">
                            <span className="text-slate-700">{subName}</span>
                            <Badge color="blue">{count} {count === 1 ? "question" : "questions"}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => { setImportUrl(""); setImportResult(null); }} className="flex-1">
                        Import Another
                      </Button>
                      <Button onClick={() => onNavigate("quiz-setup", { preselectChapter: selectedChapter })} className="flex-1">
                        Practice Now
                      </Button>
                    </div>
                  </div>
                )}

                {!importResult && (
                  <Button onClick={importFromUrl} disabled={!selectedChapter || !importUrl || importing} className="w-full">
                    {importing ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner size={16} /> Fetching & extracting questions...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Link2 className="w-4 h-4" /> Import Questions
                      </span>
                    )}
                  </Button>
                )}

                {!selectedChapter && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Select a chapter above first.
                  </p>
                )}

                {/* Info note */}
                <div className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-700 leading-relaxed">
                    <strong>How it works:</strong> The app fetches the page content, sends it to Google Gemini AI that identifies all MCQ-style questions, determines the correct answers, and assigns each question to the most relevant subtopic within the selected chapter. Imported questions are added to your shared question bank and appear in practice quizzes immediately. For full tests spanning multiple subjects, select the "Miscellaneous" chapter.
                  </p>
                </div>
              </div>
            </Card>
          </>
        ) : tab === "featured" ? (
          <>
            {/* Create Featured Quiz Mock */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h2 className="font-semibold text-slate-900">Create Featured Quiz Mock</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Paste a JSON array of questions to create a public mock test. Every user will be able to attempt it once and see their results. The quiz is editable — saving with the same title will update the existing quiz.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Quiz Title</label>
                  <input
                    type="text"
                    value={fqTitle}
                    onChange={(e) => setFqTitle(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="Featured Quiz Mock #1"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Questions to Import</label>
                    <input
                      type="number"
                      value={fqImportCount}
                      onChange={(e) => setFqImportCount(Number(e.target.value))}
                      min={1}
                      max={100}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Duration (min)</label>
                    <input
                      type="number"
                      value={fqDuration}
                      onChange={(e) => setFqDuration(Number(e.target.value))}
                      min={1}
                      max={180}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Difficulty</label>
                    <select
                      value={fqDifficulty}
                      onChange={(e) => setFqDifficulty(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white capitalize"
                    >
                      {["easy", "medium", "hard"].map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Questions JSON *</label>
                  <textarea
                    value={fqJson}
                    onChange={(e) => { setFqJson(e.target.value); setFqError(""); setFqSuccess(""); }}
                    rows={10}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-y"
                    placeholder={`[\n  {\n    "id": 1,\n    "chapter": "DBMS",\n    "subtopic": "Normalization",\n    "difficulty": "Easy",\n    "question": "What is 3NF?",\n    "options": [\n      {"id": "A", "text": "...", "isCorrect": false, "explanation": "..."},\n      {"id": "B", "text": "...", "isCorrect": true, "explanation": "..."},\n      {"id": "C", "text": "...", "isCorrect": false, "explanation": "..."},\n      {"id": "D", "text": "...", "isCorrect": false, "explanation": "..."}\n    ],\n    "answer": "B",\n    "summary": {"title": "...", "explanation": "..."},\n    "examTip": "...",\n    "memoryTrick": "...",\n    "commonMistake": "...",\n    "relatedConcepts": []\n  }\n]`}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Paste a JSON array following the schema. Only the first {fqImportCount} questions will be imported.
                  </p>
                </div>

                {fqError && (
                  <div className="p-3 bg-red-50 rounded-xl">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <pre className="text-sm text-red-700 whitespace-pre-wrap font-sans">{fqError}</pre>
                    </div>
                  </div>
                )}

                {fqSuccess && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm text-emerald-800">{fqSuccess}</p>
                  </div>
                )}

                <Button onClick={validateAndSaveFeaturedQuiz} disabled={!fqJson || fqSaving} className="w-full">
                  {fqSaving ? (
                    <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Validating & saving...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2"><Trophy className="w-4 h-4" /> Validate & Save Featured Mock</span>
                  )}
                </Button>
              </div>
            </Card>

            {/* Existing featured quizzes */}
            {existingFeaturedQuizzes.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-slate-900 mb-3">Existing Featured Quizzes</h3>
                <div className="space-y-2">
                  {existingFeaturedQuizzes.map((fq) => (
                    <div key={fq.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{fq.title}</p>
                        <p className="text-xs text-slate-400">{fq.question_count} questions • {fq.duration_minutes} min • {fq.difficulty}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {fq.is_active ? <Badge color="green">Active</Badge> : <Badge color="slate">Inactive</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
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
                      <Badge color={q.source === "ai" ? "purple" : q.source === "chatgpt" ? "green" : q.source === "youtube" ? "red" : "blue"}>{q.source}</Badge>
                      <Badge color="green">Ans: {q.correct_option.toUpperCase()}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="No questions yet"
                description="Add questions manually, generate them with AI, or import from a URL using the other tabs."
              />
            )}
          </Card>
        )}
      </main>

      <BottomNav active="manage" onNavigate={onNavigate} />
    </div>
  );
}
