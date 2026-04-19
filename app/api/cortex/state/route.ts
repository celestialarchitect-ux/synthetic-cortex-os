import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

const LOCAL_PATH = "/Users/oracle/.claude/cortex-state.json";
const TMP_PATH = path.join(os.tmpdir(), "cortex-state.json");

function statePath(): string {
  return process.env.RAILWAY_ENVIRONMENT ? TMP_PATH : LOCAL_PATH;
}

const DEFAULT_STATE = {
  timestamp: new Date().toISOString(),
  task: "Idle — no active session",
  scenario: "idle",
  activations: {
    intake: 0.2,
    executive: 0.3,
    systems: 0.15,
    monetization: 0.1,
    language: 0.15,
    memory: 0.25,
    diagnostic: 0.1,
    creative: 0.1,
    governance: 0.3,
    execution: 0.15,
  },
  activePaths: [0, 10],
  memory: [],
};

export async function GET() {
  try {
    const raw = await fs.readFile(statePath(), "utf-8");
    const data: unknown = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    // File doesn't exist — return live idle state
    return NextResponse.json({ ...DEFAULT_STATE, timestamp: new Date().toISOString() });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const file = statePath();
    const dir = path.dirname(file);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(body, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
