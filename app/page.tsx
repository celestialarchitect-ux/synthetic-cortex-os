"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";

const CortexBrain3D = dynamic(() => import("@/components/cortex-brain-3d"), { ssr: false });
import { CortexErrorBoundary } from "@/components/error-boundary";
import { motion } from "framer-motion";
import {
  Brain,
  Activity,
  Cpu,
  Zap,
  Shield,
  Coins,
  Network,
  Database,
  Sparkles,
  AlertTriangle,
  Play,
  Pause,
  Gauge,
  Eye,
  Clock3,
  Layers3,
  Orbit,
  Workflow,
  Radar,
  PanelRight,
  PanelLeft,
  Building2,
  BarChart3,
  Mail,
  Users,
  FolderKanban,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// ─── Types ────────────────────────────────────────────────────────────────────
type RegionId =
  | "intake"
  | "executive"
  | "systems"
  | "monetization"
  | "language"
  | "memory"
  | "diagnostic"
  | "creative"
  | "governance"
  | "execution";

type Phase = "saturated" | "active" | "primed" | "cooling";
type ViewMode = "brain" | "heat" | "pathways";

interface RegionBase {
  id: RegionId;
  name: string;
  short: string;
  color: [number, number, number];
  x: number;
  y: number;
  size: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  role: string;
  health: number;
  load: number;
  subclusters: string[];
}

interface Region extends RegionBase {
  activation: number;
  phase: Phase;
  pathwayCount: number;
}

interface PathwayDef {
  a: RegionId;
  b: RegionId;
}

interface PathwayObject extends PathwayDef {
  isActive: boolean;
  strength: number;
}

interface ScenarioDef {
  activations: Record<RegionId, number>;
  activePaths: number[];
  memory: string[];
  mode: string;
  task: string;
}

interface MemoryUtil {
  working: number;
  procedural: number;
  semantic: number;
  preference: number;
  structural: number;
}

// ─── Static data ──────────────────────────────────────────────────────────────
const regionsBase: RegionBase[] = [
  {
    id: "intake",
    name: "Intake",
    short: "INT",
    color: [22, 211, 238],
    x: 50,
    y: 10,
    size: 72,
    icon: Radar,
    role: "Signal ingestion & context parsing",
    health: 98,
    load: 74,
    subclusters: ["Context Parser", "Signal Filter", "Intent Classifier"],
  },
  {
    id: "executive",
    name: "Executive",
    short: "EXC",
    color: [250, 204, 21],
    x: 50,
    y: 50,
    size: 88,
    icon: Brain,
    role: "Decision-making & goal orchestration",
    health: 96,
    load: 82,
    subclusters: ["Goal Planner", "Priority Arbiter", "Conflict Resolver"],
  },
  {
    id: "systems",
    name: "Systems",
    short: "SYS",
    color: [96, 165, 250],
    x: 18,
    y: 30,
    size: 68,
    icon: Cpu,
    role: "Infrastructure & compute management",
    health: 99,
    load: 61,
    subclusters: ["Resource Allocator", "Process Monitor", "Queue Manager"],
  },
  {
    id: "monetization",
    name: "Monetization",
    short: "MON",
    color: [16, 185, 129],
    x: 82,
    y: 30,
    size: 68,
    icon: Coins,
    role: "Revenue logic & payment flows",
    health: 94,
    load: 57,
    subclusters: ["Stripe Handler", "Token Ledger", "Revenue Optimizer"],
  },
  {
    id: "language",
    name: "Language",
    short: "LNG",
    color: [168, 85, 247],
    x: 22,
    y: 65,
    size: 64,
    icon: Sparkles,
    role: "NLP, generation & comprehension",
    health: 97,
    load: 79,
    subclusters: ["Tokenizer", "Semantic Engine", "Response Composer"],
  },
  {
    id: "memory",
    name: "Memory",
    short: "MEM",
    color: [226, 232, 240],
    x: 78,
    y: 65,
    size: 64,
    icon: Database,
    role: "Persistent knowledge & recall",
    health: 93,
    load: 68,
    subclusters: ["Episodic Store", "Procedural Cache", "Semantic Graph"],
  },
  {
    id: "diagnostic",
    name: "Diagnostic",
    short: "DGN",
    color: [248, 113, 113],
    x: 10,
    y: 55,
    size: 56,
    icon: AlertTriangle,
    role: "Error detection & self-repair",
    health: 91,
    load: 43,
    subclusters: ["Anomaly Detector", "Repair Planner", "Health Monitor"],
  },
  {
    id: "creative",
    name: "Creative",
    short: "CRE",
    color: [236, 72, 153],
    x: 90,
    y: 55,
    size: 56,
    icon: Orbit,
    role: "Novel synthesis & ideation",
    health: 95,
    load: 55,
    subclusters: ["Analogy Engine", "Concept Blender", "Novel Generator"],
  },
  {
    id: "governance",
    name: "Governance",
    short: "GOV",
    color: [255, 255, 255],
    x: 50,
    y: 82,
    size: 60,
    icon: Shield,
    role: "Ethics, safety & constraint enforcement",
    health: 100,
    load: 38,
    subclusters: ["Ethics Filter", "Safety Checker", "Policy Enforcer"],
  },
  {
    id: "execution",
    name: "Execution",
    short: "EXE",
    color: [251, 146, 60],
    x: 50,
    y: 30,
    size: 60,
    icon: Workflow,
    role: "Action dispatch & tool invocation",
    health: 97,
    load: 72,
    subclusters: ["Tool Router", "Action Queue", "Output Formatter"],
  },
];

const pathwayDefs: PathwayDef[] = [
  { a: "intake", b: "executive" },
  { a: "intake", b: "systems" },
  { a: "intake", b: "language" },
  { a: "executive", b: "systems" },
  { a: "executive", b: "monetization" },
  { a: "executive", b: "language" },
  { a: "executive", b: "memory" },
  { a: "executive", b: "execution" },
  { a: "systems", b: "diagnostic" },
  { a: "language", b: "creative" },
  { a: "language", b: "memory" },
  { a: "memory", b: "governance" },
  { a: "creative", b: "execution" },
  { a: "execution", b: "monetization" },
];

const scenarios: ScenarioDef[] = [
  {
    mode: "Product Launch",
    task: "Orchestrating Phantom Engine v2 launch sequence",
    activations: {
      intake: 0.92,
      executive: 0.97,
      systems: 0.78,
      monetization: 0.88,
      language: 0.85,
      memory: 0.71,
      diagnostic: 0.45,
      creative: 0.66,
      governance: 0.52,
      execution: 0.91,
    },
    activePaths: [0, 4, 5, 7, 13],
    memory: [
      "Launch checklist loaded from Obsidian",
      "Stripe product IDs confirmed",
      "Railway deploy webhook active",
    ],
  },
  {
    mode: "Security Audit",
    task: "Running full sentinel sweep across all Railway services",
    activations: {
      intake: 0.61,
      executive: 0.74,
      systems: 0.93,
      monetization: 0.42,
      language: 0.55,
      memory: 0.82,
      diagnostic: 0.96,
      creative: 0.33,
      governance: 0.91,
      execution: 0.58,
    },
    activePaths: [3, 8, 11],
    memory: [
      "Prior audit flags loaded",
      "Security ruleset v4 active",
      "Incident log reviewed",
    ],
  },
  {
    mode: "Autonomy Loop",
    task: "Self-directed improvement cycle: refining skill matrix",
    activations: {
      intake: 0.55,
      executive: 0.88,
      systems: 0.62,
      monetization: 0.48,
      language: 0.91,
      memory: 0.95,
      diagnostic: 0.54,
      creative: 0.89,
      governance: 0.61,
      execution: 0.77,
    },
    activePaths: [5, 6, 9, 10, 12],
    memory: [
      "Skill matrix v7 loaded",
      "Prior session deltas applied",
      "Learning objectives queued",
    ],
  },
  {
    mode: "Builder Mode",
    task: "Constructing Cortex OS observatory UI in real-time",
    activations: {
      intake: 0.81,
      executive: 0.93,
      systems: 0.76,
      monetization: 0.59,
      language: 0.87,
      memory: 0.78,
      diagnostic: 0.49,
      creative: 0.95,
      governance: 0.44,
      execution: 0.88,
    },
    activePaths: [0, 2, 5, 7, 9, 12],
    memory: [
      "Component spec loaded",
      "Design tokens locked",
      "Build pipeline warm",
    ],
  },
];

const timelineSeed: string[] = [
  "Episodic snapshot persisted to vault",
  "Executive arbitration: 3 goals merged",
  "Sentinel cleared /api/wallet endpoint",
  "Creative cluster proposed 2 novel analogies",
  "Memory write: Railway deploy sequence",
  "Governance policy refreshed from rules/",
  "Token budget threshold warning cleared",
  "Language model calibration: +0.3% coherence",
  "Execution queue drained — 7 tasks complete",
];

const memoryPool: string[] = [
  "New referral pattern detected in NEXUS data",
  "Stripe webhook latency spike → auto-retry engaged",
  "Obsidian vault sync complete — 14 new notes",
  "Session delta compressed to 1,240 tokens",
  "Governance override on autonomy task #4",
  "Creative cluster: concept blend approved",
  "Railway build succeeded — 38s",
  "Memory index rebuilt — 2,847 entries",
];

const autonomyJobs = [
  { id: "AJ-001", task: "Refine skill matrix", status: "running", prog: 67 },
  { id: "AJ-002", task: "Audit memory index", status: "queued", prog: 0 },
  { id: "AJ-003", task: "Update agent routing table", status: "running", prog: 34 },
  { id: "AJ-004", task: "Compress session logs", status: "complete", prog: 100 },
  { id: "AJ-005", task: "Scan for stale references", status: "queued", prog: 0 },
  { id: "AJ-006", task: "Generate weekly summary", status: "running", prog: 81 },
  { id: "AJ-007", task: "Recalibrate token budgets", status: "complete", prog: 100 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
function pct(n: number) {
  return Math.round(n * 100);
}
function randomDelta() {
  return Math.floor((Math.random() - 0.5) * 4);
}

// ─── Enterprise portfolio data ────────────────────────────────────────────────

const portfolioBusinesses = [
  { name: "Embodiment Celestial", status: "Primary",  revenue: "$182,400", leads: 18422, conversion: "4.8%", projects: 12, channel: "Education / Supplements" },
  { name: "Divinum Vitality",     status: "Scaling",  revenue: "$96,280",  leads: 9210,  conversion: "3.9%", projects: 7,  channel: "Supplements" },
  { name: "Elysian Wand",         status: "Launch",   revenue: "$24,600",  leads: 3310,  conversion: "5.6%", projects: 5,  channel: "Consumer Product" },
  { name: "Beach Bunkers",        status: "Seasonal", revenue: "$13,950",  leads: 2650,  conversion: "2.7%", projects: 4,  channel: "Outdoor Product" },
];

const enterpriseProjects = [
  { title: "Unified CRM Reservoir",        business: "All Businesses",       owner: "Executive Cortex", stage: "In Build", completion: 74, description: "Merging leads, tags, communication permissions, and sender identities into one central graph." },
  { title: "Auto Project Population Engine", business: "Embodiment Celestial", owner: "Systems Cortex",   stage: "Active",   completion: 66, description: "Creates new project entries, links assets, and opens analytics panels as soon as a project is initialized." },
  { title: "Cross-Brand Analytics Layer",  business: "Portfolio",             owner: "Memory Cortex",    stage: "Staging",  completion: 58, description: "Normalizes metrics from every business into one readable observatory with historical traces." },
  { title: "Multi-Sender Outreach Console", business: "All Businesses",       owner: "Language Cortex",  stage: "Queued",   completion: 31, description: "Send campaigns from any approved business identity while preserving lead history and segmentation." },
];

const crmSegments = [
  { name: "All Leads Reservoir",   count: 33612, growth: "+12.4%" },
  { name: "Buyers",                count: 7428,  growth: "+8.1%" },
  { name: "High Intent",           count: 5120,  growth: "+16.7%" },
  { name: "Affiliate / Partners",  count: 904,   growth: "+4.6%" },
  { name: "Dormant Reactivation",  count: 11780, growth: "+9.8%" },
];

const enterpriseSignals = [
  "New project detected in portfolio intake -> analytics shell prepared automatically",
  "Lead import normalization completed for 4 business pipelines",
  "Cross-brand attribution model synced email identity rules to CRM",
  "Executive cortex linked portfolio health view to business-specific dashboards",
];

const statusPills: Record<Phase, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  primed: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  cooling: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  saturated: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-100 font-mono">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function MemoryBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-mono">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function AutonomyCard({
  job,
}: {
  job: { id: string; task: string; status: string; prog: number };
}) {
  const statusColor =
    job.status === "running"
      ? "text-emerald-400"
      : job.status === "complete"
      ? "text-cyan-400"
      : "text-slate-500";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-slate-500">{job.id}</span>
        <span className={`text-xs font-medium ${statusColor}`}>{job.status}</span>
      </div>
      <p className="text-xs text-slate-300">{job.task}</p>
      <Progress value={job.prog} className="h-1" />
    </div>
  );
}

interface RegionInspectorProps {
  region: Region;
  relatedPaths: PathwayObject[];
  strongestPath: PathwayObject | undefined;
}

function RegionInspector({ region, relatedPaths, strongestPath }: RegionInspectorProps) {
  const [r, g, b] = region.color;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div
          className="rounded-full p-2"
          style={{ background: `rgba(${r},${g},${b},0.15)` }}
        >
          <region.icon
            className="w-5 h-5"
            style={{ color: `rgb(${r},${g},${b})` }}
          />
        </div>
        <div>
          <div className="font-bold text-slate-100">{region.name}</div>
          <div className="text-xs text-slate-500">{region.role}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Activation" value={`${pct(region.activation)}%`} />
        <Stat label="Health" value={`${region.health}%`} />
        <Stat label="Load" value={`${region.load}%`} />
        <Stat
          label="Phase"
          value={region.phase.charAt(0).toUpperCase() + region.phase.slice(1)}
        />
      </div>

      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
          Subclusters
        </div>
        <div className="flex flex-col gap-1">
          {region.subclusters.map((sc) => (
            <div
              key={sc}
              className="text-xs text-slate-300 px-2 py-1 rounded bg-slate-800/60"
            >
              {sc}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
          Pathways
        </div>
        <div className="text-sm text-slate-300">
          {relatedPaths.length} connected
          {strongestPath && (
            <span className="text-slate-500">
              {" "}— strongest: {strongestPath.a} ↔ {strongestPath.b}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function SyntheticCortexOSLiveUI() {
  const [running, setRunning] = useState(true);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [pulseTick, setPulseTick] = useState(0);
  const [dayTokens, setDayTokens] = useState(362441);
  const [autonomyQueue, setAutonomyQueue] = useState(7);
  const [timeline, setTimeline] = useState<string[]>(timelineSeed.slice(0, 5));
  const [selectedRegionId, setSelectedRegionId] = useState<RegionId>("executive");
  const [showInspector, setShowInspector] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("brain");
  const [memoryUtil, setMemoryUtil] = useState<MemoryUtil>({
    working: 62,
    procedural: 48,
    semantic: 77,
    preference: 55,
    structural: 31,
  });
  const [activationOverride, setActivationOverride] = useState<
    Partial<Record<RegionId, number>> | null
  >(null);

  const currentScenario = scenarios[scenarioIndex];

  // Pulse tick
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setPulseTick((t) => t + 1);
      setDayTokens((t) => t + 350 + Math.floor(Math.random() * 1200));
      setAutonomyQueue((q) => clamp(q + (Math.random() > 0.5 ? 1 : -1), 3, 14));
      setMemoryUtil((m) => ({
        working: clamp(m.working + randomDelta(), 10, 95),
        procedural: clamp(m.procedural + randomDelta(), 10, 95),
        semantic: clamp(m.semantic + randomDelta(), 10, 95),
        preference: clamp(m.preference + randomDelta(), 10, 95),
        structural: clamp(m.structural + randomDelta(), 10, 95),
      }));
    }, 1400);
    return () => clearInterval(id);
  }, [running]);

  // Scenario rotation
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setScenarioIndex((i) => (i + 1) % scenarios.length);
      setActivationOverride(null);
      const pick = memoryPool[Math.floor(Math.random() * memoryPool.length)];
      setTimeline((tl) => [pick, ...tl].slice(0, 9));
    }, 5200);
    return () => clearInterval(id);
  }, [running]);

  // Telemetry poll
  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/cortex/state", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          activations?: Partial<Record<RegionId, number>>;
          scenario?: string;
          task?: string;
          memory?: string[];
        };
        if (data.activations) {
          setActivationOverride(data.activations);
        }
        if (data.memory && data.memory.length > 0) {
          setTimeline((tl) => [data.memory![0], ...tl].slice(0, 9));
        }
      }
    } catch {
      // silently fall back to local simulation
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    fetchTelemetry();
    const id = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(id);
  }, [fetchTelemetry, running]);

  // Derive regions with activation
  const regions = useMemo<Region[]>(() => {
    return regionsBase.map((rb) => {
      const baseActivation =
        activationOverride?.[rb.id] ?? currentScenario.activations[rb.id];
      const jitter = running ? (pulseTick % 7) * 0.003 * (Math.random() - 0.5) : 0;
      const activation = clamp(baseActivation + jitter, 0, 1);
      const phase: Phase =
        activation > 0.9
          ? "saturated"
          : activation > 0.7
          ? "active"
          : activation > 0.45
          ? "primed"
          : "cooling";
      const pathwayCount = pathwayDefs.filter(
        (p) => p.a === rb.id || p.b === rb.id
      ).length;
      return { ...rb, activation, phase, pathwayCount };
    });
  }, [currentScenario, pulseTick, running, activationOverride]);

  const regionMap = useMemo(
    () => Object.fromEntries(regions.map((r) => [r.id, r])) as Record<RegionId, Region>,
    [regions]
  );

  const pathwayObjects = useMemo<PathwayObject[]>(
    () =>
      pathwayDefs.map((pd, i) => {
        const isActive = currentScenario.activePaths.includes(i);
        const avgAct =
          (regionMap[pd.a].activation + regionMap[pd.b].activation) / 2;
        return { ...pd, isActive, strength: Math.round(avgAct * 100) };
      }),
    [currentScenario, regionMap]
  );

  const selectedRegion = regionMap[selectedRegionId];
  const relatedPaths = pathwayObjects.filter(
    (p) => p.a === selectedRegionId || p.b === selectedRegionId
  );
  const strongestPath = relatedPaths.reduce<PathwayObject | undefined>(
    (best, p) => (!best || p.strength > best.strength ? p : best),
    undefined
  );

  const usedPct = Math.min(Math.round((dayTokens / 1000000) * 100), 100);
  const regionHealth = Math.round(
    regions.reduce((s, r) => s + r.health, 0) / regions.length
  );
  const avgActivation = Math.round(
    (regions.reduce((s, r) => s + r.activation, 0) / regions.length) * 100
  );
  const topRegions = [...regions]
    .sort((a, b) => b.activation - a.activation)
    .slice(0, 5);
  const activePathCount = pathwayObjects.filter((p) => p.isActive).length;
  const activeRegionCount = regions.filter((r) => r.activation > 0.7).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs">
              Persistent Cognitive Brain Architecture
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">
            Synthetic Cortex OS
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Live observatory — {regions.length} regions · {pathwayDefs.length} pathways ·{" "}
            {autonomyJobs.length} autonomy jobs
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRunning((r) => !r)}
            className="border-slate-700 text-slate-300 hover:text-slate-100"
          >
            {running ? (
              <><Pause className="w-3 h-3 mr-1" /> Pause</>
            ) : (
              <><Play className="w-3 h-3 mr-1" /> Resume</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setScenarioIndex((i) => (i + 1) % scenarios.length);
              setActivationOverride(null);
            }}
            className="border-slate-700 text-slate-300 hover:text-slate-100"
          >
            <Layers3 className="w-3 h-3 mr-1" /> Switch Scenario
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInspector((v) => !v)}
            className="border-slate-700 text-slate-300 hover:text-slate-100"
          >
            {showInspector ? (
              <><PanelLeft className="w-3 h-3 mr-1" /> Hide Inspector</>
            ) : (
              <><PanelRight className="w-3 h-3 mr-1" /> Show Inspector</>
            )}
          </Button>
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          icon={Activity}
          label="Cortex Health"
          value={`${regionHealth}%`}
          sub="All regions nominal"
          color="text-emerald-400"
        />
        <MetricCard
          icon={Gauge}
          label="Avg Activation"
          value={`${avgActivation}%`}
          sub={`${activeRegionCount} regions hot`}
          color="text-cyan-400"
        />
        <MetricCard
          icon={Network}
          label="Active Pathways"
          value={`${activePathCount}`}
          sub={`of ${pathwayDefs.length} total`}
          color="text-violet-400"
        />
        <MetricCard
          icon={Brain}
          label="Active Regions"
          value={`${activeRegionCount}`}
          sub="activation > 70%"
          color="text-yellow-400"
        />
        <MetricCard
          icon={Cpu}
          label="Autonomy Queue"
          value={`${autonomyQueue}`}
          sub="jobs pending"
          color="text-orange-400"
        />
        <MetricCard
          icon={Zap}
          label="Daily Token Use"
          value={dayTokens.toLocaleString()}
          sub={`${usedPct}% of budget`}
          color="text-pink-400"
        />
      </div>

      {/* Main grid */}
      <div
        className={`grid gap-4 ${
          showInspector
            ? "grid-cols-1 lg:grid-cols-[1fr_300px_260px]"
            : "grid-cols-1 lg:grid-cols-[1fr_300px]"
        }`}
      >
        {/* Brain Observatory */}
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                Brain Observatory
              </CardTitle>
              <div className="flex items-center gap-1">
                {(["brain", "heat", "pathways"] as ViewMode[]).map((vm) => (
                  <button
                    key={vm}
                    onClick={() => setViewMode(vm)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      viewMode === vm
                        ? "bg-slate-700 text-slate-100"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {vm}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div
              className="relative h-[480px] w-full overflow-hidden rounded-[16px] border border-slate-800"
              style={{ background: "radial-gradient(circle at 50% 45%, rgba(10,14,30,0.95), rgba(2,3,10,1))" }}
            >
              <CortexErrorBoundary>
                <CortexBrain3D
                  regions={regions}
                  pathways={pathwayObjects}
                  viewMode={viewMode}
                  selectedRegionId={selectedRegionId}
                  onSelectRegion={(id: string) => setSelectedRegionId(id as RegionId)}
                />
              </CortexErrorBoundary>
            </div>
          </CardContent>
        </Card>

        {/* Right column: Task state + Top Regions */}
        <div className="flex flex-col gap-4">
          {/* Task state */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                Task State
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              <div>
                <div className="text-xs font-semibold text-slate-200 mb-0.5">
                  {currentScenario.mode}
                </div>
                <div className="text-xs text-slate-400">{currentScenario.task}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">
                  Execution live
                </span>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Token budget</span>
                  <span className="text-slate-300 font-mono">{usedPct}%</span>
                </div>
                <Progress value={usedPct} className="h-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Stat label="Primary Mode" value={currentScenario.mode} />
                <Stat
                  label="Autonomy Level"
                  value={autonomyQueue > 8 ? "High" : autonomyQueue > 5 ? "Med" : "Low"}
                />
                <Stat
                  label="Memory Writes"
                  value={currentScenario.memory.length.toString()}
                />
                <Stat label="Governance" value="Active" />
              </div>
            </CardContent>
          </Card>

          {/* Top Regions */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Radar className="w-3.5 h-3.5 text-cyan-400" />
                Top Regions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {topRegions.map((region) => {
                const [r, g, b] = region.color;
                return (
                  <div
                    key={region.id}
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setSelectedRegionId(region.id)}
                  >
                    <div
                      className="rounded-full p-1 flex-shrink-0"
                      style={{ background: `rgba(${r},${g},${b},0.15)` }}
                    >
                      <region.icon
                        className="w-3 h-3"
                        style={{ color: `rgb(${r},${g},${b})` }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {region.name}
                        </span>
                        <span className="text-xs font-mono text-slate-400 ml-2 flex-shrink-0">
                          {pct(region.activation)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pct(region.activation)}%`,
                              background: `rgb(${r},${g},${b})`,
                            }}
                          />
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                            statusPills[region.phase]
                          }`}
                        >
                          {region.phase}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Inspector panel */}
        {showInspector && (
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Clock3 className="w-3.5 h-3.5 text-violet-400" />
                Region Inspector
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <RegionInspector
                region={selectedRegion}
                relatedPaths={relatedPaths}
                strongestPath={strongestPath}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom tabs */}
      <Tabs defaultValue="pathways">
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="pathways" className="text-xs">
            Pathways
          </TabsTrigger>
          <TabsTrigger value="memory" className="text-xs">
            Memory
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">
            Timeline
          </TabsTrigger>
          <TabsTrigger value="autonomy" className="text-xs">
            Autonomy
          </TabsTrigger>
          <TabsTrigger value="enterprise" className="text-xs">
            Enterprise
          </TabsTrigger>
        </TabsList>

        {/* Pathways tab */}
        <TabsContent value="pathways">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
            {pathwayObjects.map((pw, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    {pw.a} → {pw.b}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full border ${
                      pw.isActive
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : "bg-slate-800 text-slate-500 border-slate-700"
                    }`}
                  >
                    {pw.isActive ? "active" : "idle"}
                  </span>
                </div>
                <Progress value={pw.strength} className="h-1" />
                <span className="text-xs text-slate-500 font-mono">
                  strength {pw.strength}%
                </span>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Memory tab */}
        <TabsContent value="memory">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">
                Recent Writes
              </div>
              <div className="flex flex-col gap-2">
                {currentScenario.memory.map((m, i) => (
                  <div
                    key={i}
                    className="text-xs text-slate-300 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800"
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">
                Memory Distribution
              </div>
              <div className="flex flex-col gap-3">
                <MemoryBar
                  label="Working Memory"
                  value={memoryUtil.working}
                  color="bg-cyan-500"
                />
                <MemoryBar
                  label="Procedural"
                  value={memoryUtil.procedural}
                  color="bg-blue-500"
                />
                <MemoryBar
                  label="Semantic"
                  value={memoryUtil.semantic}
                  color="bg-violet-500"
                />
                <MemoryBar
                  label="Preference"
                  value={memoryUtil.preference}
                  color="bg-pink-500"
                />
                <MemoryBar
                  label="Structural"
                  value={memoryUtil.structural}
                  color="bg-orange-500"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Timeline tab */}
        <TabsContent value="timeline">
          <div className="flex flex-col gap-2 mt-2">
            {timeline.map((item, i) => (
              <motion.div
                key={`${item}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-3 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800"
              >
                <span className="text-xs font-mono text-slate-600 flex-shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xs text-slate-300">{item}</span>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Autonomy tab */}
        <TabsContent value="autonomy">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">
                Autonomy Jobs
              </div>
              <div className="grid grid-cols-1 gap-2">
                {autonomyJobs.map((job) => (
                  <AutonomyCard key={job.id} job={job} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">
                Governance Stats
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 flex flex-col gap-3">
                <Stat label="Policy Version" value="v4.2.1" />
                <Stat label="Safety Score" value="99.8%" />
                <Stat label="Override Events" value="0 (today)" />
                <Stat label="Ethics Filter" value="Active" />
                <Stat label="Last Audit" value="4 hours ago" />
                <Stat label="Constraint Violations" value="0 lifetime" />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Enterprise tab */}
        <TabsContent value="enterprise">
          <div className="space-y-4 mt-2">
            {/* Top metric row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={Building2}    label="Businesses"        value={`${portfolioBusinesses.length}`} sub="tracked in observatory" color="text-cyan-400" />
              <MetricCard icon={Users}        label="Lead Reservoir"    value={crmSegments[0].count.toLocaleString()} sub="centralized profiles" color="text-emerald-400" />
              <MetricCard icon={FolderKanban} label="Active Projects"   value={`${enterpriseProjects.length}`} sub="portfolio lanes" color="text-amber-400" />
              <MetricCard icon={Mail}         label="Sender Identities" value="12" sub="cross-brand outreach" color="text-violet-400" />
            </div>

            {/* Portfolio matrix + CRM reservoir */}
            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Enterprise Portfolio Matrix</div>
                <div className="flex flex-col gap-2">
                  {portfolioBusinesses.map((biz) => (
                    <div key={biz.name} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">{biz.name}</span>
                            <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{biz.status}</Badge>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{biz.channel}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs min-w-[200px]">
                          <Stat label="Revenue" value={biz.revenue} />
                          <Stat label="Leads" value={biz.leads.toLocaleString()} />
                          <Stat label="Conversion" value={biz.conversion} />
                          <Stat label="Projects" value={`${biz.projects}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Lead Reservoir CRM</div>
                <div className="flex flex-col gap-3">
                  {crmSegments.map((segment) => (
                    <div key={segment.name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-300">{segment.name}</span>
                        <span className="text-slate-500">{segment.count.toLocaleString()} · {segment.growth}</span>
                      </div>
                      <Progress value={Math.min(100, Math.round((segment.count / 33612) * 100))} className="h-1.5 bg-slate-800" />
                    </div>
                  ))}
                  <div className="rounded-md border border-emerald-400/20 bg-emerald-500/5 p-3 text-xs text-slate-300">
                    Central CRM routes all imported leads into a unified profile graph with tags, business affinity, purchase history, sender permissions, and campaign eligibility.
                  </div>
                </div>
              </div>
            </div>

            {/* Projects auto-pop + signal bus */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Project Auto-Population Engine</div>
                <div className="flex flex-col gap-2">
                  {enterpriseProjects.map((project) => (
                    <div key={project.title} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm text-slate-200">{project.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{project.business} · {project.owner}</div>
                        </div>
                        <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{project.stage}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{project.description}</p>
                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500 uppercase tracking-wider">Completion</span>
                          <span className="text-slate-400">{project.completion}%</span>
                        </div>
                        <Progress value={project.completion} className="h-1.5 bg-slate-800" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Enterprise Signal Bus</div>
                <div className="flex flex-col gap-2">
                  {enterpriseSignals.map((signal, i) => (
                    <div key={i} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-800 bg-slate-900/70 flex-shrink-0">
                          <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-300">Cross-system event</div>
                          <div className="text-xs text-slate-400 mt-0.5">{signal}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <Stat label="Auto-created shells" value="28" />
                    <Stat label="Connected data pipes" value="43" />
                    <Stat label="Unread alerts" value="6" />
                    <Stat label="CRM sync health" value="98%" />
                  </div>
                </div>
              </div>
            </div>

            {/* Outreach + doctrine */}
            <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Cross-Brand Outreach Console</div>
                <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400 mb-3">
                  One reservoir. Multiple sender identities. Every lead retains a unified communication history, business-source trail, campaign interaction map, and permission state.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Eligible audiences" value="14" />
                  <Stat label="Approved senders" value="12" />
                  <Stat label="Active campaigns" value="9" />
                  <Stat label="Reply routing" value="Unified" />
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Enterprise Operating Doctrine</div>
                <div className="flex flex-col gap-2 text-xs text-slate-400">
                  <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                    Every business, project, lead, campaign, and analytics stream feeds one central operating graph.
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                    New projects auto-populate with metadata, dashboards, ownership, linked files, and performance surfaces.
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                    Portfolio intelligence rolls upward into one observatory while preserving drill-down control at the business and project level.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-800">
        <span>Synthetic Cortex OS · v0.2.0</span>
        <span className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              running ? "bg-emerald-500 animate-pulse" : "bg-slate-600"
            }`}
          />
          {running ? "Live" : "Paused"}
        </span>
      </div>
    </div>
  );
}
