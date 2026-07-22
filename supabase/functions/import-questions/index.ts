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

    // Prefer Gemini; fall back to OpenAI if only that key is present
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!geminiKey && !openaiKey) {
      return new Response(
        JSON.stringify({ error: "AI is not configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in Supabase secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch chapter and its subtopics
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

    // Determine source type and fetch content
    const isYouTube = /youtube\.com|youtu\.be/.test(url);
    const isChatGPT = /chatgpt\.com\/share|chat\.openai\.com\/share/.test(url);
    const sourceType = isYouTube ? "youtube" : isChatGPT ? "chatgpt" : "web";

    // Fetch the page content
    let rawContent = "";
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
      rawContent = await res.text();
    } catch (fetchErr) {
      return new Response(
        JSON.stringify({ error: `Could not fetch the URL: ${(fetchErr as Error).message}. Some sites (like ChatGPT) may block server-side access.` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Clean HTML to text
    const textContent = htmlToText(rawContent, isYouTube);

    if (textContent.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: "The page content was too short to extract questions from. The site may require JavaScript to render content (ChatGPT shares and YouTube pages may not work with server-side fetching)." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract questions via AI (Gemini preferred, OpenAI fallback)
    let questions: ExtractedQuestion[] = [];
    try {
      if (geminiKey) {
        questions = await extractQuestionsWithGemini(
          geminiKey,
          textContent,
          chapter.name,
          subtopicNames,
          isYouTube,
        );
      } else if (openaiKey) {
        questions = await extractQuestionsWithOpenAI(
          openaiKey,
          textContent,
          chapter.name,
          subtopicNames,
          isYouTube,
        );
      }
    } catch (aiErr) {
      const msg = (aiErr as Error).message;
      // If Gemini quota exceeded and OpenAI is available, try it as fallback
      if (geminiKey && openaiKey && (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED"))) {
        try {
          questions = await extractQuestionsWithOpenAI(
            openaiKey,
            textContent,
            chapter.name,
            subtopicNames,
            isYouTube,
          );
        } catch (fallbackErr) {
          return new Response(
            JSON.stringify({ error: `Both Gemini and OpenAI failed. Gemini: ${msg}. OpenAI: ${(fallbackErr as Error).message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: `AI extraction failed: ${msg}` }),
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

    // Map suggested subtopics to DB subtopic IDs
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

    const transcriptMatches = html.matchAll(/"text":"([^"]+)"/g);
    const transcript = Array.from(transcriptMatches).map((m) => m[1]).join(" ");
    if (transcript.length > 100) text = text + "\n\n" + transcript;
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

  if (text.length > 30000) text = text.substring(0, 30000);
  return text;
}

function buildExtractionPrompt(
  content: string,
  chapterName: string,
  subtopicNames: string[],
  isYouTube: boolean,
): string {
  const subtopicList = subtopicNames.length > 0
    ? subtopicNames.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "No subtopics defined.";

  return `You are an expert examiner for the IBPS SO IT exam. Analyze the following content and extract ALL multiple-choice questions from it.

The content is from ${isYouTube ? "a YouTube video" : "a shared conversation/page"} about "${chapterName}".

For each question found, provide:
- The question text (cleaned up)
- Exactly 4 options (a, b, c, d)
- The correct answer
- A brief explanation
- Difficulty level (easy, medium, or hard)
- Which subtopic of "${chapterName}" it belongs to

Available subtopics for "${chapterName}":
${subtopicList}

Rules:
1. Extract every distinct question you can find in the content.
2. If options aren't explicitly labeled, infer them from the content.
3. If the correct answer isn't stated, determine it based on your knowledge.
4. If a question doesn't clearly fit any listed subtopic, set suggested_subtopic to "General".
5. Clean up question text — remove numbering, "Q:", prefixes, etc.
6. Each option should be concise (ideally under 100 chars).
7. Return ONLY valid JSON, no markdown or code fences.

Content to analyze:
---
${content}
---

Return JSON in this format:
{"questions":[{"question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"a","explanation":"...","difficulty":"medium","suggested_subtopic":"Subtopic Name"}]}`;
}

// Gemini API (preferred — generous free tier)
async function extractQuestionsWithGemini(
  apiKey: string,
  content: string,
  chapterName: string,
  subtopicNames: string[],
  isYouTube: boolean,
): Promise<ExtractedQuestion[]> {
  const prompt = buildExtractionPrompt(content, chapterName, subtopicNames, isYouTube);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
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
  if (!Array.isArray(qs) || qs.length === 0) {
    throw new Error("No questions found in AI response");
  }
  return qs;
}

// OpenAI fallback
async function extractQuestionsWithOpenAI(
  apiKey: string,
  content: string,
  chapterName: string,
  subtopicNames: string[],
  isYouTube: boolean,
): Promise<ExtractedQuestion[]> {
  const prompt = buildExtractionPrompt(content, chapterName, subtopicNames, isYouTube);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert at extracting quiz questions from educational content. Output only valid JSON." },
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
  if (!Array.isArray(qs) || qs.length === 0) {
    throw new Error("No questions found in AI response");
  }
  return qs;
}
