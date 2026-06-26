import { NextResponse } from "next/server";
import { INTERVIEW_SYSTEM } from "@/lib/prompts";
import { generateWithFallback, stripFences } from "@/lib/gemini";

type ConvTurn = { role: "interviewer" | "user"; text: string };

// Fallback questions used only if Gemini returns done too early
const FALLBACK_QUESTIONS: Record<number, string> = {
  1: "Can you walk me through each step in more detail? For each step, who specifically is responsible and what system or tool do they use?",
  2: "When one step finishes, how does the work get passed to the next person or team? Is it automated or manual?",
  3: "Are there any other programs, teams, or initiatives in your organisation that use the same people, tools, or process steps you've described?",
  4: "How many cases or applications go through this process each week, and roughly how long does each step take?",
  5: "Where does this process most often get stuck or delayed? Who is the single person whose absence would halt the whole process?",
};

function buildPrompt(
  history: ConvTurn[],
  processName: string,
  processDescription: string
): string {
  const userCount = history.filter((t) => t.role === "user").length;
  const context = `PROCESS BEING MAPPED
Name: ${processName}
Description: ${processDescription}
User responses so far: ${userCount} (minimum required before done: 6)`;

  if (history.length === 0) {
    return `${context}

Start the interview. Acknowledge the process name and ask the user to describe the initiative goal and who owns it overall. Keep it conversational.`;
  }

  const lines = history.map((t) =>
    `${t.role === "interviewer" ? "Interviewer" : "User"}: ${t.text}`
  );

  const uncoveredAreas = buildUncoveredHint(history);

  return `${context}

Conversation so far:

${lines.join("\n\n")}

Continue the interview. ${uncoveredAreas}
Do NOT repeat questions already answered. Ask ONE specific follow-up question about the least-covered area.
Remember: you MUST NOT return done:true until ${Math.max(0, 6 - userCount)} more user responses have been received.`;
}

function buildUncoveredHint(history: ConvTurn[]): string {
  const all = history.map((t) => t.text.toLowerCase()).join(" ");
  const hints: string[] = [];
  if (!/(step|phase|stage)/.test(all)) hints.push("process steps in sequence");
  if (!/(name|called|role|title|manager|coordinator|lead)/.test(all)) hints.push("full names and roles of people");
  if (!/(system|tool|software|spreadsheet|platform|crm|database)/.test(all)) hints.push("systems and tools used");
  if (!/(hand.?off|pass|transfer|send|notify|next step)/.test(all)) hints.push("handoffs between steps");
  if (!/(other|another|shared|both|also|cross)/.test(all)) hints.push("whether other initiatives share these steps/people/systems");
  if (!/(week|day|hour|minute|per|volume|many|how long|frequency)/.test(all)) hints.push("volume and frequency (cases per week, time per step)");
  if (!/(bottleneck|stuck|delay|block|single|risk|failure)/.test(all)) hints.push("bottlenecks and single points of failure");

  if (hints.length === 0) return "Dig deeper into any area that needs more concrete detail.";
  return `Focus on these uncovered areas: ${hints.slice(0, 3).join(", ")}.`;
}

async function askGemini(prompt: string): Promise<{ done: boolean; question?: string }> {
  const raw = await generateWithFallback(INTERVIEW_SYSTEM, prompt);
  return JSON.parse(stripFences(raw)) as { done: boolean; question?: string };
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }
  try {
    const body = await request.json() as {
      history: ConvTurn[];
      processName?: string;
      processDescription?: string;
    };
    const { history, processName = "Unknown Process", processDescription = "" } = body;
    const userCount = history.filter((t) => t.role === "user").length;

    const prompt = buildPrompt(history, processName, processDescription);
    let data = await askGemini(prompt);

    // Server-side guard: Gemini must not signal done before 6 user responses
    if (data.done && userCount < 6) {
      // Ask again with an explicit override instruction
      const overridePrompt = `${prompt}

OVERRIDE: You returned done:true but only ${userCount} of the required 6 user responses have occurred.
You MUST ask another question. Return {"done": false, "question": "..."} with your next question.`;

      try {
        data = await askGemini(overridePrompt);
        // If still done (very stubborn model), use a fallback question
        if (data.done) {
          const fallback = FALLBACK_QUESTIONS[userCount] ?? FALLBACK_QUESTIONS[1];
          data = { done: false, question: fallback };
        }
      } catch {
        // Override call failed — use fallback
        const fallback = FALLBACK_QUESTIONS[userCount] ?? FALLBACK_QUESTIONS[1];
        data = { done: false, question: fallback };
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
