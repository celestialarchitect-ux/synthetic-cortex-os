import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getState, injectExternalTask, REGION_IDS, type RegionId } from "@/lib/cortex-engine";

export const dynamic = "force-dynamic";

// ─── Schemas ────────────────────────────────────────────────────────────────

const ActivationSchema = z.object({
  intake:       z.number().min(0).max(1).optional(),
  executive:    z.number().min(0).max(1).optional(),
  systems:      z.number().min(0).max(1).optional(),
  monetization: z.number().min(0).max(1).optional(),
  language:     z.number().min(0).max(1).optional(),
  memory:       z.number().min(0).max(1).optional(),
  diagnostic:   z.number().min(0).max(1).optional(),
  creative:     z.number().min(0).max(1).optional(),
  governance:   z.number().min(0).max(1).optional(),
  execution:    z.number().min(0).max(1).optional(),
});

const TaskSchema = z.object({
  task: z.string().max(500),
  targets: ActivationSchema,
  duration_seconds: z.number().min(1).max(600).optional(),
});

const MAX_BODY_BYTES = 16 * 1024;

// ─── GET: return the engine's live state (flattened for the frontend) ──────

export async function GET() {
  const state = await getState();
  const activations: Record<string, number> = {};
  const memoryWeights: Record<string, number> = {};
  for (const id of REGION_IDS) {
    activations[id] = round3(state.regions[id].activation);
    memoryWeights[id] = round3(state.regions[id].memory_weight);
  }
  const pathways = state.pathways.map((p) => ({
    strength: round3(p.strength),
    flow: round3(p.flow),
    usage: p.usage_count,
  }));
  const activePaths: number[] = [];
  for (let i = 0; i < pathways.length; i++) {
    if (pathways[i].flow > 0.2) activePaths.push(i);
  }
  return NextResponse.json({
    timestamp: new Date(state.last_tick_time).toISOString(),
    tick: state.tick,
    uptime_seconds: Math.floor((Date.now() - state.started_at) / 1000),
    task: state.active_task ?? "Idle — baseline cognition running",
    scenario: state.active_task ? "active" : "idle",
    activations,
    memory_weights: memoryWeights,
    pathways,
    active_paths: activePaths,
    subclusters: state.subclusters.map((sc) => ({
      parent: sc.parent,
      name: sc.name,
      strength: round3(sc.strength),
    })),
    load: round3(state.load),
    consolidations: state.consolidations,
    structural_audits: state.structural_audits,
    memory_log: state.memory_log.slice(0, 8),
  });
}

// ─── POST: inject an external task (requires auth in prod) ──────────────────

export async function POST(request: NextRequest) {
  const requiredSecret = process.env.CORTEX_WEBHOOK_SECRET;
  if (requiredSecret) {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== requiredSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const valid = TaskSchema.safeParse(parsed);
  if (!valid.success) {
    return NextResponse.json(
      { error: "schema validation failed", issues: valid.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const durationTicks = valid.data.duration_seconds
    ? Math.floor(valid.data.duration_seconds * 4)
    : undefined;

  const targets: Partial<Record<RegionId, number>> = valid.data.targets;
  await injectExternalTask(valid.data.task, targets, durationTicks);
  return NextResponse.json({ ok: true, injected: valid.data.task });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
