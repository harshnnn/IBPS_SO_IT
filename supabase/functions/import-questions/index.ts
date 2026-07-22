import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExtractedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "a" | "b" | "c" | "d";
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  suggested_subtopic: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { url, chapterId, subtopicId } = await req.json();

    if (!url || !chapterId) {
      return new Response(
        JSON.stringify({ error: "url and chapterId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!geminiKey && !openaiKey) {
      return new Response(
        JSON.stringify({ error: "AI is not configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in Supabase secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: chapter } = await supabase
      .from("chapters")
      .select("id, name")
      .eq("id", chapterId)
      .maybeSingle();
    if (!chapter) {
      return new Response(
        JSON.stringify({ error: "Chapter not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: subtopics } = await supabase
      .from("subtopics")
      .select("id, name")
      .eq("chapter_id", chapterId)
      .order("priority");

    const subtopicNames = (subtopics || []).map((s) => s.name);

    const isYouTube = /youtube\.com|youtu\.be/.test(url);
    const isChatGPT = /chatgpt\.com\/share|chat\.openai\.com\/share/.test(url);
    const sourceType = isYouTube ? "youtube" : isChatGPT ? "chatgpt" : "web";

    // Fetch content (page HTML + YouTube transcript if applicable)
    let rawContent = "";
    let transcriptText = "";
    let fetchError = "";

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawContent = await res.text();
    } catch (fetchErr) {
      fetchError = (fetchErr as Error).message;
    }

    // For YouTube, try to fetch transcript via the timedtext API
    if (isYouTube) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        transcriptText = await fetchYouTubeTranscript(videoId);
      }
    }

    const textContent = htmlToText(rawContent, isYouTube) + (transcriptText ? "\n\n" + transcriptText : "");

    if (textContent.trim().length < 100) {
      return new Response(
        JSON.stringify({
          error: `Could not extract enough text from the URL${fetchError ? ` (fetch error: ${fetchError})` : ""}. ChatGPT shares and YouTube pages are JavaScript-rendered and may not work with server-side fetching. Try pasting the conversation text directly instead of the link.`,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Try heuristic extraction (no AI needed — works even when APIs are down)
    let questions = heuristicExtract(textContent);

    // Step 2: If heuristic found nothing, try AI (Gemini first, then OpenAI)
    let aiProvider = "";
    if (questions.length === 0) {
      const aiResult = await tryAIExtraction(
        geminiKey, openaiKey, textContent, chapter.name, subtopicNames, isYouTube,
      );
      if (aiResult.questions.length > 0) {
        questions = aiResult.questions;
        aiProvider = aiResult.provider;
      } else if (aiResult.error) {
        return new Response(
          JSON.stringify({ error: aiResult.error }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (questions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No quiz questions were found in the provided content." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Map subtopics
    const subtopicMap = new Map<string, string>();
    (subtopics || []).forEach((s) => subtopicMap.set(s.name.toLowerCase(), s.id));

    const rows = questions.map((q) => {
      let resolvedSubtopicId: string | null = subtopicId || null;
      if (!resolvedSubtopicId && q.suggested_subtopic) {
        const suggested = q.suggested_subtopic.toLowerCase();
        for (const [name, id] of subtopicMap.entries()) {
          if (suggested.includes(name) || name.includes(suggested)) {
            resolvedSubtopicId = id;
            break;
          }
        }
      }
      return {
        chapter_id: chapterId,
        subtopic_id: resolvedSubtopicId,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        explanation: q.explanation,
        source: sourceType,
        difficulty: q.difficulty,
        created_by: user.id,
      };
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("questions")
      .insert(rows)
      .select("id, question_text, subtopic_id, difficulty, source");

    if (insertErr) throw new Error(`Failed to save questions: ${insertErr.message}`);

    const distribution: Record<string, number> = {};
    (inserted || []).forEach((q: any) => {
      const subName = q.subtopic_id
        ? subtopics?.find((s) => s.id === q.subtopic_id)?.name || "Unknown"
        : "General";
      distribution[subName] = (distribution[subName] || 0) + 1;
    });

    return new Response(
      JSON.stringify({
        questions: inserted,
        count: inserted?.length || 0,
        sourceType,
        distribution,
        method: questions.length > 0 && aiProvider ? `ai-${aiProvider}` : "heuristic",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------- Heuristic extraction (no AI required) ----------

function heuristicExtract(text: string): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  const seen = new Set<string>();

  // Normalize text: ensure line breaks after question markers
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/&nbsp;/g, " ");

  // Split into blocks by question markers: Q1, Q:, 1., What, How, Which, etc.
  // Match patterns like:
  //   Q1. What is...?
  //   1) What is...?
  //   1. Which of the following...?
  //   What is the OSI layer...?
  const blockRegex = /(?:Q\s*(?:uestion)?\s*\d*\s*[:.\)]?|(?:^|\n)\s*\d+\s*[.):]\s*|(?:^|\n)\s*[A-Z]\s*[.):]\s*)/gi;
  const parts = normalized.split(blockRegex).filter((p) => p && p.trim().length > 15);

  // Also try splitting by double-newlines as fallback
  const paragraphs = parts.length > 1 ? parts : normalized.split(/\n{2,}/);

  for (const para of paragraphs) {
    const q = parseQuestionBlock(para.trim());
    if (q && !seen.has(q.question_text.toLowerCase().substring(0, 60))) {
      seen.add(q.question_text.toLowerCase().substring(0, 60));
      questions.push(q);
    }
  }

  return questions.slice(0, 50);
}

function parseQuestionBlock(block: string): ExtractedQuestion | null {
  // Must contain a question mark (loose check for a question)
  if (!block.includes("?")) return null;

  const lines = block.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return null;

  // First line(s) until we hit an option pattern = question text
  let questionText = "";
  let optionStartIdx = 0;

  // Option patterns: (A) / A) / A. / (a) / a) / a. / 1) / 1. / (1)
  const optionPattern = /^(?:\(?([A-Da-d])\)?[.):]\s+|\(?(\d+)\)?[.):]\s+)/;

  for (let i = 0; i < lines.length; i++) {
    if (optionPattern.test(lines[i])) {
      optionStartIdx = i;
      break;
    }
    questionText += (questionText ? " " : "") + lines[i];
  }

  if (!questionText || optionStartIdx === 0) return null;
  questionText = questionText.replace(/^(?:Q\s*(?:uestion)?\s*\d*\s*[:.\)]?\s*)/i, "").trim();
  if (questionText.length < 10 || questionText.length > 500) return null;

  // Parse options
  const options: { letter: string; text: string }[] = [];
  let currentLetter = "";
  let currentText = "";

  for (let i = optionStartIdx; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(optionPattern);
    if (match) {
      if (currentText) {
        options.push({ letter: currentLetter, text: currentText.trim() });
      }
      currentLetter = (match[1] || match[2] || "").toLowerCase();
      currentText = line.replace(optionPattern, "");
    } else {
      // Continuation of current option or answer/explanation
      if (line.match(/^(?:answer|correct|ans)\s*[:=]\s*/i)) {
        break; // answer line, stop parsing options
      }
      currentText += " " + line;
    }
  }
  if (currentText) {
    options.push({ letter: currentLetter, text: currentText.trim() });
  }

  if (options.length < 2) return null;

  // Pad to 4 options if needed (some have only 2-3)
  while (options.length < 4) {
    options.push({ letter: String.fromCharCode(97 + options.length), text: "None of the above" });
  }

  // Try to find the answer in the block
  const answerMatch = block.match(/(?:answer|correct(?:\s+answer)?|ans)\s*[:=]\s*\(?([A-Da-d])\)?/i);
  let correctOption: "a" | "b" | "c" | "d" = "a";
  if (answerMatch) {
    correctOption = answerMatch[1].toLowerCase() as "a" | "b" | "c" | "d";
  } else {
    // Try "Option B is correct" or "(B)" after question
    const altAnswer = block.match(/\bcorrect\s+(?:answer\s+)?(?:is\s+)?(?:option\s+)?\(?([A-Da-d])\)?/i);
    if (altAnswer) {
      correctOption = altAnswer[1].toLowerCase() as "a" | "b" | "c" | "d";
    }
  }

  // Try to find explanation
  const explMatch = block.match(/(?:explanation|reason|because)\s*[:=]\s*(.+?)(?:\n\n|\n(?=[A-Z]|\d)|$)/is);
  const explanation = explMatch ? explMatch[1].trim() : "";

  return {
    question_text: questionText,
    option_a: options[0]?.text || "",
    option_b: options[1]?.text || "",
    option_c: options[2]?.text || "",
    option_d: options[3]?.text || "",
    correct_option: correctOption,
    explanation,
    difficulty: "medium" as const,
    suggested_subtopic: "",
  };
}

// ---------- YouTube transcript fetching ----------

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  // Method 1: Try YouTube's timedtext API
  try {
    const listUrl = `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}`;
    const res = await fetch(listUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const xml = await res.text();
      const texts = xml.matchAll(/<text[^>]*>([^<]+)<\/text>/g);
      const transcript = Array.from(texts).map((m) => decodeHtmlEntities(m[1])).join(" ");
      if (transcript.length > 100) return transcript;
    }
  } catch { /* fall through */ }

  // Method 2: Try fetching the watch page and extracting caption track URLs
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(watchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      // Look for caption track URLs in the page data
      const captionMatches = html.matchAll(/"captionTracks":\[(\{[^]]+\})\]/g);
      for (const m of captionMatches) {
        const trackData = m[1];
        const baseUrlMatch = trackData.match(/"baseUrl":"([^"]+)"/);
        if (baseUrlMatch) {
          const captionUrl = baseUrlMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
          const capRes = await fetch(captionUrl, { signal: AbortSignal.timeout(8000) });
          if (capRes.ok) {
            const capXml = await capRes.text();
            const texts = capXml.matchAll(/<text[^>]*>([^<]+)<\/text>/g);
            const transcript = Array.from(texts).map((t) => decodeHtmlEntities(t[1])).join(" ");
            if (transcript.length > 100) {
              // Truncate transcript to save tokens — first 15k chars is ~3 min of content
              return transcript.substring(0, 15000);
            }
          }
        }
      }
    }
  } catch { /* fall through */ }

  return "";
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\\n/g, " ");
}

// ---------- AI extraction with fallback ----------

async function tryAIExtraction(
  geminiKey: string | undefined,
  openaiKey: string | undefined,
  content: string,
  chapterName: string,
  subtopicNames: string[],
  isYouTube: boolean,
): Promise<{ questions: ExtractedQuestion[]; provider: string; error: string }> {
  const errors: string[] = [];

  // Truncate content aggressively to save tokens (8k chars ≈ 2k tokens)
  const trimmedContent = content.substring(0, 8000);

  const prompt = buildExtractionPrompt(trimmedContent, chapterName, subtopicNames, isYouTube);

  // Try Gemini first (flash-lite has separate quota from flash)
  const geminiModels = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];
  if (geminiKey) {
    for (const model of geminiModels) {
      try {
        const qs = await extractWithGemini(geminiKey, model, prompt);
        if (qs.length > 0) return { questions: qs, provider: `gemini-${model}`, error: "" };
      } catch (err) {
        const msg = (err as Error).message;
        errors.push(`Gemini (${model}): ${msg}`);
        // If it's a 429, try next model; if it's a different error, also try next
        if (!msg.includes("429") && !msg.includes("RESOURCE_EXHAUSTED") && !msg.includes("quota")) {
          break; // non-quota error, don't bother with other models
        }
      }
    }
  }

  // Fallback to OpenAI
  if (openaiKey) {
    try {
      const qs = await extractWithOpenAI(openaiKey, prompt);
      if (qs.length > 0) return { questions: qs, provider: "openai", error: "" };
    } catch (err) {
      errors.push(`OpenAI: ${(err as Error).message}`);
    }
  }

  return { questions: [], provider: "", error: errors.length > 0 ? `Both Gemini and OpenAI failed. ${errors.join(". ")}` : "No AI providers configured." };
}

function buildExtractionPrompt(
  content: string,
  chapterName: string,
  subtopicNames: string[],
  isYouTube: boolean,
): string {
  const subtopicList = subtopicNames.length > 0
    ? subtopicNames.join(", ")
    : "No subtopics defined.";

  return `Extract ALL multiple-choice questions from this ${isYouTube ? "YouTube video" : "page"} about "${chapterName}". Subtopics: ${subtopicList}.

For each: question_text, option_a-d, correct_option (a/b/c/d), explanation, difficulty (easy/medium/hard), suggested_subtopic.

Content:
${content}

Return JSON: {"questions":[{...}]}`;
}

async function extractWithGemini(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<ExtractedQuestion[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const jsonContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonContent) throw new Error("Empty response from Gemini");

  const parsed = JSON.parse(jsonContent);
  const qs: ExtractedQuestion[] = parsed.questions || [];
  if (!Array.isArray(qs) || qs.length === 0) throw new Error("No questions in AI response");
  return qs;
}

async function extractWithOpenAI(
  apiKey: string,
  prompt: string,
): Promise<ExtractedQuestion[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Extract quiz questions from content. Output only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const jsonContent = data.choices?.[0]?.message?.content;
  if (!jsonContent) throw new Error("Empty response from OpenAI");

  const parsed = JSON.parse(jsonContent);
  const qs: ExtractedQuestion[] = parsed.questions || [];
  if (!Array.isArray(qs) || qs.length === 0) throw new Error("No questions in AI response");
  return qs;
}

// ---------- HTML to text ----------

function htmlToText(html: string, isYouTube: boolean): string {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, " ");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, " ");

  if (isYouTube) {
    const descMatch = html.match(/"description":"([^"]{50,})"/);
    if (descMatch) {
      text = descMatch[1].replace(/\\u0026/g, "&").replace(/\\n/g, "\n");
    }
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) text = titleMatch[1] + "\n\n" + text;
  }

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<li[^>]*>/gi, "\n• ");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");

  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&[a-z]+;/gi, " ");

  text = text.replace(/\t/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}
