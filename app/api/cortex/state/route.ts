import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Path resolution: env > tmp (prod) > local dev default
const LOCAL_DEV_DEFAULT = path.join(os.homedir(), ".claude", "cortex-state.json");
const TMP_PATH = path.join(os.tmpdir(), "cortex-state.json");

function statePath(): string {
  if (process.env.CORTEX_STATE_PATH) return process.env.CORTEX_STATE_PATH;
  if (process.env.RAILWAY_ENVIRONMENT) return TMP_PATH;
  return LOCAL_DEV_DEFAULT;
}

// ─── Schema for telemetry state ──────────────────────────────────────────────
const StateSchema = z.object({
  timestamp: z.string().optional(),
  task: z.string().max(500).optional(),
  scenario: z.string().max(64).optional(),
  mode: z.string().max(128).optional(),
  activations: z
    .object({
      intake: z.number().min(0).max(1),
      executive: z.number().min(0).max(1),
      systems: z.number().min(0).max(1),
      monetization: z.number().min(0).max(1),
      language: z.number().min(0).max(1),
      memory: z.number().min(0).max(1),
      diagnostic: z.number().min(0).max(1),
      creative: z.number().min(0).max(1),
      governance: z.number().min(0).max(1),
      execution: z.number().min(0).max(1),
    })
    .optional(),
  activePaths: z.array(z.number().int().min(0).max(13)).max(20).optional(),
  memory: z.array(z.string().max(500)).max(20).optional(),
});

const MAX_BODY_BYTES = 16 * 1024; // 16 KB

const DEFAULT_STATE = {
  timestamp: new Date().toISOString(),
  task: "Idle — no active session",
  scenario: "idle",
  activations: {
    intake: 0.2, executive: 0.3, systems: 0.15,
    monetization: 0.1, language: 0.15, memory: 0.25,
    diagnostic: 0.1, creative: 0.1, governance: 0.3, execution: 0.15,
  },
  activePaths: [0, 10],
  memory: [] as string[],
};

export async function GET() {
  try {
    const raw = await fs.readFile(statePath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const valid = StateSchema.safeParse(parsed);
    if (!valid.success) {
      return NextResponse.json({ ...DEFAULT_STATE, timestamp: new Date().toISOString() });
    }
    return NextResponse.json(valid.data);
  } catch {
    return NextResponse.json({ ...DEFAULT_STATE, timestamp: new Date().toISOString() });
  }
}

export async function POST(request: NextRequest) {
  // Auth: require bearer secret in prod (skipped in local dev if not set)
  const requiredSecret = process.env.CORTEX_WEBHOOK_SECRET;
  if (requiredSecret) {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== requiredSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Body size cap
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (rawText.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  // Parse + validate
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const valid = StateSchema.safeParse(parsed);
  if (!valid.success) {
    return NextResponse.json(
      { error: "schema validation failed", issues: valid.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  // Write (merge timestamp if missing)
  const toWrite = {
    ...valid.data,
    timestamp: valid.data.timestamp ?? new Date().toISOString(),
  };
  try {
    const file = statePath();
    const dir = path.dirname(file);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(toWrite, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
