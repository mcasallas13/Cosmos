"use client";

import { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";
import type { Graph } from "@/lib/types";
import { describeEntity, type EntityDetail } from "@/lib/entityDetail";

const NODE_W = 178;
const NODE_H = 56;

type EType = "initiative" | "process" | "person" | "system";

const ENTITY: Record<EType, { color: string; meta: string }> = {
  initiative: { color: "var(--c-init)",   meta: "Initiative" },
  process:    { color: "var(--c-proc)",   meta: "Process" },
  person:     { color: "var(--c-person)", meta: "Person" },
  system:     { color: "var(--c-system)", meta: "System" },
};

const LEGEND: { type: EType; label: string }[] = [
  { type: "initiative", label: "Initiative" },
  { type: "process",    label: "Process" },
  { type: "person",     label: "Person" },
  { type: "system",     label: "System" },
];

// ── Entity-type icons (match Atlas reference) ───────────────────────────────
function NodeIcon({ type, color }: { type: EType; color: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: color, strokeWidth: 1.5 };
  switch (type) {
    case "initiative":
      return <svg {...common}><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2" fill={color} stroke="none" /></svg>;
    case "process":
      return <svg {...common}><rect x="2" y="3.5" width="12" height="9" rx="2.5" /></svg>;
    case "person":
      return <svg {...common}><circle cx="8" cy="6" r="2.6" /><path d="M3 14a5 5 0 0 1 10 0" /></svg>;
    case "system":
      return <svg {...common}><ellipse cx="8" cy="4.5" rx="5" ry="2" /><path d="M3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7" /></svg>;
  }
}

type NodeData = {
  label: string;
  meta: string;
  entityType: EType;
  color: string;
  shared: boolean;
};

// ── Custom card node ────────────────────────────────────────────────────────
function AtlasNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1, border: "none" }} />
      <div
        className="atlas-card"
        style={{
          position: "relative",
          width: NODE_W,
          height: NODE_H,
          background: "var(--map-node)",
          border: "1px solid var(--map-node-line)",
          borderRadius: 11,
          display: "flex",
          alignItems: "center",
          gap: 11,
          paddingLeft: 16,
          paddingRight: 12,
          overflow: "hidden",
        }}
      >
        {/* left accent bar */}
        <span style={{
          position: "absolute", left: 0, top: 10, bottom: 10, width: 3.5,
          borderRadius: 2, background: d.color,
        }} />
        <NodeIcon type={d.entityType} color={d.color} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
            color: "var(--map-text)", lineHeight: 1.2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {d.label}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.02em",
            color: "var(--map-muted)", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {d.meta}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1, border: "none" }} />
    </>
  );
}

const nodeTypes = { atlas: AtlasNode };

function metaFor(e: Graph["entities"][number]): string {
  if (e.type === "person") return e.attributes?.role ?? e.attributes?.title ?? "Person";
  if (e.type === "system") return e.attributes?.team ?? "System";
  return ENTITY[e.type as EType]?.meta ?? e.type;
}

function buildLayout(graph: Graph): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 130, marginx: 36, marginy: 36 });

  for (const e of graph.entities) g.setNode(e.id, { width: NODE_W, height: NODE_H });
  for (const r of graph.relationships) g.setEdge(r.source, r.target);
  Dagre.layout(g);

  const nodes: Node[] = graph.entities.map((e) => {
    const pos = g.node(e.id);
    const color = ENTITY[e.type as EType]?.color ?? "var(--map-muted)";
    return {
      id: e.id,
      type: "atlas",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { label: e.name, meta: metaFor(e), entityType: e.type, color, shared: false },
    };
  });

  const edges: Edge[] = graph.relationships.map((r) => ({
    id: r.id,
    source: r.source,
    target: r.target,
    label: r.label ?? r.type.replace(/_/g, " "),
    labelStyle: { fontSize: 9, fill: "var(--map-muted)", fontFamily: "var(--font-mono)" },
    labelBgStyle: { fill: "var(--map-bg)", fillOpacity: 0.85 },
    labelBgPadding: [3, 4] as [number, number],
    style: { stroke: "var(--map-line)", strokeWidth: 1.4 },
    type: "smoothstep",
  }));

  return { nodes, edges };
}

// ── Node detail card ────────────────────────────────────────────────────────
const KIND_LABEL: Record<EntityDetail["kind"], string> = {
  person: "Person",
  process: "Process",
  system: "System",
  initiative: "Initiative",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: "1px solid var(--map-node-line)" }}>
      <span style={{
        flex: "0 0 96px", fontFamily: "var(--font-mono)", fontSize: 10,
        letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--map-muted)",
        paddingTop: 1,
      }}>
        {label}
      </span>
      <span style={{ flex: 1, fontSize: 12.5, color: "var(--map-text)", lineHeight: 1.5, minWidth: 0 }}>
        {children}
      </span>
    </div>
  );
}

const dash = "—";
const list = (xs: string[]) => (xs.length ? xs.join(", ") : dash);

function RiskPill({ level, score }: { level: "High" | "Medium" | "Low"; score: number }) {
  const color = level === "High" ? "var(--risk)" : level === "Medium" ? "var(--c-person)" : "var(--c-proc)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {level} · {score}
    </span>
  );
}

function SpofPill({ on }: { on: boolean }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
      color: on ? "var(--risk)" : "var(--c-proc)",
    }}>
      {on ? "Yes — single point of failure" : "No"}
    </span>
  );
}

