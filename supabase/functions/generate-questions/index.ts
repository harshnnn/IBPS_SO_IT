import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QuestionPayload {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "a" | "b" | "c" | "d";
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const {
      chapterName,
      subtopicName,
      count = 5,
      difficulty = "medium",
      saveToDb = true,
    } = await req.json();

    if (!chapterName) {
      return new Response(
        JSON.stringify({ error: "chapterName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Resolve user from JWT
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

    let questions: QuestionPayload[] = [];
    let usedFallback = false;
    let aiSource = "fallback";

    // Try OpenAI first (best quality), then Gemini, then static fallback bank
    if (openaiKey) {
      try {
        questions = await generateWithOpenAI(openaiKey, chapterName, subtopicName, count, difficulty);
        aiSource = "openai";
      } catch (openaiErr) {
        console.warn("OpenAI generation failed:", openaiErr.message);
        if (geminiKey) {
          try {
            questions = await generateWithGemini(geminiKey, chapterName, subtopicName, count, difficulty);
            aiSource = "gemini";
          } catch (geminiErr) {
            console.warn("Gemini generation failed, using fallback:", geminiErr.message);
            questions = generateFallback(chapterName, subtopicName, count, difficulty);
            usedFallback = true;
          }
        } else {
          questions = generateFallback(chapterName, subtopicName, count, difficulty);
          usedFallback = true;
        }
      }
    } else if (geminiKey) {
      try {
        questions = await generateWithGemini(geminiKey, chapterName, subtopicName, count, difficulty);
        aiSource = "gemini";
      } catch (aiErr) {
        console.warn("Gemini generation failed, using fallback:", aiErr.message);
        questions = generateFallback(chapterName, subtopicName, count, difficulty);
        usedFallback = true;
      }
    } else {
      questions = generateFallback(chapterName, subtopicName, count, difficulty);
      usedFallback = true;
    }

    if (saveToDb) {
      // Find chapter and subtopic IDs
      const { data: chapter } = await supabase
        .from("chapters")
        .select("id")
        .eq("name", chapterName)
        .maybeSingle();

      let subtopicId: string | null = null;
      if (chapter && subtopicName) {
        const { data: sub } = await supabase
          .from("subtopics")
          .select("id")
          .eq("chapter_id", chapter.id)
          .eq("name", subtopicName)
          .maybeSingle();
        subtopicId = sub?.id ?? null;
      }

      if (chapter) {
        const rows = questions.map((q) => ({
          chapter_id: chapter.id,
          subtopic_id: subtopicId,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option,
          explanation: q.explanation,
          source: "ai",
          difficulty: q.difficulty,
          created_by: user.id,
        }));
        const { data: inserted, error: insertErr } = await supabase
          .from("questions")
          .insert(rows)
          .select("id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, chapter_id, subtopic_id, source, created_by");
        if (insertErr) throw new Error(`Failed to save questions: ${insertErr.message}`);
        if (inserted && inserted.length > 0) {
          // Return the actual DB rows so the frontend has real IDs for FK references
          questions = inserted.map((row: any) => ({
            question_text: row.question_text,
            option_a: row.option_a,
            option_b: row.option_b,
            option_c: row.option_c,
            option_d: row.option_d,
            correct_option: row.correct_option,
            explanation: row.explanation,
            difficulty: row.difficulty,
            id: row.id,
            chapter_id: row.chapter_id,
            subtopic_id: row.subtopic_id,
            source: row.source,
            created_by: row.created_by,
          }));
        }
      }
    }

    return new Response(
      JSON.stringify({ questions, source: usedFallback ? "fallback" : aiSource }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function buildGenPrompt(
  chapterName: string,
  subtopicName: string | undefined,
  count: number,
  difficulty: string,
): string {
  const scope = subtopicName ? `${chapterName} — ${subtopicName}` : chapterName;
  return `You are an expert examiner for the IBPS SO IT (Specialist Officer - IT) exam.
Generate ${count} multiple-choice questions for the topic: "${scope}".
Difficulty: ${difficulty}.

Requirements:
- Questions must be IBPS SO IT specific: from previous year questions (PYQ), frequently asked topics, or most expected questions.
- Each question must have exactly 4 options labeled a, b, c, d.
- Provide the correct answer and a concise explanation.
- Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{"questions":[{"question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"a","explanation":"...","difficulty":"medium"}]}`;
}

async function generateWithGemini(
  apiKey: string,
  chapterName: string,
  subtopicName: string | undefined,
  count: number,
  difficulty: string,
): Promise<QuestionPayload[]> {
  const prompt = buildGenPrompt(chapterName, subtopicName, count, difficulty);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
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
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Empty response from Gemini");

  const parsed = JSON.parse(content);
  const qs: QuestionPayload[] = parsed.questions || parsed;
  if (!Array.isArray(qs) || qs.length === 0) {
    throw new Error("No questions in AI response");
  }
  return qs.slice(0, count);
}

async function generateWithOpenAI(
  apiKey: string,
  chapterName: string,
  subtopicName: string | undefined,
  count: number,
  difficulty: string,
): Promise<QuestionPayload[]> {
  const prompt = buildGenPrompt(chapterName, subtopicName, count, difficulty);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an IBPS SO IT exam question generator. Output only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");

  const parsed = JSON.parse(content);
  const qs: QuestionPayload[] = parsed.questions || parsed;
  if (!Array.isArray(qs) || qs.length === 0) {
    throw new Error("No questions in AI response");
  }
  return qs.slice(0, count);
}

// Fallback curated question bank used when no OPENAI_API_KEY is configured.
// These are real IBPS SO IT-style questions covering the high-priority chapters.
function generateFallback(
  chapterName: string,
  subtopicName: string | undefined,
  count: number,
  _difficulty: string,
): QuestionPayload[] {
  const bank: Record<string, QuestionPayload[]> = {
    cn: [
      {
        question_text: "Which protocol is used for reliable data transfer in the Transport layer of the OSI model?",
        option_a: "UDP", option_b: "TCP", option_c: "IP", option_d: "ARP",
        correct_option: "b",
        explanation: "TCP (Transmission Control Protocol) provides reliable, ordered, error-checked delivery of data between applications running on hosts communicating via an IP network.",
        difficulty: "easy",
      },
      {
        question_text: "What is the default port number for HTTPS?",
        option_a: "80", option_b: "21", option_c: "443", option_d: "8080",
        correct_option: "c",
        explanation: "HTTPS uses port 443 by default, while HTTP uses port 80.",
        difficulty: "easy",
      },
      {
        question_text: "Which layer of the OSI model is responsible for routing packets between networks?",
        option_a: "Data Link Layer", option_b: "Network Layer", option_c: "Transport Layer", option_d: "Session Layer",
        correct_option: "b",
        explanation: "The Network Layer (Layer 3) handles logical addressing and routing of packets across networks using IP.",
        difficulty: "medium",
      },
      {
        question_text: "Which protocol is used to resolve IP addresses to MAC addresses?",
        option_a: "DNS", option_b: "DHCP", option_c: "ARP", option_d: "ICMP",
        correct_option: "c",
        explanation: "ARP (Address Resolution Protocol) maps an IP address to a physical MAC address on a local network.",
        difficulty: "medium",
      },
      {
        question_text: "What is the size of an IPv4 address?",
        option_a: "16 bits", option_b: "32 bits", option_c: "64 bits", option_d: "128 bits",
        correct_option: "b",
        explanation: "IPv4 addresses are 32 bits long, typically represented in dotted-decimal notation (e.g., 192.168.1.1).",
        difficulty: "easy",
      },
      {
        question_text: "Which protocol is used for email retrieval by clients?",
        option_a: "SMTP", option_b: "POP3/IMAP", option_c: "FTP", option_d: "SNMP",
        correct_option: "b",
        explanation: "POP3 and IMAP are used by email clients to retrieve messages from a mail server. SMTP is used for sending.",
        difficulty: "medium",
      },
      {
        question_text: "In subnetting, what does the subnet mask 255.255.255.0 represent in CIDR notation?",
        option_a: "/8", option_b: "/16", option_c: "/24", option_d: "/32",
        correct_option: "c",
        explanation: "255.255.255.0 has 24 bits set to 1, so it is represented as /24 in CIDR notation.",
        difficulty: "medium",
      },
      {
        question_text: "Which device operates at the Data Link Layer of the OSI model?",
        option_a: "Router", option_b: "Hub", option_c: "Switch", option_d: "Repeater",
        correct_option: "c",
        explanation: "A switch operates at Layer 2 (Data Link) and uses MAC addresses to forward frames. Routers operate at Layer 3.",
        difficulty: "medium",
      },
    ],
    dbms: [
      {
        question_text: "Which normal form eliminates transitive dependencies?",
        option_a: "1NF", option_b: "2NF", option_c: "3NF", option_d: "BCNF",
        correct_option: "c",
        explanation: "Third Normal Form (3NF) eliminates transitive dependencies — non-prime attributes dependent on other non-prime attributes.",
        difficulty: "medium",
      },
      {
        question_text: "Which SQL keyword is used to remove duplicate rows from a result set?",
        option_a: "UNIQUE", option_b: "DISTINCT", option_c: "FILTER", option_d: "GROUP BY",
        correct_option: "b",
        explanation: "DISTINCT removes duplicate rows from a SELECT result set.",
        difficulty: "easy",
      },
      {
        question_text: "What does the ACID property 'Isolation' guarantee?",
        option_a: "All changes are permanent once committed",
        option_b: "Concurrent transactions do not interfere with each other",
        option_c: "All operations in a transaction succeed or none do",
        option_d: "Data is consistent before and after a transaction",
        correct_option: "b",
        explanation: "Isolation ensures that concurrent execution of transactions leaves the database in the same state as if they were executed sequentially.",
        difficulty: "medium",
      },
      {
        question_text: "Which join returns all rows from both tables, matching where possible?",
        option_a: "INNER JOIN", option_b: "LEFT JOIN", option_c: "RIGHT JOIN", option_d: "FULL OUTER JOIN",
        correct_option: "d",
        explanation: "FULL OUTER JOIN returns all rows from both tables, with NULLs where there's no match.",
        difficulty: "medium",
      },
      {
        question_text: "Which command is used to remove all records from a table without dropping its structure?",
        option_a: "DROP", option_b: "DELETE", option_c: "TRUNCATE", option_d: "REMOVE",
        correct_option: "c",
        explanation: "TRUNCATE removes all rows quickly without logging individual row deletions. DELETE can have a WHERE clause; TRUNCATE cannot.",
        difficulty: "easy",
      },
      {
        question_text: "In DBMS, what is a 'candidate key'?",
        option_a: "A key that can be NULL",
        option_b: "A minimal set of attributes that uniquely identifies a tuple",
        option_c: "A foreign key reference",
        option_d: "An index on non-unique columns",
        correct_option: "b",
        explanation: "A candidate key is a minimal superkey — the smallest set of attributes that uniquely identifies a row. One is chosen as the primary key.",
        difficulty: "medium",
      },
      {
        question_text: "Which concurrency control protocol uses timestamps to order transactions?",
        option_a: "Two-Phase Locking", option_b: "Timestamp Ordering", option_c: "MVCC", option_d: "Validation Protocol",
        correct_option: "b",
        explanation: "Timestamp Ordering assigns each transaction a unique timestamp and uses it to determine the serializability order.",
        difficulty: "hard",
      },
    ],
    dsa: [
      {
        question_text: "What is the time complexity of binary search on a sorted array of n elements?",
        option_a: "O(n)", option_b: "O(n log n)", option_c: "O(log n)", option_d: "O(1)",
        correct_option: "c",
        explanation: "Binary search halves the search space each step, giving O(log n) time complexity.",
        difficulty: "easy",
      },
      {
        question_text: "Which data structure uses LIFO (Last In, First Out) ordering?",
        option_a: "Queue", option_b: "Stack", option_c: "Linked List", option_d: "Tree",
        correct_option: "b",
        explanation: "A stack follows LIFO — the last element pushed is the first popped.",
        difficulty: "easy",
      },
      {
        question_text: "What is the worst-case time complexity of QuickSort?",
        option_a: "O(n log n)", option_b: "O(n²)", option_c: "O(n)", option_d: "O(log n)",
        correct_option: "b",
        explanation: "QuickSort's worst case is O(n²) when the pivot is always the smallest or largest element. Average case is O(n log n).",
        difficulty: "medium",
      },
      {
        question_text: "In a binary search tree, what is the inorder traversal of a balanced BST?",
        option_a: "Random order", option_b: "Descending order", option_c: "Ascending (sorted) order", option_d: "Level order",
        correct_option: "c",
        explanation: "Inorder traversal of a BST visits nodes in ascending (sorted) order.",
        difficulty: "medium",
      },
      {
        question_text: "Which algorithm is used to find the shortest path in a weighted graph with non-negative weights?",
        option_a: "BFS", option_b: "Dijkstra's Algorithm", option_c: "Kruskal's Algorithm", option_d: "Prim's Algorithm",
        correct_option: "b",
        explanation: "Dijkstra's algorithm finds the shortest path from a source to all vertices in a graph with non-negative edge weights.",
        difficulty: "medium",
      },
      {
        question_text: "What is the space complexity of a recursive implementation of factorial(n)?",
        option_a: "O(1)", option_b: "O(n)", option_c: "O(n!)", option_d: "O(log n)",
        correct_option: "b",
        explanation: "Recursive factorial uses O(n) stack space due to n recursive calls before returning.",
        difficulty: "medium",
      },
      {
        question_text: "Which data structure is best suited for implementing a priority queue?",
        option_a: "Array", option_b: "Linked List", option_c: "Heap", option_d: "Hash Table",
        correct_option: "c",
        explanation: "A heap provides O(log n) insert and extract-min/max, making it ideal for priority queues.",
        difficulty: "medium",
      },
    ],
    cybersecurity: [
      {
        question_text: "Which cryptographic algorithm is a symmetric-key block cipher?",
        option_a: "RSA", option_b: "AES", option_c: "DSA", option_d: "ECC",
        correct_option: "b",
        explanation: "AES (Advanced Encryption Standard) is a symmetric-key block cipher. RSA, DSA, and ECC are asymmetric algorithms.",
        difficulty: "medium",
      },
      {
        question_text: "What does a digital signature provide?",
        option_a: "Only confidentiality", option_b: "Authentication, integrity, and non-repudiation", option_c: "Only access control", option_d: "Only encryption",
        correct_option: "b",
        explanation: "A digital signature ensures authentication, integrity, and non-repudiation of a message.",
        difficulty: "medium",
      },
      {
        question_text: "Which attack involves intercepting and modifying communication between two parties?",
        option_a: "Phishing", option_b: "Man-in-the-Middle", option_c: "SQL Injection", option_d: "DDoS",
        correct_option: "b",
        explanation: "A Man-in-the-Middle (MITM) attack intercepts and potentially modifies communication between two parties.",
        difficulty: "easy",
      },
      {
        question_text: "What does PKI stand for in cybersecurity?",
        option_a: "Private Key Infrastructure", option_b: "Public Key Infrastructure", option_c: "Protocol Key Interface", option_d: "Protected Key Identifier",
        correct_option: "b",
        explanation: "PKI stands for Public Key Infrastructure — a framework for managing digital certificates and public-key encryption.",
        difficulty: "easy",
      },
      {
        question_text: "Which type of firewall inspects packet headers and maintains state information?",
        option_a: "Packet-filtering firewall", option_b: "Stateful inspection firewall", option_c: "Proxy firewall", option_d: "Next-gen firewall",
        correct_option: "b",
        explanation: "Stateful inspection firewalls track the state of active connections and make decisions based on context, not just packet headers.",
        difficulty: "medium",
      },
    ],
    "os-linux": [
      {
        question_text: "Which Linux command is used to change file permissions?",
        option_a: "chown", option_b: "chmod", option_c: "chgrp", option_d: "umask",
        correct_option: "b",
        explanation: "chmod (change mode) modifies file permissions. chown changes ownership, chgrp changes group.",
        difficulty: "easy",
      },
      {
        question_text: "What is the default scheduling algorithm in most Linux kernels?",
        option_a: "Round Robin", option_b: "FCFS", option_c: "CFS (Completely Fair Scheduler)", option_d: "Priority Scheduling",
        correct_option: "c",
        explanation: "The Completely Fair Scheduler (CFS) is the default scheduler in modern Linux kernels, providing fair CPU time to all processes.",
        difficulty: "medium",
      },
      {
        question_text: "Which command displays the current working directory in Linux?",
        option_a: "cwd", option_b: "pwd", option_c: "dir", option_d: "path",
        correct_option: "b",
        explanation: "pwd (print working directory) displays the current directory path.",
        difficulty: "easy",
      },
      {
        question_text: "What is a 'deadlock' in operating systems?",
        option_a: "A process waiting for I/O", option_b: "Two or more processes each waiting for resources held by the other", option_c: "A crash of the system", option_d: "A memory overflow",
        correct_option: "b",
        explanation: "A deadlock occurs when two or more processes are each waiting for a resource the other holds, causing a permanent block.",
        difficulty: "medium",
      },
      {
        question_text: "Which Linux command is used to list running processes?",
        option_a: "ls", option_b: "ps", option_c: "top", option_d: "Both b and c",
        correct_option: "d",
        explanation: "Both 'ps' (snapshot) and 'top' (dynamic) list running processes. 'top' updates in real-time.",
        difficulty: "easy",
      },
    ],
    cloud: [
      {
        question_text: "Which cloud service model provides virtual machines and storage as on-demand infrastructure?",
        option_a: "SaaS", option_b: "PaaS", option_c: "IaaS", option_d: "FaaS",
        correct_option: "c",
        explanation: "IaaS (Infrastructure as a Service) provides virtualized computing resources — VMs, storage, networking — on demand.",
        difficulty: "easy",
      },
      {
        question_text: "What is the primary benefit of containerization using Docker?",
        option_a: "Faster hardware", option_b: "Application portability and isolation", option_c: "More storage", option_d: "Better monitors",
        correct_option: "b",
        explanation: "Docker containers package applications with their dependencies, ensuring they run consistently across environments.",
        difficulty: "medium",
      },
      {
        question_text: "Which Kubernetes object manages a set of identical pods and ensures desired replica count?",
        option_a: "Service", option_b: "Deployment", option_c: "ConfigMap", option_d: "Namespace",
        correct_option: "b",
        explanation: "A Deployment manages a set of pods and maintains a specified number of replicas, handling scaling and updates.",
        difficulty: "medium",
      },
      {
        question_text: "What does 'auto-scaling' mean in cloud computing?",
        option_a: "Automatically resizing images", option_b: "Dynamically adjusting resources based on load", option_c: "Scaling the database schema", option_d: "Increasing screen resolution",
        correct_option: "b",
        explanation: "Auto-scaling automatically adds or removes compute resources based on current demand or traffic load.",
        difficulty: "easy",
      },
    ],
    aiml: [
      {
        question_text: "Which type of machine learning uses labeled training data?",
        option_a: "Unsupervised learning", option_b: "Supervised learning", option_c: "Reinforcement learning", option_d: "Transfer learning",
        correct_option: "b",
        explanation: "Supervised learning trains on labeled data — input-output pairs — to predict outputs for new inputs.",
        difficulty: "easy",
      },
      {
        question_text: "What does the 'softmax' function do in a neural network?",
        option_a: "Removes noise from data", option_b: "Converts logits to a probability distribution", option_c: "Scales features", option_d: "Reduces dimensionality",
        correct_option: "b",
        explanation: "Softmax converts a vector of raw scores (logits) into a probability distribution where all values sum to 1.",
        difficulty: "medium",
      },
      {
        question_text: "Which algorithm is used for classification and regression in supervised learning?",
        option_a: "K-Means", option_b: "SVM (Support Vector Machine)", option_c: "PCA", option_d: "Apriori",
        correct_option: "b",
        explanation: "SVM is a supervised learning algorithm used for both classification and regression tasks.",
        difficulty: "medium",
      },
      {
        question_text: "What is 'overfitting' in machine learning?",
        option_a: "Model performs well on training data but poorly on new data", option_b: "Model is too simple", option_c: "Training takes too long", option_d: "Data has too many features",
        correct_option: "a",
        explanation: "Overfitting occurs when a model learns training data too closely, including noise, and generalizes poorly to unseen data.",
        difficulty: "medium",
      },
    ],
    iot: [
      {
        question_text: "Which protocol is commonly used for lightweight messaging in IoT?",
        option_a: "HTTP", option_b: "MQTT", option_c: "FTP", option_d: "SMTP",
        correct_option: "b",
        explanation: "MQTT is a lightweight publish-subscribe messaging protocol designed for constrained IoT devices.",
        difficulty: "easy",
      },
      {
        question_text: "What is the role of a 'gateway' in an IoT architecture?",
        option_a: "Stores data permanently", option_b: "Bridges edge devices to the cloud, handling protocol translation", option_c: "Displays the UI", option_d: "Generates power",
        correct_option: "b",
        explanation: "An IoT gateway connects edge devices to the cloud, performing protocol translation, data filtering, and local processing.",
        difficulty: "medium",
      },
      {
        question_text: "Which layer of IoT architecture handles sensors and actuators?",
        option_a: "Application layer", option_b: "Network layer", option_c: "Perception/Sensing layer", option_d: "Cloud layer",
        correct_option: "c",
        explanation: "The perception (sensing) layer contains physical sensors and actuators that collect data and interact with the environment.",
        difficulty: "medium",
      },
    ],
    "data-engineering": [
      {
        question_text: "What does ETL stand for in data engineering?",
        option_a: "Extract, Transform, Load", option_b: "Export, Transfer, Link", option_c: "Encrypt, Transmit, Log", option_d: "Evaluate, Test, Launch",
        correct_option: "a",
        explanation: "ETL stands for Extract, Transform, Load — the process of moving data from source systems, transforming it, and loading it into a data warehouse.",
        difficulty: "easy",
      },
      {
        question_text: "Which schema is simpler for OLAP queries with a single fact table?",
        option_a: "Snowflake schema", option_b: "Star schema", option_c: "Galaxy schema", option_d: "Normalized schema",
        correct_option: "b",
        explanation: "A star schema has a central fact table surrounded by dimension tables directly, making it simpler and faster for OLAP queries.",
        difficulty: "medium",
      },
      {
        question_text: "What is the main difference between OLAP and OLTP?",
        option_a: "OLAP is for transactions, OLTP is for analytics", option_b: "OLAP is for analytics, OLTP is for transactions", option_c: "Both are the same", option_d: "OLAP is faster than OLTP",
        correct_option: "b",
        explanation: "OLTP handles day-to-day transaction processing (inserts/updates), while OLAP handles analytical queries on large datasets.",
        difficulty: "medium",
      },
    ],
    "web-tech": [
      {
        question_text: "Which HTTP method is idempotent and used to request data without modifying server state?",
        option_a: "POST", option_b: "GET", option_c: "PUT", option_d: "PATCH",
        correct_option: "b",
        explanation: "GET is idempotent and safe — it retrieves data without changing server state. POST is not idempotent.",
        difficulty: "easy",
      },
      {
        question_text: "What does CORS stand for in web technologies?",
        option_a: "Cross-Origin Resource Sharing", option_b: "Common Object Request System", option_c: "Cross-Object Reference Standard", option_d: "Client-Origin Request Service",
        correct_option: "a",
        explanation: "CORS (Cross-Origin Resource Sharing) is a mechanism that allows restricted resources on a web page to be requested from another domain.",
        difficulty: "medium",
      },
      {
        question_text: "Which status code indicates 'Not Found' in HTTP?",
        option_a: "200", option_b: "301", option_c: "404", option_d: "500",
        correct_option: "c",
        explanation: "HTTP 404 indicates the requested resource was not found on the server.",
        difficulty: "easy",
      },
    ],
    "software-engineering": [
      {
        question_text: "Which SDLC model involves iterative development with frequent customer feedback?",
        option_a: "Waterfall", option_b: "Agile", option_c: "V-Model", option_d: "Big Bang",
        correct_option: "b",
        explanation: "Agile uses iterative development with continuous customer feedback and adaptive planning.",
        difficulty: "easy",
      },
      {
        question_text: "What type of testing verifies that individual modules work together correctly?",
        option_a: "Unit testing", option_b: "Integration testing", option_c: "System testing", option_d: "Acceptance testing",
        correct_option: "b",
        explanation: "Integration testing checks the interaction between combined modules or subsystems.",
        difficulty: "medium",
      },
      {
        question_text: "Which design pattern ensures a class has only one instance?",
        option_a: "Factory", option_b: "Observer", option_c: "Singleton", option_d: "Adapter",
        correct_option: "c",
        explanation: "The Singleton pattern restricts a class to a single instance and provides a global access point to it.",
        difficulty: "easy",
      },
    ],
    regex: [
      {
        question_text: "What does the regex metacharacter '^' match when used outside a character class?",
        option_a: "End of string", option_b: "Start of string", option_c: "Any character", option_d: "A literal caret",
        correct_option: "b",
        explanation: "Outside a character class, '^' is an anchor matching the start of the string (or line in multiline mode).",
        difficulty: "easy",
      },
      {
        question_text: "Which quantifier matches zero or more occurrences of the preceding element?",
        option_a: "+", option_b: "?", option_c: "*", option_d: "{n}",
        correct_option: "c",
        explanation: "The '*' quantifier matches zero or more occurrences. '+' matches one or more, '?' matches zero or one.",
        difficulty: "easy",
      },
      {
        question_text: "What does '\\d' match in regex?",
        option_a: "Any non-digit", option_b: "Any digit (0-9)", option_c: "Any word character", option_d: "Any whitespace",
        correct_option: "b",
        explanation: "\\d matches any decimal digit (0-9). \\D matches any non-digit.",
        difficulty: "easy",
      },
    ],
    "file-systems": [
      {
        question_text: "Which file allocation method eliminates external fragmentation?",
        option_a: "Contiguous allocation", option_b: "Linked allocation", option_c: "Indexed allocation", option_d: "All of the above",
        correct_option: "c",
        explanation: "Indexed allocation uses a separate index block for each file, eliminating external fragmentation while supporting direct access.",
        difficulty: "medium",
      },
      {
        question_text: "Which disk scheduling algorithm gives the minimum seek time by servicing the closest request?",
        option_a: "FCFS", option_b: "SCAN", option_c: "SSTF (Shortest Seek Time First)", option_d: "C-SCAN",
        correct_option: "c",
        explanation: "SSTF services the request closest to the current head position, minimizing seek time but potentially causing starvation.",
        difficulty: "medium",
      },
      {
        question_text: "What is the purpose of journaling in a file system?",
        option_a: "Compress files", option_b: "Log changes before committing for crash recovery", option_c: "Encrypt files", option_d: "Defragment the disk",
        correct_option: "b",
        explanation: "Journaling logs file system changes before they are committed, allowing fast recovery after crashes without full filesystem checks.",
        difficulty: "medium",
      },
    ],
    "disaster-recovery": [
      {
        question_text: "What does RPO (Recovery Point Objective) represent?",
        option_a: "Maximum acceptable downtime", option_b: "Maximum acceptable data loss measured in time", option_c: "Recovery time target", option_d: "Number of backups",
        correct_option: "b",
        explanation: "RPO is the maximum acceptable amount of data loss measured in time — the point in time to which data must be recovered.",
        difficulty: "medium",
      },
      {
        question_text: "Which recovery site is fully operational and ready to take over immediately?",
        option_a: "Cold site", option_b: "Warm site", option_c: "Hot site", option_d: "Backup site",
        correct_option: "c",
        explanation: "A hot site is fully equipped, operational, and can take over immediately with minimal downtime.",
        difficulty: "easy",
      },
      {
        question_text: "What is the primary goal of Business Continuity Planning (BCP)?",
        option_a: "Prevent all disasters", option_b: "Ensure critical business functions continue during and after a disaster", option_c: "Reduce IT costs", option_d: "Increase data storage",
        correct_option: "b",
        explanation: "BCP ensures that critical business operations continue during disruptions and recover afterward, minimizing impact.",
        difficulty: "medium",
      },
    ],
  };

  // Find matching questions by chapter slug
  const chapterSlug = inferChapterSlug(chapterName);
  let pool = bank[chapterSlug] || [];

  // If subtopic specified, try to filter (for fallback we just return from chapter pool)
  // Shuffle and pick count
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  if (selected.length < count) {
    // If not enough chapter-specific questions, fill from general pool
    const generalPool = Object.values(bank).flat().filter(
      (q) => !selected.includes(q),
    );
    const extra = generalPool
      .sort(() => Math.random() - 0.5)
      .slice(0, count - selected.length);
    selected.push(...extra);
  }

  return selected;
}

function inferChapterSlug(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("network") || n.includes("communication")) return "cn";
  if (n.includes("dbms") || n.includes("database")) return "dbms";
  if (n.includes("data structure") || n.includes("algorithm") || n.includes("dsa")) return "dsa";
  if (n.includes("ai") || n.includes("ml") || n.includes("machine")) return "aiml";
  if (n.includes("iot")) return "iot";
  if (n.includes("data engineer") || n.includes("warehouse") || n.includes("etl")) return "data-engineering";
  if (n.includes("cyber") || n.includes("security") || n.includes("crypt")) return "cybersecurity";
  if (n.includes("os") || n.includes("linux") || n.includes("unix") || n.includes("operating")) return "os-linux";
  if (n.includes("cloud")) return "cloud";
  if (n.includes("web")) return "web-tech";
  if (n.includes("software") || n.includes("sdlc")) return "software-engineering";
  if (n.includes("regex")) return "regex";
  if (n.includes("file system") || n.includes("file-system")) return "file-systems";
  if (n.includes("disaster") || n.includes("recovery") || n.includes("bcp")) return "disaster-recovery";
  return "cn";
}
