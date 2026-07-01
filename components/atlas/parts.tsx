"use client";

import { Fragment, useState, useCallback, useEffect } from "react";
import type { Graph, Insight, Project, Session } from "@/lib/types";
import { isProtectedProject } from "@/lib/projects";
import DependencyMap from "@/components/DependencyMap";
import InsightPanel from "@/components/InsightPanel";

// ── Types ───────────────────────────────────────────────────────────────────
type Theme = "cosmos" | "dark" | "light";
type View = "processes" | "sessions" | "interview" | "map";

// ── Discovery flow steps ─────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the four presenter-paced beats. The FlowStepper
// (numbered 1..4) and the Sessions view's "Step N ·" labels both derive their
// numbering from this array's order, so the two can never drift out of sync.
type FlowStepDef = { label: string; hint: string; view: View };
const FLOW_STEP_DEFS: FlowStepDef[] = [
  { label: "Interviews", hint: "Capture or open SME sessions", view: "sessions" },
  { label: "Process map", hint: "Generate the dependency map from sessions", view: "map" },
  { label: "Insight", hint: "Run analysis to surface the shared dependency", view: "map" },
  { label: "Human review", hint: "Confirm or dismiss the flagged finding", view: "map" },
];
// 1-based step numbers keyed by label — the only place numbering is assigned.
const STEP_NO = Object.fromEntries(
  FLOW_STEP_DEFS.map((s, i) => [s.label, i + 1])
) as Record<string, number>;

// ── Helpers ─────────────────────────────────────────────────────────────────
function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function fmtDur(sec: number): string {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  return `${m} min`;
}

// Reconstruct a markdown transcript from a session so it can feed extraction.
// The SPEAKER IDENTITY line is read by the extractor as a hard instruction to
// create a person entity (with role + team) for the participant — see
// EXTRACTION_SYSTEM rule 6.
function sessionToTranscript(s: Session): string {
  const { name, role, team } = s.participant;
  const teamClause = team ? ` on the ${team} team` : "";
  const header =
    `=== Session: ${name} ===\n` +
    `SPEAKER IDENTITY — this transcript is the first-person account of ${name}, ${role}${teamClause}.\n` +
    `**Participant:** ${name}, ${role}${team ? `, ${team}` : ""}\n`;
  const body = s.turns
    .map((t) => `**${t.speaker === "atlas" ? "Atlas" : name}:** ${t.text}`)
    .join("\n\n");
  return `${header}\n${body}`;
}

// ── Panel header shared style ───────────────────────────────────────────────
const panelHeaderStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderBottom: "1px solid var(--border)",
  fontSize: "10px",
  color: "var(--t6)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "var(--topbar)",
};

// ── Generate-map ingest overlay (extraction beat only) ──────────────────────
// Analysis is a separate beat surfaced in the insight panel, so this overlay
// stops at extraction — it narrates reading the three conversations.
const INGEST_LINES = [
  { text: "James Carter · Individual Recruiting Lead",  accent: false, delay: 80 },
  { text: "Priya Nair · Scholarship Program Manager",   accent: false, delay: 420 },
  { text: "Maria Lopez · Enrollment Coordinator",       accent: false, delay: 760 },
  { text: "Extracting dependency graph…",              accent: true,  delay: 1160 },
];
// Single authoritative ingest clock for the prepared reveal. The overlay
// (IngestOverlay) and the reveal timer in onGenerateMap both key off this, so
// the reveal always fires AFTER every INGEST_LINES delay has landed (last line
// 1160ms < 1650ms) and the overlay stays mounted until the reveal — no
// early-pop, no blank overlay. Every INGEST_LINES delay must stay < this value.
const INGEST_DURATION = 1650;

function IngestOverlay() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const ts = INGEST_LINES.map((l, i) => setTimeout(() => setCount(i + 1), l.delay));
    return () => ts.forEach(clearTimeout);
  }, []);
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(5,5,15,0.94)",
      display: "flex", flexDirection: "column",
      alignItems: "flex-start", justifyContent: "center",
      padding: "0 64px", gap: 12, zIndex: 10,
    }}>
      <div style={{ fontSize: 10, color: "#1a1a4e", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.14em" }}>
        Ingesting conversations
      </div>
      {INGEST_LINES.slice(0, count).map((line, i) => (
        <div key={i} style={{
          fontSize: 13,
          color: line.accent ? "#a78bfa" : "#4b5563",
          display: "flex", alignItems: "center", gap: 10,
          animation: "slideIn 0.3s ease both",
        }}>
          <span style={{ fontSize: 9, color: line.accent ? "#7c3aed" : "#1a2e1a" }}>
            {line.accent ? "◈" : "▶"}
          </span>
          {line.text}
        </div>
      ))}
    </div>
  );
}