function NodeDetailCard({ detail, color, onClose }: { detail: EntityDetail; color: string; onClose: () => void }) {
  return (
    <div style={{
      position: "absolute", top: 12, right: 12, zIndex: 20, width: 300,
      background: "var(--surface)", border: "1px solid var(--map-line)",
      borderRadius: 12, padding: "14px 16px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--map-muted)",
          }}>
            {KIND_LABEL[detail.kind]}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--map-text)", lineHeight: 1.25, marginTop: 2 }}>
            {detail.name}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail card"
          style={{
            flexShrink: 0, width: 22, height: 22, borderRadius: 6, cursor: "pointer",
            border: "1px solid var(--map-node-line)", background: "transparent",
            color: "var(--map-muted)", display: "grid", placeItems: "center", lineHeight: 1,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5 5 19" /></svg>
        </button>
      </div>

      {detail.kind === "person" && (
        <>
          <Row label="Role">{detail.role}</Row>
          <Row label="Team">{detail.team}</Row>
          <Row label="Owns">{detail.processesOwned.length} process{detail.processesOwned.length !== 1 ? "es" : ""}{detail.processesOwned.length ? ` · ${list(detail.processesOwned)}` : ""}</Row>
          <Row label="Handoffs">{detail.handoffCount}</Row>
          <Row label="Risk score"><RiskPill level={detail.riskLevel} score={detail.riskScore} /></Row>
          <Row label="Action">{detail.recommendedAction}</Row>
        </>
      )}

      {detail.kind === "process" && (
        <>
          <Row label="Initiatives">{list(detail.initiatives)}</Row>
          <Row label="Owners">{list(detail.owners)}</Row>
          <Row label="Systems">{list(detail.systems)}</Row>
          <Row label="Hours/week">{detail.hoursPerWeek ? `${detail.hoursPerWeek} hrs` : dash}</Row>
          <Row label="Risk"><SpofPill on={detail.isSpof} /></Row>
        </>
      )}

      {detail.kind === "system" && (
        <>
          <Row label="Used by">{list(detail.processesUsing)}</Row>
          <Row label="Maintainers">{list(detail.maintainers)}</Row>
          <Row label="Risk"><SpofPill on={detail.isSpof} /></Row>
        </>
      )}

      {detail.kind === "initiative" && (
        <>
          <Row label="Processes">{list(detail.processes)}</Row>
          <Row label="Depends on">{list(detail.dependsOnInitiatives)}</Row>
        </>
      )}
    </div>
  );
}

type Props = {
  graph: Graph;
  highlightedIds?: string[];
};

export default function DependencyMap({ graph, highlightedIds = [] }: Props) {
  const { nodes: baseNodes, edges: baseEdges } = useMemo(() => buildLayout(graph), [graph]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useMemo(
    () => (selectedId ? describeEntity(graph, selectedId) : null),
    [graph, selectedId]
  );
  const selectedColor = selectedId
    ? ENTITY[(graph.entities.find((e) => e.id === selectedId)?.type as EType)]?.color ?? "var(--map-muted)"
    : "var(--map-muted)";
  const highlighted = useMemo(() => new Set(highlightedIds), [highlightedIds]);
  const hasHighlight = highlighted.size > 0;

  const nodes = useMemo(
    () =>
      baseNodes.map((n) => {
        const isOn = highlighted.has(n.id);
        return {
          ...n,
          className: isOn ? "atlas-node-highlight" : hasHighlight ? "atlas-node-dim" : undefined,
        };
      }),
    [baseNodes, highlighted, hasHighlight]
  );

  const edges = useMemo(
    () =>
      baseEdges.map((e) => {
        const isOn = highlighted.has(e.source) && highlighted.has(e.target);
        return {
          ...e,
          animated: false,
          className: isOn ? "atlas-risk-edge" : undefined,
          style: {
            ...e.style,
            stroke: isOn ? "var(--risk)" : hasHighlight ? "var(--map-node)" : "var(--map-line)",
            strokeWidth: isOn ? 2.4 : 1.4,
          },
        };
      }),
    [baseEdges, highlighted, hasHighlight]
  );

  return (
    <div style={{
      position: "relative", height: "100%",
      background: "var(--map-bg)",
      backgroundImage: "radial-gradient(120% 80% at 50% -10%, rgba(142,136,244,0.06), transparent 60%)",
    }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={2}
        style={{ background: "transparent" }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--map-line)" gap={24} size={1} />
        <Controls style={{ background: "var(--surface)", border: "1px solid var(--map-line)", borderRadius: 8 }} />
        <MiniMap
          style={{ background: "var(--surface)", border: "1px solid var(--map-line)" }}
          nodeColor={(node) => {
            const t = (node.data as NodeData | undefined)?.entityType;
            return (t && ENTITY[t]?.color) || "var(--map-line)";
          }}
          maskColor="rgba(14,19,32,0.78)"
        />
      </ReactFlow>

      {/* Clicked-node detail card */}
      {detail && (
        <NodeDetailCard detail={detail} color={selectedColor} onClose={() => setSelectedId(null)} />
      )}

      {/* Legend */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 10,
        background: "var(--surface)", border: "1px solid var(--map-line)",
        borderRadius: 10, padding: "10px 13px",
        display: "flex", flexDirection: "column", gap: 7,
      }}>
        {LEGEND.map(({ type, label }) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: ENTITY[type].color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--map-muted)" }}>{label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ width: 16, height: 0, borderTop: "2px dashed var(--risk)", flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--map-muted)" }}>Concentration risk</span>
        </div>
      </div>
    </div>
  );
}
