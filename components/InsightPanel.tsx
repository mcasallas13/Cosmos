"use client";

import { useEffect, useRef, useState } from "react";
import type { Insight } from "@/lib/types";
import { FINANCE_INPUTS } from "@/lib/finance";

type Props = {
  processSummary: string | null;
  insights: Insight[] | null;
  loading: boolean;
  error: string | null;
  onAnalyze: () => void;
};

const centerStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const CONF_PCT: Record<string, number> = { high: 94, medium: 68, low: 38 };
const CONF_COLOR: Record<string, string> = {
  high: "var(--c-proc)",
  medium: "var(--c-person)",
  low: "var(--risk)",
};

export default function InsightPanel({ processSummary, insights, loading, error, onAnalyze }: Props) {
  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={{ color: "var(--accent-s)", fontSize: 13, textAlign: "center" }}>
          <Spinner />
          <div style={{ marginTop: 12 }}>Analyzing dependency graph…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={centerStyle}>
        <p style={{ color: "var(--risk)", fontSize: 12, marginBottom: 16, textAlign: "center" }}>{error}</p>
        <ActionButton onClick={onAnalyze}>Retry</ActionButton>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div style={centerStyle}>
        <div style={{
          border: "1px dashed var(--border)", borderRadius: 12,
          padding: "26px 20px", textAlign: "center", maxWidth: 280,
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="1.6" style={{ marginBottom: 12 }}>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <p style={{ color: "var(--t3)", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Run the analysis to surface the operational insight Atlas finds across these conversations.
          </p>
          <ActionButton onClick={onAnalyze}>Run analysis</ActionButton>
        </div>
      </div>
    );
  }

  // H1 render order: (1) trust — how the process works, (2) the operational
  // crossover insight with the map highlight, (3) the financial impact / action.
  const hero = insights.find((i) => !i.needsHumanReview) ?? null;
  const review = insights.find((i) => i.needsHumanReview) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "16px 18px", gap: 14 }}>
      {processSummary && <ProcessSummaryCard summary={processSummary} />}
      {hero && <HeroCard insight={hero} />}
      {hero && hero.financialImpact.value > 0 && <FinancialCard insight={hero} />}
      {review && <ReviewCard insight={review} />}
      <div style={{ paddingBottom: 6 }}>
        <ActionButton onClick={onAnalyze} secondary>Re-run analysis</ActionButton>
      </div>
    </div>
  );
}

// ── 1. Trust — "How this process works" ─────────────────────────────────────
function ProcessSummaryCard({ summary }: { summary: string }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-s)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--t4)", margin: 0 }}>
          How this process works
        </p>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--t2)", lineHeight: 1.65, margin: 0 }}>{summary}</p>
    </div>
  );
}

