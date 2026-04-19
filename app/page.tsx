"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Brain,
  Network,
  Database,
  Github,
  CircleDot,
  Radio,
  GitCommit,
  Clock,
  Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// ─── Architectural doctrine (static — these are real spec, not simulated) ────

type RegionId =
  | "intake" | "executive" | "systems" | "monetization" | "language"
  | "memory" | "diagnostic" | "creative" | "governance" | "execution";

interface RegionDef {
  id: RegionId;
  name: string;
  short: string;
  color: string;
  role: string;
  subclusters: string[];
}

const REGIONS: RegionDef[] = [
  { id: "intake",       name: "Intake Cortex",       short: "Intake",       color: "#22d3ee", role: "Signal parsing, context extraction, intent sensing",      subclusters: ["Intent Parsing", "Constraint Extraction", "Signal Normalization"] },
  { id: "executive",    name: "Executive Cortex",    short: "Executive",    color: "#facc15", role: "Goal routing, prioritization, arbitration, control",      subclusters: ["Priority Arbitration", "Mission Hierarchy", "Budget Allocation"] },
  { id: "systems",      name: "Systems Cortex",      short: "Systems",      color: "#60a5fa", role: "Architecture, workflows, infrastructure logic",           subclusters: ["Workflow Design", "Architecture Compression", "Pipeline Orchestration"] },
  { id: "monetization", name: "Monetization Cortex", short: "Monetization", color: "#10b981", role: "Offers, growth, leverage, value systems",                 subclusters: ["Offer Architecture", "Pricing Logic", "Growth Loops"] },
  { id: "language",     name: "Language Cortex",     short: "Language",     color: "#a855f7", role: "Compression, copy, persuasion, articulation",             subclusters: ["Prompt Patterning", "Narrative Compression", "Copy Synthesis"] },
  { id: "memory",       name: "Memory Cortex",       short: "Memory",       color: "#e2e8f0", role: "Recall, persistence, pattern storage, continuity",        subclusters: ["Procedural Memory", "Semantic Abstractions", "Structural Traces"] },
  { id: "diagnostic",   name: "Diagnostic Cortex",   short: "Diagnostic",   color: "#f87171", role: "Error detection, contradiction testing, repair logic",    subclusters: ["Bottleneck Analysis", "Failure Detection", "Repair Routing"] },
  { id: "creative",     name: "Creative Cortex",     short: "Creative",     color: "#ec4899", role: "Ideation, mutation, nonlinear synthesis",                  subclusters: ["Angle Mutation", "Visual Metaphors", "Exploration Threads"] },
  { id: "governance",   name: "Governance Cortex",   short: "Governance",   color: "#ffffff", role: "Permissions, autonomy gating, policy logic",              subclusters: ["Authority Matrix", "Budget Locks", "Autonomy Guardrails"] },
  { id: "execution",    name: "Execution Cortex",    short: "Execution",    color: "#fb923c", role: "Task completion, deployment, artifact generation",        subclusters: ["Artifact Build", "Sequencing", "Closure and Handoff"] },
];

const PATHWAYS: Array<[RegionId, RegionId, string]> = [
  ["intake",       "executive",    "Core intake route"],
  ["executive",    "systems",      "Architecture routing"],
  ["executive",    "monetization", "Value routing"],
  ["executive",    "language",     "Output shaping"],
  ["executive",    "execution",    "Implementation path"],
  ["memory",       "systems",      "Recall into structure"],
  ["memory",       "language",     "Recall into wording"],
  ["diagnostic",   "executive",    "Repair signal"],
  ["creative",     "systems",      "Novel architecture loop"],
  ["monetization", "language",     "Positioning loop"],
  ["governance",   "executive",    "Authority gating"],
  ["execution",    "memory",       "Completion trace writeback"],
  ["systems",      "execution",    "System deploy"],
  ["language",     "execution",    "Instruction render"],
];

// ─── Real telemetry types ────────────────────────────────────────────────────

interface Telemetry {
  timestamp?: string;
  task?: string;
  scenario?: string;
  mode?: string;
  activations?: Partial<Record<RegionId, number>>;
  activePaths?: number[];
  memory?: string[];
}

