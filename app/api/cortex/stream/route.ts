import { NextRequest } from "next/server";
import { subscribe, REGION_IDS, type CortexState } from "@/lib/cortex-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // ensure Node runtime (engine uses fs)

// Server-Sent Events stream — pushes engine state on every tick (4 Hz).
export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let lastSentTick = -1;

      const unsubscribe = await subscribe((state: CortexState) => {
        if (closed) return;
        // Throttle to 4 Hz (engine ticks at 4 Hz anyway; this guards against super-fast ticks)
        if (state.tick === lastSentTick) return;
        lastSentTick = state.tick;

        const payload = flatten(state);
        const msg = `data: ${JSON.stringify(payload)}\n\n`;
        try {
          controller.enqueue(encoder.encode(msg));
        } catch {
          closed = true;
        }
      });

      _req.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
        try { controller.close(); } catch { /* noop */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function flatten(state: CortexState) {
  const activations: Record<string, number> = {};
  const memoryWeights: Record<string, number> = {};
  for (const id of REGION_IDS) {
    activations[id] = round3(state.regions[id].activation);
    memoryWeights[id] = round3(state.regions[id].memory_weight);
  }
  const pathways = state.pathways.map((p) => ({
    strength: round3(p.strength),
    flow: round3(p.flow),
  }));
  const activePaths: number[] = [];
  for (let i = 0; i < pathways.length; i++) {
    if (pathways[i].flow > 0.2) activePaths.push(i);
  }
  return {
    tick: state.tick,
    timestamp: state.last_tick_time,
    task: state.active_task,
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
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
