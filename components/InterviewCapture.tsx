"use client";

import { useState, useRef, useCallback } from "react";
import type { ProcessParticipant, TranscriptTurn } from "@/lib/types";

// Fixed flow — identity is captured BEFORE any process detail.
const QUESTIONS = [
  "Before we start, what is your name and role?",
  "And which team are you on?",
  "Walk me through what happens when work first comes to you.",
  "Who or what do you hand off to next?",
  "Which systems or tools are part of that?",
  "Where does the process slow down or get stuck?",
  "If you were out for a week, what would stall?",
];

type SaveState = "idle" | "saving" | "saved" | "error";
type MicState = "idle" | "recording" | "transcribing" | "error";

function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "··";
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

// Best-effort parse of "name and role" free text into a ProcessParticipant.
function parseNameRole(s: string): { name: string; role: string } {
  const t = s.trim().replace(/^(i am|i'm|im|my name is|this is)\s+/i, "");
  const parts = t.split(/\s*(?:,|—|–| - | as )\s*/i);
  const name = (parts[0] ?? t).trim();
  const role = parts.slice(1).join(", ").replace(/^(a|an|the)\s+/i, "").trim();
  return { name, role };
}

export default function InterviewCapture({
  onExit,
  projectId,
}: {
  onExit: () => void;
  projectId?: string;
}) {
  const [qi, setQi] = useState(0);
  const [turns, setTurns] = useState<TranscriptTurn[]>([
    { speaker: "atlas", text: QUESTIONS[0] },
  ]);
  const [answerText, setAnswerText] = useState("");
  const [participant, setParticipant] = useState<ProcessParticipant | null>(null);
  const [mic, setMic] = useState<MicState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const startedAtRef = useRef(Date.now());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const recording = mic === "recording";
  const done = qi >= QUESTIONS.length;
  const answered = turns.filter((t) => t.speaker === "participant").length;
  const progress = Math.min(100, (answered / QUESTIONS.length) * 100);
  const identityComplete = !!participant?.name && !!participant?.role && !!participant?.team;

  // Append an answer for the current question, capture identity from Q1/Q2,
  // advance the flow. Used by both voice transcription and the typed fallback.
  const commitAnswer = useCallback(
    (raw: string) => {
      const ans = raw.trim();
      if (!ans) return;
      setQi((curQi) => {
        if (curQi >= QUESTIONS.length) return curQi;
        if (curQi === 0) {
          const { name, role } = parseNameRole(ans);
          setParticipant({ name, role });
        } else if (curQi === 1) {
          setParticipant((p) => (p ? { ...p, team: ans } : { name: ans, role: "", team: ans }));
        }
        const next = curQi + 1;
        setTurns((prev) => {
          const withAnswer: TranscriptTurn[] = [...prev, { speaker: "participant", text: ans }];
          return next < QUESTIONS.length
            ? [...withAnswer, { speaker: "atlas", text: QUESTIONS[next] }]
            : withAnswer;
        });
        return next;
      });
      setAnswerText("");
    },
    []
  );

  // Send the recorded clip to the server-side transcription route (key stays
  // server-side), then commit the returned text as the participant's answer.
  const transcribeAndCommit = useCallback(
    async (blob: Blob) => {
      setMic("transcribing");
      try {
        const res = await fetch("/api/gemini/transcribe", {
          method: "POST",
          headers: { "Content-Type": blob.type || "audio/webm" },
          body: blob,
        });
        if (!res.ok) throw new Error("Transcription failed");
        const { text } = (await res.json()) as { text: string };
        if (text && text.trim()) {
          setAnswerText(text.trim());
          commitAnswer(text);
        }
        setMic("idle");
      } catch {
        setMic("error");
        setTimeout(() => setMic("idle"), 2500);
      }
    },
    [commitAnswer]
  );

  const startRecording = useCallback(async () => {
    if (done) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) void transcribeAndCommit(blob);
        else setMic("idle");
      };
      recorderRef.current = rec;
      rec.start();
      setMic("recording");
    } catch {
      setMic("error");
      setTimeout(() => setMic("idle"), 2500);
    }
  }, [done, transcribeAndCommit]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  // Mic toggles voice capture: press to start, press again to stop & transcribe.
  const onMic = useCallback(() => {
    if (done || mic === "transcribing") return;
    if (mic === "recording") stopRecording();
    else void startRecording();
  }, [done, mic, startRecording, stopRecording]);

  const endAndSave = useCallback(async () => {
    if (!done || saveState === "saving") return;
    setSaveState("saving");
    try {
      const session = {
        id: sessionIdRef.current,
        participant: participant ?? { name: "", role: "" },
        date: new Date().toISOString().slice(0, 10),
        durationSec: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
        turns,
        ...(projectId ? { projectId } : {}),
      };
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveState("saved");
      setTimeout(() => onExit(), 600);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2500);
    }
  }, [done, saveState, turns, participant, onExit, projectId]);

  const questionText = done
    ? "Interview complete. Save the session to add it to your library."
    : QUESTIONS[qi];
  const counter = done
    ? `${QUESTIONS.length} of ${QUESTIONS.length} · done`
    : `Question ${qi + 1} of ${QUESTIONS.length}`;
  const speakerLabel = participant?.name || "You";

  return (
    <div style={{ height: "100%", display: "flex", overflow: "hidden" }}>

      {/* ═══════════════ LEFT — voice stage ═══════════════ */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", minWidth: 0,
        borderRight: "1px solid var(--border)",
        background: "radial-gradient(130% 70% at 50% 0%, rgba(142,136,244,0.06), transparent 60%)",
      }}>
        {/* Identity header (captured) + counter */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "14px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <span style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "var(--badge-bg)", display: "grid", placeItems: "center",
            fontFamily: "var(--font-mono)", fontSize: 13,
            color: participant?.name ? "var(--t1)" : "var(--t4)",
          }}>
            {participant?.name ? initials(participant.name) : "··"}
          </span>
          <div style={{ minWidth: 0 }}>
            {participant?.name ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", display: "flex", alignItems: "center", gap: 8 }}>
                  {participant.name}
                  <CapturedTag show={identityComplete} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)", marginTop: 2 }}>
                  {participant.role || "role pending…"}
                  {participant.team ? ` · ${participant.team}` : ""}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--t4)", fontWeight: 500 }}>
                Capturing identity…
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onExit} style={cancelBtn}>Cancel</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>
            {counter}
          </span>
        </div>
        <div style={{ height: 2, background: "var(--border)", flexShrink: 0 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", transition: "width 0.4s ease" }} />
        </div>

        {/* Question + mic */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "24px 40px", textAlign: "center", overflowY: "auto",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--accent-s)", marginBottom: 14,
          }}>
            {done ? "Done" : "Atlas asks"}
          </div>
          <p style={{ fontSize: 23, fontWeight: 500, color: "var(--t1)", lineHeight: 1.35, letterSpacing: "-0.01em", margin: 0, maxWidth: 460 }}>
            {questionText}
          </p>

          {/* Mic zone */}
          <div style={{ marginTop: 38, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <button
              onClick={onMic}
              disabled={done || mic === "transcribing"}
              aria-label={recording ? "Stop and transcribe" : "Start recording"}
              title={done ? "Interview complete" : recording ? "Stop and transcribe" : "Press to record your answer"}
              style={{
                width: 84, height: 84, borderRadius: "50%",
                background: recording ? "var(--risk-soft)" : "var(--accent-bg)",
                border: `2px solid ${recording ? "var(--risk)" : "var(--accent-br)"}`,
                color: recording ? "var(--risk)" : "var(--accent-s)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: done || mic === "transcribing" ? "not-allowed" : "pointer",
                opacity: done ? 0.4 : mic === "transcribing" ? 0.6 : 1,
                transition: "all 0.2s",
                boxShadow: recording ? "0 0 0 6px rgba(255,122,89,0.12)" : "none",
              }}
            >
              {recording ? <Waveform /> : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              )}
            </button>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: recording ? "var(--risk)" : "var(--t4)", minHeight: 16 }}>
              {done ? "Interview complete"
                : recording ? "Listening · Gemini Speech-to-Text"
                : mic === "transcribing" ? "Transcribing…"
                : mic === "error" ? "Mic unavailable — type your answer below"
                : "Press the mic to speak, or type your answer"}
            </div>
          </div>

          {/* Answer input (stubbed manual advance) */}
          {!done && (
            <div style={{ marginTop: 24, width: "100%", maxWidth: 460, textAlign: "left" }}>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && answerText.trim()) {
                    e.preventDefault();
                    commitAnswer(answerText);
                  }
                }}
                placeholder="Or type the answer here and press Enter…"
                rows={2}
                autoFocus
                style={{
                  width: "100%", padding: "11px 14px", background: "var(--bg)",
                  border: "1px solid var(--border)", borderRadius: 8,
                  fontSize: 13, color: "var(--t1)", lineHeight: 1.6,
                  resize: "vertical", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ RIGHT — live transcript ═══════════════ */}
      <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--surface)" }}>
        <div style={{
          padding: "12px 18px", flexShrink: 0, borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t3)" }}>
            Transcript · building
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>
            {answered} turn{answered !== 1 ? "s" : ""}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {turns.map((t, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4,
                color: t.speaker === "atlas" ? "var(--accent-s)" : "var(--c-person)",
              }}>
                {t.speaker === "atlas" ? "Atlas" : speakerLabel}
              </div>
              <div style={{
                fontSize: 12.5, lineHeight: 1.55,
                color: t.speaker === "atlas" ? "var(--t2)" : "var(--t1)",
                background: t.speaker === "atlas" ? "transparent" : "var(--bg)",
                border: t.speaker === "atlas" ? "none" : "1px solid var(--border)",
                borderRadius: 8, padding: t.speaker === "atlas" ? 0 : "8px 11px",
              }}>
                {t.text}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button
            onClick={endAndSave}
            disabled={!done || saveState === "saving"}
            style={{
              width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "11px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: "1px solid transparent",
              background: done ? "var(--accent)" : "var(--border)",
              color: done ? "#10131f" : "var(--t4)",
              cursor: done ? "pointer" : "not-allowed",
              opacity: saveState === "saving" ? 0.6 : 1, transition: "all 0.15s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M5 12l5-5M5 12l5 5" /></svg>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Save failed — retry" : "End & save session"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CapturedTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
      padding: "2px 7px", borderRadius: 999,
      background: "rgba(79,209,176,0.14)", color: "var(--c-proc)",
    }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      Captured
    </span>
  );
}

// Mic waveform shown while "recording".
function Waveform() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 28 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{
          width: 4, borderRadius: 2, background: "var(--risk)",
          animation: `wave 0.9s ease-in-out ${i * 0.1}s infinite`,
        }} />
      ))}
    </div>
  );
}

const cancelBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--t4)",
  fontSize: 12, cursor: "pointer", padding: "6px 8px",
};
