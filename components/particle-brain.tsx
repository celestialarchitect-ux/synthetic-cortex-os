"use client";

/**
 * ParticleBrain — canvas2D continuous particle system bound to the cortex engine.
 *
 * Particles default to white, drift via curl-noise-like flow field.
 * Regions emerge as colored density zones where activation pulls particles in.
 * Pathway flows spawn bright signal pulses that travel source → target.
 * Subclusters render as persistent bright nodes near their parent region.
 *
 * Engine state arrives via SSE at 4 Hz; particles render at 60 fps with smooth
 * interpolation between engine ticks.
 */

import React, { useEffect, useRef } from "react";

// Same region order/colors/IDs as lib/cortex-engine.ts and app/page.tsx
const REGIONS: Array<{
  id: string;
  color: [number, number, number];
  // Position in a unit square (0..1); rendered scaled to canvas
  x: number;
  y: number;
}> = [
  { id: "intake",       color: [0x22, 0xd3, 0xee], x: 0.15, y: 0.40 },
  { id: "executive",    color: [0xfa, 0xcc, 0x15], x: 0.50, y: 0.18 },
  { id: "systems",      color: [0x60, 0xa5, 0xfa], x: 0.85, y: 0.40 },
  { id: "monetization", color: [0x10, 0xb9, 0x81], x: 0.90, y: 0.70 },
  { id: "language",     color: [0xa8, 0x55, 0xf7], x: 0.60, y: 0.85 },
  { id: "memory",       color: [0xe2, 0xe8, 0xf0], x: 0.20, y: 0.75 },
  { id: "diagnostic",   color: [0xf8, 0x71, 0x71], x: 0.08, y: 0.60 },
  { id: "creative",     color: [0xec, 0x48, 0x99], x: 0.68, y: 0.55 },
  { id: "governance",   color: [0xff, 0xff, 0xff], x: 0.38, y: 0.45 },
  { id: "execution",    color: [0xfb, 0x92, 0x3c], x: 0.52, y: 0.70 },
];

