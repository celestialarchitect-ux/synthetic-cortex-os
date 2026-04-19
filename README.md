# Synthetic Cortex OS

Live observatory for a **Persistent Cognitive Brain Architecture** — 10 cortex regions,
weighted neural pathways, curl-noise particle swarms, procedural lightning, governed autonomy.

**Live:** https://cortex-os-production.up.railway.app

## Stack
- Next.js 15 · React 19 · TypeScript strict
- React Three Fiber · Three.js r184 · `postprocessing` (raw lib, no r3f wrapper)
- Tailwind v3 · shadcn/ui · framer-motion · lucide
- Deployed on Railway · auto-deploy from `main`

## Run locally
```bash
npm install
cp .env.example .env.local        # optional — set CORTEX_WEBHOOK_SECRET for POST auth
npm run dev                       # → http://localhost:7070
```

## Scripts
- `npm run dev` — dev server on port 7070
- `npm run build` — production build
- `npm run start` — production server (respects `$PORT`)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `next lint`
- `npm run check` — typecheck + lint + build (CI-equivalent)

## Telemetry bridge
The observatory reads live activation state from `GET /api/cortex/state`.
Any session can update the brain by POSTing to the same endpoint:

```bash
curl -X POST https://cortex-os-production.up.railway.app/api/cortex/state \
  -H "Authorization: Bearer $CORTEX_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Building feature X",
    "scenario": "builder",
    "activations": {
      "intake": 0.8, "executive": 0.95, "systems": 0.9,
      "monetization": 0.2, "language": 0.6, "memory": 0.75,
      "diagnostic": 0.4, "creative": 0.7, "governance": 0.6, "execution": 0.85
    },
    "activePaths": [0, 1, 5, 12],
    "memory": ["lifted curl noise from three.js example", "bumped bloom threshold"]
  }'
```

Shape: all fields optional except activation values (0..1). `activePaths` indices
into the pathway table (see `pathwayDefs` in `app/page.tsx`). Body cap 16 KB.
Bearer auth required when `CORTEX_WEBHOOK_SECRET` is set.

## Environment variables
See `.env.example`. Key vars:
- `CORTEX_WEBHOOK_SECRET` — bearer token for POST auth. **Set this in prod.**
- `CORTEX_STATE_PATH` — override state file path
- `PORT` — respected by `npm run start` (Railway sets this)

## Deploy
Push to `main` → Railway auto-builds and deploys. No manual steps.

## Architecture
- `app/page.tsx` — dashboard shell: metrics, inspector, scenarios, tabs (Pathways / Memory / Timeline / Autonomy / Enterprise)
- `components/cortex-brain-3d.tsx` — R3F scene: curl-noise particle swarms, forked lightning, FakeGlow cores, raw postprocessing
- `components/error-boundary.tsx` — WebGL context-loss fallback
- `app/api/cortex/state/route.ts` — telemetry GET/POST with Zod validation
- `app/icon.tsx` — generated favicon