// Full-pane failure state for a map generation that produced no graph (e.g. a
// first live extract that failed). Offers a retry and, for the prepared K-12
// demo, a one-click fallback to the canonical graph so the run never dead-ends.
function MapErrorState({
  message, onRetry, onUsePrepared,
}: { message: string; onRetry: () => void; onUsePrepared?: () => void }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", textAlign: "center", padding: 40 }}>
      <div style={{ maxWidth: 340 }}>
        <div style={{
          width: 40, height: 40, margin: "0 auto 14px", borderRadius: "50%",
          display: "grid", placeItems: "center",
          background: DANGER_BG, border: `1px solid ${DANGER_BR}`, color: DANGER, fontSize: 20,
        }}>
          !
        </div>
        <div style={{ fontSize: 14, color: "var(--t2)", marginBottom: 6 }}>Map generation failed</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--t4)", marginBottom: 18 }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onRetry} style={{
            background: "var(--accent)", border: "none", borderRadius: 9,
            color: "#fff", fontSize: 13, fontWeight: 600, padding: "8px 16px",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Retry generation
          </button>
          {onUsePrepared && (
            <button onClick={onUsePrepared} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 9,
              color: "var(--t3)", fontSize: 13, fontWeight: 500, padding: "8px 16px",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              Use prepared map
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Theme toggle ────────────────────────────────────────────────────────────
const THEMES: Array<{ id: Theme; icon: string; label: string }> = [
  { id: "cosmos", icon: "🌌", label: "Cosmos" },
  { id: "dark",   icon: "🌙", label: "Dark" },
  { id: "light",  icon: "☀️",  label: "Light" },
];

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, border: "1px solid var(--border)", borderRadius: 7, padding: 2 }}>
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          title={t.label}
          style={{
            padding: "3px 7px",
            background: theme === t.id ? "var(--accent-bg)" : "transparent",
            border: `1px solid ${theme === t.id ? "var(--accent-br)" : "transparent"}`,
            borderRadius: 5,
            fontSize: 12,
            cursor: "pointer",
            opacity: theme === t.id ? 1 : 0.4,
            transition: "all 0.15s",
          }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

// ── Live toggle ─────────────────────────────────────────────────────────────
// Close a dialog on the Escape key, so modals are keyboard-dismissable.
function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onEscape]);
}

function LiveToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10, color: "var(--t6)" }}>Live</span>
      <button
        type="button"
        role="switch" aria-checked={on} aria-label="Live mode"
        onClick={() => onChange(!on)}
        style={{
          width: 32, height: 17, borderRadius: 9, padding: 0,
          background: on ? "var(--accent)" : "var(--bg)",
          border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
          position: "relative", cursor: "pointer",
          transition: "background 0.18s, border-color 0.18s",
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: on ? 15 : 2,
          width: 11, height: 11, borderRadius: "50%",
          background: on ? "#fff" : "var(--t4)",
          transition: "left 0.18s",
        }} />
      </button>
      {on && <span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.08em" }}>LIVE</span>}
    </div>
  );
}

// ── Nav rail ────────────────────────────────────────────────────────────────
function AtlasMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="var(--accent)" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="2" fill="var(--risk)" />
      <circle cx="10" cy="3" r="1.4" fill="var(--c-proc)" />
      <circle cx="17" cy="10" r="1.4" fill="var(--c-person)" />
      <circle cx="3" cy="10" r="1.4" fill="var(--c-system)" />
    </svg>
  );
}

const NAV_ICON: Record<View, React.ReactNode> = {
  processes: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  sessions: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 5h18M3 12h18M3 19h18" />
    </svg>
  ),
  interview: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  map: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" />
      <path d="M7.6 7.7 11 16M16.4 7.7 13 16" />
    </svg>
  ),
};

const NAV_ITEMS: Array<{ id: View; label: string }> = [
  { id: "processes", label: "Processes" },
  { id: "sessions",  label: "Sessions" },
  { id: "interview", label: "Live interview" },
  { id: "map",       label: "Map & analysis" },
];

