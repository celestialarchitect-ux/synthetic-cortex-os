/**
 * Cortex Engine — continuous state machine for the 10-region synthetic cortex.
 *
 * Runs a 4 Hz tick loop at module init. Every tick:
 *   - Applies baseline spontaneous noise (1–5 Hz equivalent firing)
 *   - Decays activations toward zero
 *   - Computes pathway flow where source→target activations pair
 *   - Applies Hebbian reinforcement to connected pathways
 *   - Updates memory weights (slow accumulation from activation)
 *   - Tracks fire counts, usage counts, load
 *
 * Every 30s: memory consolidation (strengthen high-usage paths, forget weak ones).
 * Every 5min: structural audit (form subclusters from co-activation patterns).
 *
 * State persists to disk every 10 ticks. Survives container restarts.
 * External tasks can POST activations to bias the engine.
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";

export type RegionId =
  | "intake" | "executive" | "systems" | "monetization" | "language"
  | "memory" | "diagnostic" | "creative" | "governance" | "execution";

export const REGION_IDS: RegionId[] = [
  "intake", "executive", "systems", "monetization", "language",
  "memory", "diagnostic", "creative", "governance", "execution",
];

// Same indexing as app/page.tsx PATHWAYS array
export const PATHWAYS: Array<[RegionId, RegionId]> = [
  ["intake",       "executive"],
  ["executive",    "systems"],
  ["executive",    "monetization"],
  ["executive",    "language"],
  ["executive",    "execution"],
  ["memory",       "systems"],
  ["memory",       "language"],
  ["diagnostic",   "executive"],
  ["creative",     "systems"],
  ["monetization", "language"],
  ["governance",   "executive"],
  ["execution",    "memory"],
  ["systems",      "execution"],
  ["language",     "execution"],
];

export interface RegionRuntime {
  activation: number;      // 0..1 live
  memory_weight: number;   // 0..1 slow accumulator
  fire_count: number;      // lifetime
  last_fired_tick: number;
}

export interface PathwayRuntime {
  strength: number;        // 0..1 learned
  flow: number;            // 0..1 instantaneous
  usage_count: number;     // lifetime
  last_flow_tick: number;
}

export interface Subcluster {
  id: string;
  parent: RegionId;
  name: string;
  strength: number;
  formed_tick: number;
}

export interface TaskInfluence {
  task: string;
  targets: Partial<Record<RegionId, number>>;
  ticks_remaining: number;
}

export interface CortexState {
  tick: number;
  started_at: number;
  last_tick_time: number;
  regions: Record<RegionId, RegionRuntime>;
  pathways: PathwayRuntime[];
  subclusters: Subcluster[];
  active_task: string | null;
  task_queue: TaskInfluence[];
  load: number;
  consolidations: number;
  structural_audits: number;
  memory_log: string[];       // ring buffer of recent consolidation / subcluster events
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TICK_HZ = 4;
const TICK_MS = 1000 / TICK_HZ;
const PERSIST_EVERY_N_TICKS = 10;
const CONSOLIDATE_EVERY_N_TICKS = TICK_HZ * 30;     // 30s
const STRUCTURAL_AUDIT_EVERY_N_TICKS = TICK_HZ * 300; // 5min
const MEMORY_LOG_MAX = 40;

const BASELINE_NOISE_SIGMA = 0.012;     // gaussian stdev for baseline firing
const SPONTANEOUS_FIRE_PROB = 0.02;     // chance any given region spikes per tick
const ACTIVATION_DECAY = 0.975;         // per-tick decay
const MEMORY_LEARN_RATE = 0.006;        // memory_weight += activation * rate
const MEMORY_DECAY = 0.9995;            // slow forgetting
const PATHWAY_LEARN_RATE = 0.004;       // Hebbian: strength += co-activation * rate
const PATHWAY_DECAY = 0.9997;           // synaptic pruning
const FLOW_DECAY = 0.90;                // pathway flow decays fast

const STATE_FILE =
  process.env.CORTEX_STATE_FILE ||
  (process.env.RAILWAY_ENVIRONMENT
    ? path.join(os.tmpdir(), "cortex-engine-state.json")
    : path.join(os.homedir(), ".claude", "cortex-engine-state.json"));

// ─── State init ───────────────────────────────────────────────────────────────

function makeInitialState(): CortexState {
  const regions: Record<RegionId, RegionRuntime> = {} as Record<RegionId, RegionRuntime>;
  for (const id of REGION_IDS) {
    regions[id] = {
      activation: 0.1 + Math.random() * 0.2,
      memory_weight: 0,
      fire_count: 0,
      last_fired_tick: 0,
    };
  }
  const pathways: PathwayRuntime[] = PATHWAYS.map(() => ({
    strength: 0.15,
    flow: 0,
    usage_count: 0,
    last_flow_tick: 0,
  }));
  return {
    tick: 0,
    started_at: Date.now(),
    last_tick_time: Date.now(),
    regions,
    pathways,
    subclusters: [],
    active_task: null,
    task_queue: [],
    load: 0,
    consolidations: 0,
    structural_audits: 0,
    memory_log: [],
  };
}

// ─── Math utils ───────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function gaussian(sigma: number): number {
  // Box-Muller
  const u1 = Math.max(1e-9, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

function tick(state: CortexState): void {
  state.tick += 1;
  state.last_tick_time = Date.now();

  // 1. Apply any active task influences to activations
  for (const task of state.task_queue) {
    for (const [region, target] of Object.entries(task.targets) as Array<[RegionId, number]>) {
      const r = state.regions[region];
      if (!r) continue;
      // Lerp current activation toward task target
      r.activation = r.activation + (target - r.activation) * 0.15;
    }
    task.ticks_remaining -= 1;
  }
  state.task_queue = state.task_queue.filter((t) => t.ticks_remaining > 0);
  state.active_task = state.task_queue.length > 0 ? state.task_queue[0].task : null;

  // 2. Per-region update: noise, spontaneous firing, decay, memory accumulation
  for (const id of REGION_IDS) {
    const r = state.regions[id];

    // Baseline noise — continuous low-frequency activity
    r.activation += gaussian(BASELINE_NOISE_SIGMA);

    // Spontaneous fire (1–5 Hz equivalent across the field)
    if (Math.random() < SPONTANEOUS_FIRE_PROB) {
      r.activation = Math.max(r.activation, 0.5 + Math.random() * 0.4);
      r.fire_count += 1;
      r.last_fired_tick = state.tick;
    }

    // Decay toward idle baseline (not zero — true idle floor)
    r.activation *= ACTIVATION_DECAY;
    const IDLE_FLOOR = 0.05 + 0.03 * Math.sin(state.tick * 0.02 + REGION_IDS.indexOf(id));
    r.activation = Math.max(IDLE_FLOOR, r.activation);
    r.activation = clamp(r.activation, 0, 1);

    // Memory weight: slow accumulation from sustained activity, very slow forgetting
    r.memory_weight = r.memory_weight * MEMORY_DECAY + r.activation * MEMORY_LEARN_RATE;
    r.memory_weight = clamp(r.memory_weight, 0, 1);
  }

  // 3. Pathway flow + Hebbian reinforcement
  let totalFlow = 0;
  for (let i = 0; i < PATHWAYS.length; i++) {
    const [src, dst] = PATHWAYS[i];
    const p = state.pathways[i];
    const srcA = state.regions[src].activation;
    const dstA = state.regions[dst].activation;

    // Flow fires when source is strongly active; it then pushes activation to target
    const coActivation = srcA * dstA;
    const fire = srcA > 0.55 ? srcA * p.strength : 0;

    p.flow = Math.max(p.flow * FLOW_DECAY, fire);
    if (fire > 0.1) {
      // Actually propagate some activation along the pathway
      state.regions[dst].activation = Math.min(
        1,
        state.regions[dst].activation + fire * 0.15
      );
      p.usage_count += 1;
      p.last_flow_tick = state.tick;
    }

    // Hebbian: pathways with co-active endpoints strengthen; others slowly decay
    p.strength = p.strength * PATHWAY_DECAY + coActivation * PATHWAY_LEARN_RATE;
    p.strength = clamp(p.strength, 0.01, 1);

    totalFlow += p.flow;
  }

  // 4. Overall load = mean activation + pathway flow contribution
  let totalActivation = 0;
  for (const id of REGION_IDS) totalActivation += state.regions[id].activation;
  state.load = (totalActivation / REGION_IDS.length) * 0.6 + (totalFlow / PATHWAYS.length) * 0.4;

  // 5. Periodic cycles
  if (state.tick % CONSOLIDATE_EVERY_N_TICKS === 0) consolidate(state);
  if (state.tick % STRUCTURAL_AUDIT_EVERY_N_TICKS === 0) structuralAudit(state);
}

// ─── Consolidation ────────────────────────────────────────────────────────────

function consolidate(state: CortexState): void {
  state.consolidations += 1;
  let strengthened = 0;
  let forgotten = 0;

  for (let i = 0; i < state.pathways.length; i++) {
    const p = state.pathways[i];
    // Strengthen pathways that fired a lot recently
    if (p.usage_count > 5 && p.strength > 0.35) {
      p.strength = Math.min(1, p.strength + 0.02);
      strengthened++;
    }
    // Reset low-usage pathways (give them a chance to relearn)
    if (p.usage_count < 2 && p.strength < 0.15) {
      p.usage_count = 0;
      forgotten++;
    }
  }

  // Log event
  pushLog(
    state,
    `consolidation cycle #${state.consolidations}: strengthened ${strengthened}, pruned ${forgotten}`
  );
}

// ─── Structural audit ─────────────────────────────────────────────────────────

function structuralAudit(state: CortexState): void {
  state.structural_audits += 1;

  // Find regions with high memory_weight that don't yet have a subcluster
  for (const id of REGION_IDS) {
    const r = state.regions[id];
    if (r.memory_weight > 0.6) {
      const existing = state.subclusters.find((sc) => sc.parent === id);
      if (!existing) {
        const names: Record<RegionId, string[]> = {
          intake:       ["Context Priming", "Ambient Intake"],
          executive:    ["Priority Matrix", "Conflict Arbiter"],
          systems:      ["Workflow Compression", "Pipeline Mesh"],
          monetization: ["Offer Grid", "Value Loop"],
          language:     ["Tone Controller", "Compression Lane"],
          memory:       ["Procedural Cache", "Semantic Index"],
          diagnostic:   ["Failure Graph", "Repair Ledger"],
          creative:     ["Angle Weaver", "Mutation Lab"],
          governance:   ["Budget Ledger", "Authority Tree"],
          execution:    ["Artifact Forge", "Sequence Planner"],
        };
        const pool = names[id];
        const name = pool[Math.floor(Math.random() * pool.length)];
        state.subclusters.push({
          id: `sc-${id}-${state.tick}`,
          parent: id,
          name,
          strength: r.memory_weight,
          formed_tick: state.tick,
        });
        pushLog(state, `subcluster formed: ${id}/${name} (memory_weight ${r.memory_weight.toFixed(2)})`);
      }
    }
  }

  // Decay old subclusters with low parent memory
  state.subclusters = state.subclusters.filter((sc) => {
    const r = state.regions[sc.parent];
    if (r.memory_weight < 0.2) {
      pushLog(state, `subcluster dissolved: ${sc.parent}/${sc.name}`);
      return false;
    }
    return true;
  });
}

function pushLog(state: CortexState, msg: string): void {
  const time = new Date().toISOString();
  state.memory_log.unshift(`[${time}] ${msg}`);
  if (state.memory_log.length > MEMORY_LOG_MAX) state.memory_log.length = MEMORY_LOG_MAX;
}

// ─── External task injection ──────────────────────────────────────────────────

export function injectTask(
  state: CortexState,
  task: string,
  targets: Partial<Record<RegionId, number>>,
  durationTicks = TICK_HZ * 15 // 15s default
): void {
  state.task_queue.push({ task, targets, ticks_remaining: durationTicks });
  pushLog(state, `task injected: "${task}" affecting ${Object.keys(targets).join(", ")}`);
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function loadState(): Promise<CortexState | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as CortexState;
    // Basic sanity check
    if (parsed && typeof parsed.tick === "number" && parsed.regions) {
      return parsed;
    }
  } catch {
    // no file yet
  }
  return null;
}

async function saveState(state: CortexState): Promise<void> {
  try {
    await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(state), "utf-8");
  } catch {
    // silent — persistence is best-effort
  }
}

// ─── Singleton engine with tick interval ─────────────────────────────────────

type Engine = {
  state: CortexState;
  subscribers: Set<(state: CortexState) => void>;
  interval: NodeJS.Timeout | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalAny = global as any;

async function getOrCreateEngine(): Promise<Engine> {
  if (globalAny.__cortex_engine) return globalAny.__cortex_engine as Engine;

  const loaded = await loadState();
  const state = loaded ?? makeInitialState();

  const engine: Engine = {
    state,
    subscribers: new Set(),
    interval: null,
  };

  engine.interval = setInterval(() => {
    tick(engine.state);

    // Notify subscribers
    for (const sub of engine.subscribers) {
      try {
        sub(engine.state);
      } catch {
        // ignore sub errors
      }
    }

    // Persist
    if (engine.state.tick % PERSIST_EVERY_N_TICKS === 0) {
      void saveState(engine.state);
    }
  }, TICK_MS);

  globalAny.__cortex_engine = engine;
  return engine;
}

export async function getState(): Promise<CortexState> {
  const engine = await getOrCreateEngine();
  return engine.state;
}

export async function subscribe(fn: (state: CortexState) => void): Promise<() => void> {
  const engine = await getOrCreateEngine();
  engine.subscribers.add(fn);
  // Fire initial state immediately
  fn(engine.state);
  return () => engine.subscribers.delete(fn);
}

export async function injectExternalTask(
  task: string,
  targets: Partial<Record<RegionId, number>>,
  durationTicks?: number
): Promise<CortexState> {
  const engine = await getOrCreateEngine();
  injectTask(engine.state, task, targets, durationTicks);
  return engine.state;
}