interface Meta {
  version: string;
  commit: string;
  commitMessage: string | null;
  buildTime: string;
  environment: string;
  serviceId: string | null;
  deploymentId: string | null;
  repoUrl: string;
  repo: string;
  defaultBranch: string | null;
  openIssues: number | null;
  lastCommit: { sha: string; message: string; date: string; author: string } | null;
  totalCommits: number | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CortexDashboard() {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [telemetryFetchedAt, setTelemetryFetchedAt] = useState<Date | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [now, setNow] = useState(new Date());
  const [selectedRegion, setSelectedRegion] = useState<RegionId>("executive");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchTelemetry = useCallback(async () => {
    try {
      const r = await fetch("/api/cortex/state", { cache: "no-store" });
      if (r.ok) {
        const data = (await r.json()) as Telemetry;
        setTelemetry(data);
        setTelemetryFetchedAt(new Date());
      }
    } catch {
      // silent — endpoint unreachable, keep last known state
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    const id = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(id);
  }, [fetchTelemetry]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cortex/meta", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Meta | null) => {
        if (!cancelled && d) setMeta(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const isIdle =
    !telemetry ||
    telemetry.scenario === "idle" ||
    !telemetry.task ||
    telemetry.task.startsWith("Idle");

  const activations = telemetry?.activations ?? {};
  const activePathIndices = new Set(telemetry?.activePaths ?? []);

  const regions = useMemo(() => {
    return REGIONS.map((r) => ({
      ...r,
      activation: activations[r.id] ?? 0,
      active: (activations[r.id] ?? 0) > 0.7,
    }));
  }, [activations]);

  const pathways = useMemo(() => {
    return PATHWAYS.map(([a, b, label], index) => ({
      a, b, label, index,
      active: activePathIndices.has(index),
      sourceRegion: REGIONS.find((r) => r.id === a)!,
      targetRegion: REGIONS.find((r) => r.id === b)!,
    }));
  }, [activePathIndices]);

  const activeRegionCount = regions.filter((r) => r.active).length;
  const activePathwayCount = pathways.filter((p) => p.active).length;
  const selectedRegionData = regions.find((r) => r.id === selectedRegion);
  const connectedPathways = pathways.filter(
    (p) => p.a === selectedRegion || p.b === selectedRegion
  );
  const telemetryStaleness = telemetryFetchedAt
    ? Math.round((now.getTime() - telemetryFetchedAt.getTime()) / 1000)
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-slate-900 border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                Persistent Cognitive Brain Architecture
              </Badge>
              {isIdle ? (
                <Badge className="bg-slate-900 border-slate-700 text-slate-500 text-[10px] uppercase tracking-wider gap-1">
                  <CircleDot className="w-3 h-3" />
                  Idle
                </Badge>
              ) : (
                <Badge className="bg-emerald-950 border-emerald-700/50 text-emerald-400 text-[10px] uppercase tracking-wider gap-1">
                  <Radio className="w-3 h-3 animate-pulse" />
                  Live Session
                </Badge>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-100">
              Synthetic Cortex OS
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {REGIONS.length} regions · {PATHWAYS.length} defined pathways · all values below are live or absent
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono space-y-0.5">
            <div>{now.toISOString().replace("T", " ").slice(0, 19)}Z</div>
            {meta && (
              <div>
                build <span className="text-slate-400">{meta.commit.slice(0, 7)}</span>
                {" · "}v{meta.version}
                {" · "}{meta.environment}
              </div>
            )}
          </div>
        </header>

        {/* Current session card */}
        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
              <div className="md:col-span-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  Current Session
                </div>
                {isIdle ? (
                  <div className="text-sm text-slate-500 italic">
                    No active session. Telemetry returning default idle state.
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-slate-200 font-medium">
                      {telemetry?.task}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 space-x-3">
                      {telemetry?.scenario && <span>scenario: <span className="text-slate-400">{telemetry.scenario}</span></span>}
                      {telemetry?.mode && <span>mode: <span className="text-slate-400">{telemetry.mode}</span></span>}
                    </div>
                  </>
                )}
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  Active Regions
                </div>
                <div className="text-2xl font-mono text-slate-200">
                  {activeRegionCount}
                  <span className="text-sm text-slate-600"> / {REGIONS.length}</span>
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">&gt;70% activation</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  Active Pathways
                </div>
                <div className="text-2xl font-mono text-slate-200">
                  {activePathwayCount}
                  <span className="text-sm text-slate-600"> / {PATHWAYS.length}</span>
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">firing per telemetry</div>
              </div>
            </div>
            {telemetryFetchedAt && (
              <div className="text-[10px] text-slate-600 mt-3 pt-3 border-t border-slate-800 font-mono">
                fetched {telemetryStaleness}s ago
                {telemetry?.timestamp && (
                  <> · state written {new Date(telemetry.timestamp).toLocaleString()}</>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Regions + inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-400" />
                Cortex Regions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1.5">
              {regions.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRegion(r.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedRegion === r.id
                      ? "border-slate-600 bg-slate-800/70"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                      style={{
                        background: r.color,
                        boxShadow: r.active ? `0 0 10px ${r.color}` : "none",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-200">{r.name}</span>
                        <span className="text-xs font-mono text-slate-500 tabular-nums">
                          {isIdle ? "—" : `${Math.round(r.activation * 100)}%`}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{r.role}</div>
                      {!isIdle && r.activation > 0 && (
                        <Progress
                          value={Math.round(r.activation * 100)}
                          className="h-1 bg-slate-800 mt-2"
                        />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 self-start">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: selectedRegionData?.color ?? "#888" }}
                />
                Region Inspector
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              {selectedRegionData && (
                <>
                  <div>
                    <div className="text-base font-semibold text-slate-100">
                      {selectedRegionData.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {selectedRegionData.role}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                      Current Activation
                    </div>
                    <div className="text-2xl font-mono text-slate-200">
                      {isIdle ? "—" : `${Math.round(selectedRegionData.activation * 100)}%`}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                      Subclusters
                    </div>
                    <div className="space-y-1">
                      {selectedRegionData.subclusters.map((s) => (
                        <div
                          key={s}
                          className="text-xs text-slate-300 bg-slate-950/40 border border-slate-800 rounded px-2 py-1"
                        >
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                      Connected Pathways
                    </div>
                    <div className="text-xs text-slate-400">
                      {connectedPathways.length} connected
                      {!isIdle && (
                        <>, {connectedPathways.filter((p) => p.active).length} active</>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs — only honest views */}
        <Tabs defaultValue="pathways">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="pathways" className="text-xs">Pathways</TabsTrigger>
            <TabsTrigger value="telemetry" className="text-xs">Telemetry</TabsTrigger>
            <TabsTrigger value="build" className="text-xs">Build Info</TabsTrigger>
          </TabsList>

          <TabsContent value="pathways">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
              {pathways.map((p) => (
                <div
                  key={p.index}
                  className={`rounded-md border p-3 transition-colors ${
                    p.active
                      ? "border-emerald-700/50 bg-emerald-950/20"
                      : "border-slate-800 bg-slate-950/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200">
                      {p.sourceRegion.short} → {p.targetRegion.short}
                    </span>
                    {p.active ? (
                      <Badge className="bg-emerald-900 border-emerald-700 text-emerald-400 text-[10px] uppercase">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-900 border-slate-700 text-slate-500 text-[10px] uppercase">
                        Idle
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{p.label}</div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="telemetry">
            <div className="mt-2 space-y-3">
              <Card className="border-slate-800 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Network className="w-4 h-4 text-cyan-400" />
                    Raw Telemetry State
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="text-xs text-slate-500 mb-2">
                    Source: <span className="font-mono text-slate-400">GET /api/cortex/state</span>
                    {telemetryStaleness !== null && (
                      <> · fetched {telemetryStaleness}s ago</>
                    )}
                  </div>
                  <pre className="text-[11px] font-mono text-slate-400 bg-slate-950/60 border border-slate-800 rounded p-3 overflow-x-auto whitespace-pre-wrap">
{telemetry ? JSON.stringify(telemetry, null, 2) : "loading..."}
                  </pre>
                </CardContent>
              </Card>

              {telemetry?.memory && telemetry.memory.length > 0 && (
                <Card className="border-slate-800 bg-slate-900/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <Database className="w-4 h-4 text-slate-400" />
                      Memory Writes ({telemetry.memory.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                    {telemetry.memory.map((m, i) => (
                      <div
                        key={i}
                        className="text-sm text-slate-400 bg-slate-950/40 border border-slate-800 rounded p-2"
                      >
                        {m}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="build">
            <Card className="border-slate-800 bg-slate-900/60 mt-2">
              <CardContent className="p-4">
                {meta ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    <MetaRow icon={GitCommit} label="Build Commit" value={meta.commit.slice(0, 12)} mono />
                    <MetaRow icon={Clock} label="Build Time" value={new Date(meta.buildTime).toLocaleString()} mono />
                    <MetaRow icon={Server} label="Environment" value={meta.environment} mono />
                    <MetaRow icon={Github} label="Default Branch" value={meta.defaultBranch ?? "—"} mono />
                    <MetaRow label="Version" value={meta.version} mono />
                    <MetaRow label="Total Commits" value={meta.totalCommits?.toString() ?? "—"} mono />
                    <MetaRow label="Open Issues" value={meta.openIssues?.toString() ?? "—"} mono />
                    {meta.lastCommit && (
                      <div className="md:col-span-2 pt-3 border-t border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                          Latest Commit
                        </div>
                        <div className="text-sm text-slate-200">{meta.lastCommit.message}</div>
                        <div className="text-xs text-slate-500 font-mono mt-1">
                          {meta.lastCommit.sha.slice(0, 7)} · {meta.lastCommit.author} · {new Date(meta.lastCommit.date).toLocaleString()}
                        </div>
                      </div>
                    )}
                    <div className="md:col-span-2 pt-2">
                      <a
                        href={meta.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
                      >
                        <Github className="w-3 h-3" />
                        {meta.repo}
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Loading build info...</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer className="text-[11px] text-slate-600 pt-3 border-t border-slate-800 flex flex-col md:flex-row md:justify-between gap-1">
          <span>Synthetic Cortex OS · v{meta?.version ?? "?"} · data shown is live or absent — no simulated values</span>
          <span className="font-mono">
            {meta && (
              <>
                {meta.repo} @ {meta.commit.slice(0, 7)}
              </>
            )}
          </span>
        </footer>
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider mb-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={`text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