// Same pathway indices as engine
const PATHWAYS: Array<[string, string]> = [
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

interface StreamState {
  tick: number;
  activations: Record<string, number>;
  memory_weights: Record<string, number>;
  pathways: Array<{ strength: number; flow: number }>;
  active_paths: number[];
  subclusters: Array<{ parent: string; name: string; strength: number }>;
  load: number;
  task: string | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Current color tint (particles start white and blend toward the nearest active region color)
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
  life: number;    // remaining ticks of life
  maxLife: number; // starting life
}

interface Signal {
  pathIndex: number;
  progress: number; // 0..1 along path
  speed: number;
  alpha: number;
}

const PARTICLE_COUNT = 6000;

export function ParticleBrain({ height = 480 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<StreamState | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const signalsRef = useRef<Signal[]>([]);
  const spawnRef = useRef<((W: number, H: number, initial?: boolean) => Particle) | null>(null);

  // ─── Subscribe to engine stream ────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/cortex/stream");
    es.onmessage = (ev) => {
      try {
        stateRef.current = JSON.parse(ev.data) as StreamState;
      } catch {
        /* ignore */
      }
    };
    // If stream fails, fall back to polling /api/cortex/state
    es.onerror = () => {
      es.close();
      let active = true;
      const poll = async () => {
        while (active) {
          try {
            const r = await fetch("/api/cortex/state", { cache: "no-store" });
            if (r.ok) stateRef.current = (await r.json()) as StreamState;
          } catch {
            /* ignore */
          }
          await new Promise((res) => setTimeout(res, 500));
        }
      };
      void poll();
      return () => {
        active = false;
      };
    };
    return () => es.close();
  }, []);

  // ─── Render loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Size handling: match canvas internal size to CSS size * DPR
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Seed particles across canvas
    const rect0 = canvas.getBoundingClientRect();
    const spawnParticle = (W: number, H: number, initial = false): Particle => {
      // Spawn from a random edge with inward velocity (unless initial seed — scatter everywhere)
      if (initial) {
        return {
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          r: 255, g: 255, b: 255, a: 0.6,
          size: 0.9 + Math.random() * 1.1,
          life: 240 + Math.floor(Math.random() * 360),
          maxLife: 240 + Math.floor(Math.random() * 360),
        };
      }
      const edge = Math.floor(Math.random() * 4);
      let x = 0, y = 0, vx = 0, vy = 0;
      const speed = 0.4 + Math.random() * 0.8;
      if (edge === 0) { x = Math.random() * W; y = -10;    vx = (Math.random() - 0.5) * 0.6; vy = speed; }
      if (edge === 1) { x = W + 10;           y = Math.random() * H; vx = -speed; vy = (Math.random() - 0.5) * 0.6; }
      if (edge === 2) { x = Math.random() * W; y = H + 10; vx = (Math.random() - 0.5) * 0.6; vy = -speed; }
      if (edge === 3) { x = -10;              y = Math.random() * H; vx = speed;  vy = (Math.random() - 0.5) * 0.6; }
      const life = 300 + Math.floor(Math.random() * 420); // ~5-12 seconds at 60fps
      return { x, y, vx, vy, r: 255, g: 255, b: 255, a: 0.6, size: 0.9 + Math.random() * 1.1, life, maxLife: life };
    };

    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () =>
      spawnParticle(rect0.width, rect0.height, true)
    );
    // Make spawnParticle accessible inside step() by stashing on ref
    spawnRef.current = spawnParticle;

    let lastTick = -1;
    let rafId = 0;

    const step = () => {
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const state = stateRef.current;

      // Clear with heavier persistence — trails build up into visible density
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(2, 3, 10, 0.14)";
      ctx.fillRect(0, 0, W, H);

      // Build region anchor points in canvas coords
      const regionAnchors = REGIONS.map((reg) => {
        const act = state?.activations[reg.id] ?? 0.15;
        const mem = state?.memory_weights[reg.id] ?? 0;
        return {
          ...reg,
          cx: reg.x * W,
          cy: reg.y * H,
          act,
          mem,
          // Attractor radius — smaller so clusters are TIGHT rather than filling canvas
          pullRadius: 50 + act * 80 + mem * 35,
          pullStrength: 0.018 + act * 0.08,
        };
      });

      // Region glow auras — TIGHT, low-intensity. Just a whisper of pigment at
      // the region center to tint the particle field, not a neon halo.
      ctx.globalCompositeOperation = "lighter";
      for (const a of regionAnchors) {
        const vis = a.act * 0.6 + a.mem * 0.25;
        if (vis < 0.18) continue;
        const glowRadius = 22 + a.act * 38 + a.mem * 16;
        const grad = ctx.createRadialGradient(a.cx, a.cy, 0, a.cx, a.cy, glowRadius);
        const [rr, gg, bb] = a.color;
        grad.addColorStop(0, `rgba(${rr},${gg},${bb},${Math.min(0.10, vis * 0.12).toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(${rr},${gg},${bb},${Math.min(0.03, vis * 0.04).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(a.cx, a.cy, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Spawn new signals for active pathways on fresh engine tick
      if (state && state.tick !== lastTick) {
        lastTick = state.tick;
        for (const i of state.active_paths) {
          // Probabilistic spawn based on flow intensity (avoid flooding)
          const flow = state.pathways[i]?.flow ?? 0;
          if (Math.random() < flow * 0.6) {
            signalsRef.current.push({
              pathIndex: i,
              progress: 0,
              speed: 0.01 + flow * 0.02,
              alpha: 0.9,
            });
          }
        }
      }

      // Update + render particles (already in "lighter" blend mode)
      const particles = particlesRef.current;
      for (let idx = 0; idx < particles.length; idx++) {
        const p = particles[idx];

        // Flow field: ambient curl-ish wander (stronger so particles visibly drift)
        const t = performance.now() * 0.00035;
        const nx = Math.sin(p.y * 0.012 + t) * 0.22;
        const ny = Math.cos(p.x * 0.012 + t * 1.1) * 0.22;
        p.vx += nx;
        p.vy += ny;

        // Attractor pulls — orbital, not capture.
        // Force drops to zero inside an inner radius so particles orbit through instead of collapsing.
        let bestColor: [number, number, number] = [255, 255, 255];
        let bestWeight = 0;
        for (const a of regionAnchors) {
          const dx = a.cx - p.x;
          const dy = a.cy - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d >= a.pullRadius || d < 1) continue;
          const innerR = 14 + a.act * 6;                   // no-pull core radius
          if (d < innerR) continue;                        // inside the core — drift freely (orbital)
          // Normalized force — strongest at mid-radius, fades toward inner and outer boundaries
          const normalized = (d - innerR) / (a.pullRadius - innerR);
          const windowed = Math.sin(normalized * Math.PI); // smooth bump at midrange
          const f = (a.pullStrength * 0.55) * windowed / Math.max(d, 20);
          p.vx += dx * f;
          p.vy += dy * f;
          // Tangential component — creates orbital motion, keeps things circulating
          const tangent = a.pullStrength * 0.28 * windowed;
          p.vx += -dy * tangent / Math.max(d, 20);
          p.vy += dx * tangent / Math.max(d, 20);
          // Color weighting
          const w = windowed * (0.3 + a.act);
          if (w > bestWeight) {
            bestWeight = w;
            bestColor = a.color;
          }
        }

        // Much lighter damping — particles keep momentum, swarm doesn't grind to halt
        p.vx *= 0.992;
        p.vy *= 0.992;
        // Soft velocity cap so they don't fling
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (sp > 2.4) { p.vx *= 2.4 / sp; p.vy *= 2.4 / sp; }

        p.x += p.vx;
        p.y += p.vy;

        // Lifespan — decrement, respawn when expired or drifted off-canvas
        p.life -= 1;
        const offCanvas = p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30;
        if (p.life <= 0 || offCanvas) {
          if (spawnRef.current) {
            particles[idx] = spawnRef.current(W, H, false);
          }
          continue;
        }

        // Blend color toward current attractor influence
        const blend = Math.min(0.1, bestWeight * 0.18);
        p.r += (bestColor[0] - p.r) * blend;
        p.g += (bestColor[1] - p.g) * blend;
        p.b += (bestColor[2] - p.b) * blend;
        // Fade back to white when not attracted
        if (bestWeight < 0.05) {
          p.r += (230 - p.r) * 0.015;
          p.g += (230 - p.g) * 0.015;
          p.b += (230 - p.b) * 0.015;
        }

        // Life-based alpha — fade in + fade out at edges of life for smooth recycling
        const lifeFrac = p.life / p.maxLife;
        const lifeFade = Math.min(1, lifeFrac * 5, (1 - lifeFrac) * 5 + 0.4);

        const alpha = Math.min(0.95, (0.45 + bestWeight * 0.55 + (state ? state.load * 0.12 : 0)) * lifeFade);
        const size = p.size + bestWeight * 1.6;

        ctx.fillStyle = `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${alpha.toFixed(3)})`;
        ctx.fillRect(p.x - size, p.y - size, size * 2, size * 2);
      }

      // Render signals along pathways
      ctx.globalCompositeOperation = "lighter";
      const surviving: Signal[] = [];
      for (const sig of signalsRef.current) {
        sig.progress += sig.speed;
        if (sig.progress >= 1 || sig.alpha < 0.02) continue;
        const [srcId, dstId] = PATHWAYS[sig.pathIndex];
        const src = regionAnchors.find((r) => r.id === srcId);
        const dst = regionAnchors.find((r) => r.id === dstId);
        if (!src || !dst) continue;
        const x = src.cx + (dst.cx - src.cx) * sig.progress;
        const y = src.cy + (dst.cy - src.cy) * sig.progress;

        // Draw head
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 8);
        grad.addColorStop(0, `rgba(255,255,255,${sig.alpha})`);
        grad.addColorStop(1, `rgba(255,255,255,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();

        sig.alpha *= 0.995;
        surviving.push(sig);
      }
      signalsRef.current = surviving.slice(-200);

      // Render subcluster nodes as small persistent bright points
      if (state?.subclusters) {
        for (const sc of state.subclusters) {
          const a = regionAnchors.find((r) => r.id === sc.parent);
          if (!a) continue;
          // Scatter subclusters near parent (deterministic by name hash)
          const h = hash(sc.name);
          const ox = Math.cos(h * 7) * 30;
          const oy = Math.sin(h * 7) * 30;
          const alpha = 0.4 + sc.strength * 0.5;
          ctx.fillStyle = `rgba(${a.color[0]},${a.color[1]},${a.color[2]},${alpha})`;
          ctx.beginPath();
          ctx.arc(a.cx + ox, a.cy + oy, 2 + sc.strength * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = "source-over";

      // HUD: tick counter + load bar (tiny, bottom-left)
      if (state) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
        ctx.font = "10px ui-monospace, SF Mono, monospace";
        ctx.fillText(`tick ${state.tick} · load ${state.load.toFixed(2)} · ${signalsRef.current.length} sig`, 10, H - 10);
      }

      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: `${height}px`, display: "block", background: "#02030a" }}
    />
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) / 2_147_483_647;
}
