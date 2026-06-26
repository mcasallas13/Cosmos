import type { Entity, Graph } from "./types";

// Per-entity detail derived purely from the graph topology. The map opens one of
// these cards when a node is clicked. Everything here is deterministic — no model
// call — so a clicked node always reflects exactly what the graph encodes.

export type RiskLevel = "High" | "Medium" | "Low";

export type PersonDetail = {
  kind: "person";
  id: string;
  name: string;
  role: string;
  team: string;
  processesOwned: string[];
  handoffCount: number;
  riskScore: number;
  riskLevel: RiskLevel;
  recommendedAction: string;
};

export type ProcessDetail = {
  kind: "process";
  id: string;
  name: string;
  initiatives: string[];
  owners: string[];
  systems: string[];
  hoursPerWeek: string | null;
  isSpof: boolean;
};

export type SystemDetail = {
  kind: "system";
  id: string;
  name: string;
  processesUsing: string[];
  maintainers: string[];
  isSpof: boolean;
};

export type InitiativeDetail = {
  kind: "initiative";
  id: string;
  name: string;
  processes: string[];
  dependsOnInitiatives: string[];
};

export type EntityDetail =
  | PersonDetail
  | ProcessDetail
  | SystemDetail
  | InitiativeDetail;

export function describeEntity(graph: Graph, id: string): EntityDetail | null {
  const byId = new Map(graph.entities.map((e) => [e.id, e]));
  const target = byId.get(id);
  if (!target) return null;

  const rels = graph.relationships;
  const nameOf = (eid: string) => byId.get(eid)?.name ?? eid;
  const isType = (eid: string, t: Entity["type"]) => byId.get(eid)?.type === t;
  const isLegacy = (sid: string) => /legacy|spreadsheet/i.test(byId.get(sid)?.name ?? "");

  // Initiatives a process belongs to (part_of) or that explicitly depend on it.
  const processInitiatives = (pid: string): string[] => {
    const set = new Set<string>();
    for (const r of rels) {
      if (r.type === "part_of" && r.source === pid && isType(r.target, "initiative")) set.add(r.target);
      if (r.type === "depends_on" && r.target === pid && isType(r.source, "initiative")) set.add(r.source);
    }
    return [...set];
  };
  const processOwners = (pid: string): string[] =>
    rels.filter((r) => r.type === "owns" && r.target === pid && isType(r.source, "person")).map((r) => r.source);
  const processSystems = (pid: string): string[] =>
    rels.filter((r) => r.type === "uses" && r.source === pid && isType(r.target, "system")).map((r) => r.target);
  const processHandoffs = (pid: string): number =>
    rels.filter((r) => r.type === "hands_off_to" && (r.source === pid || r.target === pid)).length;

  // A process is a single point of failure when many initiatives converge on it
  // under one owner, or when its sole owner runs it on a single legacy system.
  const isProcessSpof = (pid: string): boolean => {
    const owners = processOwners(pid);
    if (processInitiatives(pid).length >= 2 && owners.length <= 1) return true;
    if (owners.length === 1 && processSystems(pid).some(isLegacy)) return true;
    return false;
  };

  if (target.type === "person") {
    const ownedProcesses = rels
      .filter((r) => r.type === "owns" && r.source === id && isType(r.target, "process"))
      .map((r) => r.target);
    const handoffCount = ownedProcesses.reduce((acc, p) => acc + processHandoffs(p), 0);

    const spofProcesses = ownedProcesses.filter(isProcessSpof);
    const legacySystems = new Set<string>();
    let riskScore = 0;
    for (const p of spofProcesses) {
      riskScore += processInitiatives(p).length; // each converging initiative is a failure path
      for (const s of processSystems(p)) {
        if (isLegacy(s)) {
          riskScore += 1;
          legacySystems.add(s);
        }
      }
    }
    const riskLevel: RiskLevel = riskScore >= 2 ? "High" : riskScore === 1 ? "Medium" : "Low";

    let recommendedAction: string;
    if (spofProcesses.length > 0) {
      const procNames = spofProcesses.map(nameOf).join(", ");
      const sysNames = [...legacySystems].map(nameOf).join(", ");
      recommendedAction = sysNames
        ? `Cross-train a backup owner for ${procNames} and migrate ${sysNames} off the single legacy system.`
        : `Cross-train a backup owner for ${procNames} so it is not a single point of failure.`;
    } else if (ownedProcesses.length > 0) {
      recommendedAction = `Document ${ownedProcesses.map(nameOf).join(", ")} so ownership is not siloed to one person.`;
    } else {
      recommendedAction = "No single-point-of-failure dependencies detected for this person.";
    }

    return {
      kind: "person",
      id,
      name: target.name,
      role: target.attributes?.role ?? target.attributes?.title ?? "—",
      team: target.attributes?.team ?? "—",
      processesOwned: ownedProcesses.map(nameOf),
      handoffCount,
      riskScore,
      riskLevel,
      recommendedAction,
    };
  }

  if (target.type === "process") {
    return {
      kind: "process",
      id,
      name: target.name,
      initiatives: processInitiatives(id).map(nameOf),
      owners: processOwners(id).map(nameOf),
      systems: processSystems(id).map(nameOf),
      hoursPerWeek: target.attributes?.hoursPerWeek ?? null,
      isSpof: isProcessSpof(id),
    };
  }

  if (target.type === "system") {
    const processesUsing = rels
      .filter((r) => r.type === "uses" && r.target === id && isType(r.source, "process"))
      .map((r) => r.source);
    const maintainers = new Set<string>();
    if (target.attributes?.maintainer) maintainers.add(target.attributes.maintainer);
    for (const pid of processesUsing) for (const owner of processOwners(pid)) maintainers.add(nameOf(owner));
    return {
      kind: "system",
      id,
      name: target.name,
      processesUsing: processesUsing.map(nameOf),
      maintainers: [...maintainers],
      isSpof: isLegacy(id) || processesUsing.some(isProcessSpof),
    };
  }

  // initiative
  const processes = new Set<string>();
  for (const r of rels) {
    if (r.type === "part_of" && r.target === id && isType(r.source, "process")) processes.add(r.source);
    if (r.type === "depends_on" && r.source === id && isType(r.target, "process")) processes.add(r.target);
  }
  const dependsOn = new Set<string>();
  for (const pid of processes) {
    for (const initId of processInitiatives(pid)) if (initId !== id) dependsOn.add(initId);
  }
  return {
    kind: "initiative",
    id,
    name: target.name,
    processes: [...processes].map(nameOf),
    dependsOnInitiatives: [...dependsOn].map(nameOf),
  };
}