// ── 2. Insight — the crossover (no money; that is the third beat) ────────────
function HeroCard({ insight }: { insight: Insight }) {
  const pct = CONF_PCT[insight.confidence] ?? 60;
  const [barW, setBarW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setBarW(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div className="atlas-insight-card" style={{
      background: "var(--surface)", border: "1px solid var(--risk-soft)",
      borderRadius: 16, padding: "16px 18px",
      borderColor: "rgba(255,122,89,0.4)",
    }}>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        <Badge kind="risk">
          <WarnIcon /> {insight.type.replace(/_/g, " ")}
        </Badge>
        <Badge kind="neutral">{insight.confidence} confidence</Badge>
      </div>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--t1)", lineHeight: 1.3, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
        {insight.title}
      </h3>
      <p style={{ fontSize: 13.5, color: "var(--t2)", lineHeight: 1.6, margin: "0 0 14px" }}>
        {insight.explanation}
      </p>

      {/* Confidence meter */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t4)", whiteSpace: "nowrap" }}>
          Confidence
        </span>
        <span style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--badge-bg)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${barW}%`, borderRadius: 3, background: CONF_COLOR[insight.confidence] ?? "var(--c-proc)", transition: "width 1s ease 0.2s" }} />
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: CONF_COLOR[insight.confidence] ?? "var(--c-proc)" }}>{pct}%</span>
      </div>

      {/* Recommended action */}
      <div style={{ padding: "11px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, margin: 0 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t4)", margin: "0 0 3px" }}>
          Recommended action
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--t1)", lineHeight: 1.5 }}>{insight.recommendedAction}</p>
      </div>
    </div>
  );
}

// ── 3. Action — the financial impact / dollar figure ────────────────────────
function FinancialCard({ insight }: { insight: Insight }) {
  const dollars = useCountUp(insight.financialImpact.value, 1100);
  return (
    <div className="atlas-insight-card" style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "16px 18px",
    }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--t4)", margin: "0 0 12px" }}>
        Financial impact
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat label="Value at stake" value={`$${dollars.toLocaleString("en-US")}`} lead />
        <Stat label="Throughput protected" value={`${FINANCE_INPUTS.applicationsPerWeek}/wk`} />
      </div>
      <p style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5, margin: "10px 0 0" }}>{insight.financialImpact.basis}</p>
    </div>
  );
}

type ReviewStatus = NonNullable<Insight["status"]>;

function ReviewCard({ insight }: { insight: Insight }) {
  // Confirm/Dismiss sets the insight's typed status and resolves it on screen.
  const [status, setStatus] = useState<ReviewStatus>(insight.status ?? "open");
  const resolved = status === "confirmed" || status === "dismissed";

  const resolution =
    status === "confirmed"
      ? { color: "var(--c-proc)", label: "Confirmed · queued as a second crossover" }
      : { color: "var(--t3)", label: "Dismissed · no shared dependency" };

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 16, padding: "16px 18px",
      opacity: status === "dismissed" ? 0.7 : 1,
      transition: "opacity 0.2s",
    }}>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
        <Badge kind="warn"><FlagIcon /> Needs human review</Badge>
        <Badge kind="neutral">{insight.confidence} confidence</Badge>
        {resolved && (
          <Badge kind="neutral">
            <CheckIcon /> {status}
          </Badge>
        )}
      </div>

      <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--t1)", lineHeight: 1.3, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
        {insight.title}
      </h3>
      <p style={{ fontSize: 13.5, color: "var(--t2)", lineHeight: 1.6, margin: "0 0 14px" }}>
        {insight.explanation}
      </p>

      {insight.whatToCheck && (
        <div style={{ padding: "11px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, margin: "0 0 14px" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t4)", margin: "0 0 3px" }}>
            What to check
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--t1)", lineHeight: 1.5 }}>{insight.whatToCheck}</p>
        </div>
      )}

      {resolved ? (
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontSize: 12, color: resolution.color }}>
            <CheckIcon /> {resolution.label}
          </span>
          <button
            onClick={() => setStatus("open")}
            style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 500, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", cursor: "pointer" }}
          >
            Undo
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 9 }}>
          <button
            onClick={() => setStatus("confirmed")}
            style={{ flex: 1, padding: 9, borderRadius: 8, fontSize: 13, fontWeight: 500, border: "1px solid transparent", background: "var(--c-person)", color: "#1a1305", cursor: "pointer" }}
          >
            Confirm dependency
          </button>
          <button
            onClick={() => setStatus("dismissed")}
            style={{ flex: 1, padding: 9, borderRadius: 8, fontSize: 13, fontWeight: 500, border: "1px solid var(--border)", background: "transparent", color: "var(--t1)", cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────
function Stat({ label, value, lead = false }: { label: string; value: string; lead?: boolean }) {
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "11px 13px" }}>
      <p style={{ fontSize: 11, color: "var(--t2)", margin: "0 0 5px" }}>{label}</p>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 21, fontWeight: 500, color: lead ? "var(--risk)" : "var(--t1)", margin: 0, lineHeight: 1, letterSpacing: "-0.01em" }}>
        {value}
      </p>
    </div>
  );
}

function Badge({ kind, children }: { kind: "risk" | "neutral" | "warn"; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    risk: { background: "var(--risk-soft)", color: "var(--risk)" },
    neutral: { background: "var(--badge-bg)", color: "var(--t2)" },
    warn: { background: "rgba(229,168,110,0.14)", color: "var(--c-person)" },
  };
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em",
      padding: "4px 9px", borderRadius: 6, textTransform: "capitalize",
      display: "inline-flex", alignItems: "center", gap: 5, ...styles[kind],
    }}>
      {children}
    </span>
  );
}

function ActionButton({ onClick, children, secondary = false }: { onClick: () => void; children: React.ReactNode; secondary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", padding: "11px 16px",
        background: secondary ? "transparent" : "var(--accent)",
        color: secondary ? "var(--t2)" : "#10131f",
        border: secondary ? "1px solid var(--border)" : "none",
        borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
        transition: "filter 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.08)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{ width: 28, height: 28, margin: "0 auto", border: "3px solid var(--badge-bg)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
  );
}

function WarnIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
}
function FlagIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 21V4m0 0 7 3 9-3v11l-9 3-7-3" /></svg>;
}
function CheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>;
}

// ── Count-up hook ─────────────────────────────────────────────────────────
function useCountUp(to: number, ms: number): number {
  const [v, setV] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    if (reduce || to === 0) { setV(to); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(to * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [to, ms]);
  return v;
}