function NavRail({
  view,
  onNavigate,
  sessionCount,
  activeProject,
}: {
  view: View;
  onNavigate: (v: View) => void;
  sessionCount: number;
  activeProject: Project;
}) {
  return (
    <nav style={{
      width: 212, flexShrink: 0,
      borderRight: "1px solid var(--border)",
      background: "var(--surface)",
      display: "flex", flexDirection: "column",
      padding: "16px 12px",
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 18px" }}>
        <span style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: "var(--bg)", border: "1px solid var(--border)",
          display: "grid", placeItems: "center",
        }}>
          <AtlasMark />
        </span>
        <span>
          <span style={{ display: "block", fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--t1)" }}>Atlas</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", letterSpacing: "0.06em", marginTop: 1 }}>
            PROJECT INSIGHTS
          </span>
        </span>
      </div>

      {/* Pipeline section */}
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--t4)", padding: "10px 11px 6px",
      }}>
        Pipeline
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV_ITEMS.map((it) => {
          const active = view === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onNavigate(it.id)}
              aria-current={active ? "page" : undefined}
              style={{
                position: "relative",
                display: "flex", alignItems: "center", gap: 11,
                width: "100%", padding: "9px 11px",
                background: active ? "var(--bg)" : "transparent",
                border: "none", borderRadius: 10,
                cursor: "pointer", textAlign: "left",
                color: active ? "var(--t1)" : "var(--t3)",
                fontSize: 13.5, fontWeight: 500, fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {active && (
                <span style={{
                  position: "absolute", left: -12, top: 9, bottom: 9, width: 3,
                  borderRadius: 2, background: "var(--accent)",
                }} />
              )}
              <span style={{ display: "flex", flexShrink: 0, opacity: 0.85 }}>{NAV_ICON[it.id]}</span>
              {it.label}
              {it.id === "sessions" && sessionCount > 0 && (
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>
                  {sessionCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer status chip — active workspace */}
      <div style={{ marginTop: "auto", padding: "12px 10px 4px", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t3)", display: "flex", alignItems: "center", gap: 7 }} title={activeProject.name}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--c-proc)", flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeProject.lineOfBusiness || activeProject.name}
          </span>
        </span>
      </div>
    </nav>
  );
}

// ── Status badge (Ready / Draft / Processing) ───────────────────────────────
function StatusBadge({ status }: { status: Session["status"] }) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em",
    padding: "3px 8px", borderRadius: 999, fontWeight: 600,
    textTransform: "capitalize", flexShrink: 0,
  };
  if (status === "ready") {
    return (
      <span style={{ ...base, background: "rgba(79,209,176,0.14)", color: "var(--c-proc)" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        Ready
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span style={{ ...base, background: "rgba(124,131,255,0.16)", color: "var(--accent-s)" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ animation: "spin 0.9s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
        Processing
      </span>
    );
  }
  return (
    <span style={{ ...base, background: "var(--badge-bg)", color: "var(--t3)" }}>
      Draft
    </span>
  );
}

// ── Sessions view (two-pane: list + transcript detail) ──────────────────────
function SessionsView({
  sessions,
  onNewInterview,
  onGenerateMap,
  onRequestDeleteSession,
  generating,
}: {
  sessions: Session[];
  onNewInterview: () => void;
  onGenerateMap: (selected: Session[]) => void;
  onRequestDeleteSession: (session: Session) => void;
  generating: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const open = sessions.find((s) => s.id === openId) ?? null;
  const selected = sessions.filter((s) => selectedIds.has(s.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allSelected = sessions.length > 0 && selected.length === sessions.length;
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === sessions.length ? new Set() : new Set(sessions.map((s) => s.id))
    );
  }, [sessions]);

  // Generate from checked sessions; if none checked, use the open one; else all.
  const targetsForMap = selected.length > 0 ? selected : open ? [open] : sessions;

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* View header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 24px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 19, fontWeight: 600, margin: 0, letterSpacing: "-0.01em", color: "var(--t1)" }}>Sessions</h2>
          <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 2 }}>
            Step {STEP_NO["Interviews"]} · Open or capture a session, then build a process map from it.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onNewInterview} style={primaryBtnStyle}>
          <MicGlyph /> New interview
        </button>
      </div>

      {/* Two-pane body */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", flex: 1, minHeight: 0 }}>
        {/* Session list */}
        <div style={{ padding: "16px 20px", borderRight: "1px solid var(--border)", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--t4)" }}>
              Captured · {sessions.length}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", color: selected.length ? "var(--accent-s)" : "var(--t4)" }}>
                {selected.length} selected
              </span>
              {sessions.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  style={{
                    background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                    fontSize: 11, fontWeight: 600, color: "var(--accent-s)", padding: 0,
                  }}
                >
                  {allSelected ? "Clear" : "Select all"}
                </button>
              )}
            </span>
          </div>

          {sessions.length === 0 ? (
            <div style={{
              border: "1px dashed var(--border)", borderRadius: 14,
              padding: "30px 22px", textAlign: "center", marginTop: 8,
            }}>
              <span style={{
                width: 44, height: 44, margin: "0 auto 14px", borderRadius: "50%",
                display: "grid", placeItems: "center",
                background: "var(--badge-bg)", color: "var(--accent-s)",
              }}>
                <MicGlyph />
              </span>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", margin: "0 0 6px" }}>
                No sessions yet
              </p>
              <p style={{ fontSize: 12.5, color: "var(--t3)", lineHeight: 1.6, margin: "0 0 18px" }}>
                Capture an SME interview to start mapping this process. You need at least one session before you can generate a map.
              </p>
              <button onClick={onNewInterview} style={{ ...primaryBtnStyle, margin: "0 auto" }}>
                <MicGlyph /> Capture first interview
              </button>
            </div>
          ) : sessions.map((s) => {
            const sel = selectedIds.has(s.id);
            const isOpen = s.id === openId;
            const protectedSeed = s.id.startsWith("seed-");
            const showDelete = hoveredId === s.id;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-pressed={isOpen}
                aria-label={`Open transcript for ${s.participant.name}`}
                onClick={() => setOpenId(s.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(s.id); } }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", padding: "12px 13px", marginBottom: 10,
                  background: isOpen ? "var(--bg)" : "var(--surface)",
                  border: `1px solid ${isOpen ? "var(--accent-br)" : sel ? "var(--c-proc)" : "var(--border)"}`,
                  borderRadius: 12, cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { setHoveredId(s.id); if (!isOpen) (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
                onMouseLeave={(e) => { setHoveredId(null); if (!isOpen) (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
              >
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggleSelect(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${s.participant.name}`}
                  style={{ width: 16, height: 16, accentColor: "var(--c-proc)", cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: "var(--badge-bg)", display: "grid", placeItems: "center",
                  fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--t1)",
                }}>
                  {initials(s.participant.name)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.participant.name}
                  </p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--t3)", margin: "2px 0 0" }}>
                    {s.participant.role}
                  </p>
                  <span style={{
                    display: "inline-flex", alignItems: "center", marginTop: 6,
                    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em",
                    padding: "3px 7px", borderRadius: 5, background: "var(--badge-bg)", color: "var(--t3)",
                  }}>
                    {s.turns.length} turns · transcript ready
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, flexShrink: 0 }}>
                  <StatusBadge status={s.status} />
                  <div style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t4)", lineHeight: 1.5 }}>
                    {s.date}<br />{fmtDur(s.durationSec)}
                  </div>
                </div>
                <button
                  aria-label={protectedSeed ? "Demo session cannot be deleted" : `Delete session with ${s.participant.name}`}
                  title={protectedSeed ? "Demo session cannot be deleted" : "Delete session"}
                  disabled={protectedSeed}
                  onClick={(e) => { e.stopPropagation(); if (!protectedSeed) onRequestDeleteSession(s); }}
                  style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 8,
                    display: "grid", placeItems: "center",
                    background: "transparent", border: "1px solid transparent",
                    color: protectedSeed ? "var(--t5)" : DANGER,
                    cursor: protectedSeed ? "not-allowed" : "pointer",
                    opacity: showDelete ? 1 : 0,
                    pointerEvents: showDelete ? "auto" : "none",
                    transition: "opacity 0.12s",
                  }}
                  onMouseEnter={(e) => { if (!protectedSeed) { (e.currentTarget as HTMLElement).style.background = DANGER_BG; (e.currentTarget as HTMLElement).style.borderColor = DANGER_BR; } }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                >
                  <TrashGlyph />
                </button>
              </div>
            );
          })}
        </div>

        {/* Transcript detail */}
        <div style={{ padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
          {!open ? (
            <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center", color: "var(--t4)", fontSize: 13, padding: 30 }}>
              Select a session to read its transcript.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 4 }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: "var(--badge-bg)", display: "grid", placeItems: "center",
                  fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--t1)",
                }}>
                  {initials(open.participant.name)}
                </span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--t1)" }}>{open.participant.name}</h3>
                <StatusBadge status={open.status} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)", marginBottom: 14 }}>
                {open.participant.role} · {open.date} · {fmtDur(open.durationSec)} · {open.turns.length} turns
              </div>

              <div style={{ flex: 1 }}>
                {open.turns.map((t, i) => (
                  <div key={i} style={{ marginBottom: 13 }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
                      textTransform: "uppercase", marginBottom: 4,
                      color: t.speaker === "atlas" ? "var(--accent-s)" : "var(--c-person)",
                    }}>
                      {t.speaker === "atlas" ? "Atlas" : open.participant.name}
                    </div>
                    <div style={{
                      fontSize: 13.5, lineHeight: 1.6, padding: "10px 13px", borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: t.speaker === "atlas" ? "var(--bg)" : "var(--badge-bg)",
                      color: "var(--t1)",
                    }}>
                      {t.text}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
                {open.id.startsWith("seed-") ? (
                  <span title="Demo session cannot be deleted" style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    fontSize: 12.5, fontWeight: 500, color: "var(--t5)",
                    padding: "8px 12px", cursor: "not-allowed",
                  }}>
                    <TrashGlyph /> Demo session cannot be deleted
                  </span>
                ) : (
                  <button
                    onClick={() => onRequestDeleteSession(open)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      background: "transparent", border: `1px solid ${DANGER_BR}`,
                      borderRadius: 9, color: DANGER, fontSize: 12.5, fontWeight: 500,
                      padding: "8px 12px", cursor: "pointer", fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = DANGER_BG; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <TrashGlyph /> Delete session
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sequence action bar — always visible so the map can be generated from a
          multi-select without opening a transcript first. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 24px", borderTop: "1px solid var(--border)",
        background: "var(--topbar)", flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--t4)",
        }}>
          Step {STEP_NO["Process map"]} · Build the map
        </span>
        {generating && (
          <span style={{ fontSize: 11.5, color: "var(--accent-s)", fontWeight: 500 }}>
            Building the map — opening Map &amp; analysis…
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>
          {selected.length > 0
            ? `from ${selected.length} selected session${selected.length !== 1 ? "s" : ""}`
            : open
              ? "from the open session"
              : `from all ${sessions.length} session${sessions.length !== 1 ? "s" : ""}`}
        </span>
        <button
          onClick={() => onGenerateMap(targetsForMap)}
          disabled={generating || targetsForMap.length === 0}
          style={{ ...primaryBtnStyle, opacity: generating || targetsForMap.length === 0 ? 0.5 : 1, cursor: generating || targetsForMap.length === 0 ? "default" : "pointer" }}
        >
          <MapGlyph /> {generating ? "Generating…" : "Generate process map"}
        </button>
      </div>
    </section>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  borderRadius: 10, fontWeight: 600, fontSize: 13.5, padding: "9px 15px",
  border: "1px solid transparent", background: "var(--accent)", color: "#10131f",
  cursor: "pointer", whiteSpace: "nowrap",
};

// Danger palette for destructive actions (delete). No theme token exists for
// red, so these literals are tuned to read on the dark and light surfaces alike.
const DANGER = "#e5645f";
const DANGER_BG = "rgba(229,100,95,0.12)";
const DANGER_BR = "rgba(229,100,95,0.45)";
const dangerBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle, background: DANGER, color: "#fff",
};

function TrashGlyph({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6" /></svg>;
}
function MicGlyph() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
}
function MapGlyph() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M7.6 7.7 11 16M16.4 7.7 13 16" /></svg>;
}

// ── Project status badge (overview cards) ───────────────────────────────────
const PROJECT_STATUS_STYLE: Record<Project["status"], { bg: string; color: string; label: string }> = {
  empty:    { bg: "var(--badge-bg)", color: "var(--t4)", label: "Empty" },
  captured: { bg: "rgba(124,131,255,0.14)", color: "var(--accent-s)", label: "Captured" },
  mapped:   { bg: "rgba(138,136,244,0.16)", color: "var(--accent)", label: "Mapped" },
  analyzed: { bg: "rgba(79,209,176,0.14)", color: "var(--c-proc)", label: "Analyzed" },
};

// ── Flow stepper ────────────────────────────────────────────────────────────
// Makes the four presenter-paced beats visible and self-explanatory so the demo
// no longer relies on the presenter remembering a hidden sequence. Each step is
// clickable; the first incomplete step is highlighted as the next action.
type FlowStep = { label: string; hint: string; done: boolean; view: View };

function FlowStepper({ steps, current, onGo }: {
  steps: FlowStep[];
  current: number; // index of the next actionable step, or -1 when all done
  onGo: (v: View) => void;
}) {
  return (
    <nav
      aria-label="Discovery flow"
      style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "0 18px", height: 46, flexShrink: 0,
        borderBottom: "1px solid var(--border)", background: "var(--surface)",
        overflowX: "auto",
      }}
    >
      {steps.map((s, i) => {
        const isCurrent = i === current;
        const state: "done" | "active" | "todo" = s.done ? "done" : isCurrent ? "active" : "todo";
        const color = state === "done" ? "var(--c-proc)" : state === "active" ? "var(--accent)" : "var(--t4)";
        const circleBg = state === "done" ? "rgba(79,209,176,0.16)" : state === "active" ? "var(--accent-bg)" : "var(--badge-bg)";
        return (
          <Fragment key={s.label}>
            {i > 0 && <span aria-hidden style={{ width: 22, height: 1, background: "var(--border)", flexShrink: 0 }} />}
            <button
              onClick={() => onGo(s.view)}
              aria-current={isCurrent ? "step" : undefined}
              title={s.hint}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", padding: "6px 8px", borderRadius: 8,
                color, flexShrink: 0, opacity: state === "todo" ? 0.75 : 1,
              }}
            >
              <span style={{
                width: 21, height: 21, borderRadius: "50%", flexShrink: 0,
                display: "grid", placeItems: "center",
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                background: circleBg, color,
                border: isCurrent ? `1px solid ${color}` : "1px solid transparent",
                boxShadow: isCurrent ? "0 0 0 3px var(--accent-bg)" : "none",
              }}>
                {s.done
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  : i + 1}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: isCurrent ? 700 : 500, whiteSpace: "nowrap" }}>{s.label}</span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

function ProjectStatusBadge({ status }: { status: Project["status"] }) {
  const s = PROJECT_STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em",
      padding: "3px 9px", borderRadius: 999, fontWeight: 600,
      background: s.bg, color: s.color, flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      {s.label}
    </span>
  );
}

function CheckDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: on ? "var(--c-proc)" : "var(--t4)" }}>
      <span style={{
        width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
        display: "grid", placeItems: "center",
        background: on ? "rgba(79,209,176,0.16)" : "var(--badge-bg)",
        color: on ? "var(--c-proc)" : "var(--t4)",
      }}>
        {on
          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          : <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor" }} />}
      </span>
      {label}
    </span>
  );
}

// ── Project switcher (top bar dropdown) ─────────────────────────────────────
type ProjectOverview = { project: Project; sessionCount: number; status: Project["status"]; lastUpdated: string; mapDone: boolean; analysisDone: boolean };

function ProjectSwitcher({
  overviews,
  activeId,
  onSelect,
  onNew,
  onRequestDelete,
}: {
  overviews: ProjectOverview[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRequestDelete: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = overviews.find((o) => o.project.id === activeId)?.project;
  const activeProtected = active ? isProtectedProject(active.id) : true;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: open ? "var(--bg)" : "transparent",
          border: "1px solid var(--border)", borderRadius: 8,
          padding: "4px 10px", cursor: "pointer", color: "var(--t1)",
          fontSize: 12, fontWeight: 600, fontFamily: "inherit", maxWidth: 260,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-proc)", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active?.name ?? "Select process"}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div role="menu" style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
            width: 290, maxHeight: 360, overflowY: "auto",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 6, boxShadow: "0 16px 44px rgba(0,0,0,0.4)",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--t4)", padding: "8px 10px 6px" }}>
              Processes
            </div>
            {overviews.map(({ project, sessionCount, status }) => {
              const isActive = project.id === activeId;
              return (
                <button
                  key={project.id}
                  role="menuitem"
                  onClick={() => { onSelect(project.id); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "9px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                    background: isActive ? "var(--bg)" : "transparent", border: "none",
                    color: "var(--t1)", fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ width: 14, flexShrink: 0, color: "var(--accent)" }}>
                    {isActive && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", marginTop: 1 }}>
                      {sessionCount} session{sessionCount !== 1 ? "s" : ""} · {PROJECT_STATUS_STYLE[status].label.toLowerCase()}
                    </span>
                  </span>
                </button>
              );
            })}
            <div style={{ height: 1, background: "var(--border)", margin: "6px 4px" }} />
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onNew(); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "9px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                background: "transparent", border: "none", color: "var(--accent-s)",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ width: 14, flexShrink: 0, display: "grid", placeItems: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </span>
              New process
            </button>

            {/* Danger zone — delete the active process (protected demo excluded) */}
            <div style={{ height: 1, background: "var(--border)", margin: "6px 4px" }} />
            <button
              role="menuitem"
              disabled={activeProtected}
              title={activeProtected ? "Demo project cannot be deleted" : undefined}
              onClick={() => { if (active && !activeProtected) { setOpen(false); onRequestDelete(active); } }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "9px 10px", borderRadius: 9, textAlign: "left",
                background: "transparent", border: "none",
                color: activeProtected ? "var(--t5)" : DANGER,
                cursor: activeProtected ? "not-allowed" : "pointer",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              }}
              onMouseEnter={(e) => { if (!activeProtected) (e.currentTarget as HTMLElement).style.background = DANGER_BG; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ width: 14, flexShrink: 0, display: "grid", placeItems: "center" }}>
                <TrashGlyph />
              </span>
              Delete this process
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── New process modal ───────────────────────────────────────────────────────
function NewProcessModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (fields: { name: string; lineOfBusiness: string; description: string }) => void;
}) {
  const [name, setName] = useState("");
  const [lineOfBusiness, setLineOfBusiness] = useState("");
  const [description, setDescription] = useState("");
  const canCreate = name.trim().length > 0;
  useEscapeKey(onClose);

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "var(--t4)", marginBottom: 6, display: "block",
  };
  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "var(--bg)",
    border: "1px solid var(--border)", borderRadius: 8,
    fontSize: 13.5, color: "var(--t1)", fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(5,5,15,0.62)", backdropFilter: "blur(2px)",
        display: "grid", placeItems: "center", padding: 24,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="new-process-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
          <h2 id="new-process-title" style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--t1)" }}>New process</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--t3)" }}>
            Create a workspace to capture sessions, build its map, and run analysis.
          </p>
        </div>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Process name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canCreate) onCreate({ name, lineOfBusiness, description }); }}
              placeholder="e.g. Group Travel Operations"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Line of business</label>
            <input
              value={lineOfBusiness}
              onChange={(e) => setLineOfBusiness(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canCreate) onCreate({ name, lineOfBusiness, description }); }}
              placeholder="e.g. Group travel"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Description <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this process covers…"
              rows={3}
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10, background: "var(--topbar)" }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 9, color: "var(--t3)", fontSize: 13, fontWeight: 500, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button
            onClick={() => canCreate && onCreate({ name, lineOfBusiness, description })}
            disabled={!canCreate}
            style={{ ...primaryBtnStyle, opacity: canCreate ? 1 : 0.5, cursor: canCreate ? "pointer" : "default" }}
          >
            Create process
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm delete modal (destructive) ──────────────────────────────────────
function ConfirmDeleteModal({
  title,
  body,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscapeKey(onCancel);
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 110,
        background: "rgba(5,5,15,0.62)", backdropFilter: "blur(2px)",
        display: "grid", placeItems: "center", padding: 24,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 22px", display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            display: "grid", placeItems: "center",
            background: DANGER_BG, color: DANGER, border: `1px solid ${DANGER_BR}`,
          }}>
            <TrashGlyph size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 600, color: "var(--t1)" }}>
              {title}
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--t3)", lineHeight: 1.55 }}>
              {body}
            </p>
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10, background: "var(--topbar)" }}>
          <button onClick={onCancel} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 9, color: "var(--t3)", fontSize: 13, fontWeight: 500, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={dangerBtnStyle}>
            <TrashGlyph />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Processes overview (home view) ──────────────────────────────────────────
function ProcessesView({
  overviews,
  activeId,
  onOpen,
  onNew,
  onRequestDelete,
}: {
  overviews: ProjectOverview[];
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRequestDelete: (project: Project) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 24px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 19, fontWeight: 600, margin: 0, letterSpacing: "-0.01em", color: "var(--t1)" }}>Processes</h2>
          <div style={{ fontSize: 13, color: "var(--t3)", marginTop: 2 }}>
            Each process is its own workspace — sessions, map, and analysis.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onNew} style={primaryBtnStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New process
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {overviews.map(({ project, sessionCount, status, lastUpdated, mapDone, analysisDone }) => {
            const isActive = project.id === activeId;
            const protectedProject = isProtectedProject(project.id);
            const showDelete = hoveredId === project.id;
            return (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(project.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(project.id); } }}
                style={{
                  display: "flex", flexDirection: "column", gap: 14, textAlign: "left",
                  padding: "18px 18px 16px", borderRadius: 14, cursor: "pointer",
                  background: "var(--surface)",
                  border: `1px solid ${isActive ? "var(--accent-br)" : "var(--border)"}`,
                  fontFamily: "inherit", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { setHoveredId(project.id); (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
                onMouseLeave={(e) => { setHoveredId(null); (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {project.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {project.lineOfBusiness || "—"}
                    </div>
                  </div>
                  <ProjectStatusBadge status={status} />
                  <button
                    aria-label={protectedProject ? "Demo project cannot be deleted" : "Delete process"}
                    title={protectedProject ? "Demo project cannot be deleted" : "Delete process"}
                    disabled={protectedProject}
                    onClick={(e) => { e.stopPropagation(); if (!protectedProject) onRequestDelete(project); }}
                    style={{
                      flexShrink: 0, width: 28, height: 28, borderRadius: 8,
                      display: "grid", placeItems: "center",
                      background: "transparent", border: "1px solid transparent",
                      color: protectedProject ? "var(--t5)" : DANGER,
                      cursor: protectedProject ? "not-allowed" : "pointer",
                      opacity: showDelete ? 1 : 0,
                      pointerEvents: showDelete ? "auto" : "none",
                      transition: "opacity 0.12s",
                    }}
                    onMouseEnter={(e) => { if (!protectedProject) { (e.currentTarget as HTMLElement).style.background = DANGER_BG; (e.currentTarget as HTMLElement).style.borderColor = DANGER_BR; } }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                  >
                    <TrashGlyph />
                  </button>
                </div>

                {project.description && (
                  <div style={{ fontSize: 12.5, color: "var(--t3)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {project.description}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <CheckDot on={mapDone} label="Map" />
                    <CheckDot on={analysisDone} label="Analysis" />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--t4)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <span>{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
                    <span>updated {lastUpdated}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Latest activity date for an overview card: newest session date, else created.
function lastUpdatedLabel(createdAt: string, sessions: Session[]): string {
  const dates = sessions.map((s) => s.date).filter(Boolean).sort();
  return dates[dates.length - 1] ?? createdAt.slice(0, 10);
}

// ── Top bar (brand + project switcher + demo/live controls) ─────────────────
function TopBar({
  overviews,
  activeProjectId,
  liveMode,
  theme,
  onSelectProject,
  onNewProcess,
  onRequestDeleteProject,
  onThemeChange,
  onLiveChange,
}: {
  overviews: ProjectOverview[];
  activeProjectId: string;
  liveMode: boolean;
  theme: Theme;
  onSelectProject: (id: string) => void;
  onNewProcess: () => void;
  onRequestDeleteProject: (project: Project) => void;
  onThemeChange: (t: Theme) => void;
  onLiveChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px", height: 46,
      borderBottom: "1px solid var(--border)",
      background: "var(--topbar)", flexShrink: 0,
    }}>
      {/* Brand + project switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.18em",
          textTransform: "uppercase",
        }} className="cosmos-title">
          COSMOS
        </span>
        <span style={{
          fontSize: 9, color: "var(--t6)", fontWeight: 600,
          borderLeft: "1px solid var(--border)", paddingLeft: 14,
          textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          Atlas Project Insights
        </span>
        <ProjectSwitcher
          overviews={overviews}
          activeId={activeProjectId}
          onSelect={onSelectProject}
          onNew={onNewProcess}
          onRequestDelete={onRequestDeleteProject}
        />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          title={liveMode
            ? "Live: extraction and analysis call Gemini in real time."
            : "Demo-safe: prepared graph and analysis. No Gemini, mic, or network."}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700,
            letterSpacing: "0.1em", padding: "3px 9px", borderRadius: 999,
            border: `1px solid ${liveMode ? "var(--accent-br)" : "rgba(79,209,176,0.4)"}`,
            background: liveMode ? "var(--accent-bg)" : "rgba(79,209,176,0.12)",
            color: liveMode ? "var(--accent)" : "var(--c-proc)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
          {liveMode ? "LIVE · GEMINI" : "DEMO-SAFE · PREPARED"}
        </span>
        <ThemeToggle theme={theme} onChange={onThemeChange} />
        <LiveToggle on={liveMode} onChange={onLiveChange} />
      </div>
    </div>
  );
}

// ── Map & analysis view (dependency map + insight panel) ────────────────────
function MapView({
  shownGraph,
  mapGraph,
  activeProject,
  mapStale,
  hasInsight,
  loading,
  ingesting,
  mapError,
  highlightedIds,
  processSummary,
  insights,
  error,
  onRunAnalysis,
  onRetry,
  onUsePrepared,
  onDismissMapError,
  onGoToSessions,
}: {
  shownGraph: Graph | null;
  mapGraph: Graph | null;
  activeProject: Project;
  mapStale: boolean;
  hasInsight: boolean;
  loading: boolean;
  ingesting: boolean;
  mapError: string | null;
  highlightedIds: string[];
  processSummary: string | null;
  insights: Insight[] | null;
  error: string | null;
  onRunAnalysis: () => void;
  onRetry: () => void;
  onUsePrepared?: () => void;
  onDismissMapError: () => void;
  onGoToSessions: () => void;
}) {
  return (
    <>
      {/* Left — dependency map */}
      <section style={{
        flex: "1 1 60%",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        minWidth: 0,
      }}>
        <header style={panelHeaderStyle}>
          <span>Dependency Map</span>
          {shownGraph && (
            <span style={{
              fontSize: 9, color: "var(--accent)", fontWeight: 700,
              background: "var(--accent-bg)", padding: "2px 8px", borderRadius: 4,
              letterSpacing: "0.05em", maxWidth: 220,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              🗂️ {activeProject.name}
            </span>
          )}
          {shownGraph && mapStale && (
            <span title="A session that fed this map was deleted. Regenerate to refresh." style={{
              fontSize: 9, color: DANGER, fontWeight: 700,
              background: DANGER_BG, border: `1px solid ${DANGER_BR}`,
              padding: "2px 8px", borderRadius: 4, letterSpacing: "0.05em",
            }}>
              MAY BE OUT OF DATE
            </span>
          )}
        </header>
        {/* Prominent next-step CTA in the primary content area: once a map
            exists but no analysis has run, point the presenter straight at
            Run analysis rather than relying on the insight panel alone. */}
        {shownGraph && !hasInsight && !loading && !ingesting && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            padding: "10px 16px", borderBottom: "1px solid var(--border)",
            background: "var(--accent-bg)",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--accent)",
            }}>
              Step {STEP_NO["Insight"]}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--t2)", flex: 1, minWidth: 140 }}>
              Map ready — run analysis to surface the shared dependency.
            </span>
            <button onClick={onRunAnalysis} style={primaryBtnStyle}>
              Run analysis
            </button>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {mapGraph ? (
            <DependencyMap graph={mapGraph} highlightedIds={highlightedIds} />
          ) : mapError ? (
            <MapErrorState
              message={mapError}
              onRetry={onRetry}
              onUsePrepared={onUsePrepared}
            />
          ) : (
            <div style={{ height: "100%", display: "grid", placeItems: "center", textAlign: "center", padding: 40 }}>
              <div style={{ maxWidth: 300, color: "var(--t4)" }}>
                <div style={{ fontSize: 14, color: "var(--t3)", marginBottom: 6 }}>No process map yet</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  Open <strong style={{ color: "var(--t2)" }}>Sessions</strong> for {activeProject.name} and generate a process map from its captured sessions.
                </div>
              </div>
            </div>
          )}
          {/* Non-blocking banner when a regeneration failed but a prior map
              is still on screen — keeps the demo recoverable. */}
          {mapGraph && mapError && (
            <div style={{
              position: "absolute", top: 12, left: 12, right: 12, zIndex: 5,
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "10px 14px", borderRadius: 10,
              background: DANGER_BG, border: `1px solid ${DANGER_BR}`,
              color: DANGER, fontSize: 12,
            }}>
              <span style={{ flex: 1, minWidth: 160 }}>
                Map generation failed — showing the previous map. {mapError}
              </span>
              <button onClick={onRetry} style={{
                background: "transparent", border: `1px solid ${DANGER_BR}`,
                borderRadius: 8, color: DANGER, fontSize: 12, fontWeight: 600,
                padding: "5px 12px", cursor: "pointer", fontFamily: "inherit",
              }}>
                Retry
              </button>
              <button onClick={onDismissMapError} title="Dismiss" style={{
                background: "transparent", border: "none", color: DANGER,
                fontSize: 14, cursor: "pointer", lineHeight: 1, padding: "2px 6px",
              }}>
                ✕
              </button>
            </div>
          )}
          {ingesting && <IngestOverlay />}
        </div>
      </section>

      {/* Right — insight panel */}
      <section style={{
        flex: "0 0 390px",
        display: "flex", flexDirection: "column",
        minHeight: 0,
        background: "var(--surface)",
      }}>
        <header style={panelHeaderStyle}>
          <span>Insight Panel</span>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <InsightPanel
            processSummary={processSummary}
            insights={insights}
            loading={loading}
            error={error}
            onAnalyze={onRunAnalysis}
            entities={shownGraph?.entities}
            hasMap={!!shownGraph}
            onGoToSessions={onGoToSessions}
          />
        </div>
      </section>
    </>
  );
}

export {
  IngestOverlay, MapErrorState, ThemeToggle, LiveToggle, NavRail,
  SessionsView, FlowStepper, ProjectSwitcher, NewProcessModal,
  ConfirmDeleteModal, ProcessesView, TopBar, MapView,
  sessionToTranscript, lastUpdatedLabel,
  FLOW_STEP_DEFS, STEP_NO, INGEST_DURATION,
  panelHeaderStyle, primaryBtnStyle, DANGER, DANGER_BG, DANGER_BR,
};
export type { View, Theme, FlowStep, ProjectOverview };
