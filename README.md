# Synthetic Cortex OS

A live observatory UI for a Persistent Cognitive Brain Architecture.

## Running

```bash
npm install
npm run dev   # → http://localhost:7070
```

## How Telemetry Works

The UI polls `/api/cortex/state` every 3 seconds. If the file
`/Users/oracle/.claude/cortex-state.json` exists, activations are merged
into the live brain display.

To update the live brain state from any Claude Code session:

```bash
curl -X POST http://localhost:7070/api/cortex/state \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-04-18T00:00:00Z",
    "scenario": "launch",
    "task": "Deploying Phantom Engine v2",
    "activations": {
      "intake": 0.92,
      "executive": 0.97,
      "systems": 0.78,
      "monetization": 0.88,
      "language": 0.85,
      "memory": 0.71,
      "diagnostic": 0.45,
      "creative": 0.66,
      "governance": 0.52,
      "execution": 0.91
    },
    "activePaths": [0, 4, 5, 7, 13],
    "memory": ["Live task event injected from Claude Code"]
  }'
```

## The 10 Regions

| Region | ID | Color | Role |
|---|---|---|---|
| Intake | `intake` | Cyan | Signal ingestion & context parsing |
| Executive | `executive` | Gold | Decision-making & goal orchestration |
| Systems | `systems` | Blue | Infrastructure & compute management |
| Monetization | `monetization` | Emerald | Revenue logic & payment flows |
| Language | `language` | Violet | NLP, generation & comprehension |
| Memory | `memory` | Silver | Persistent knowledge & recall |
| Diagnostic | `diagnostic` | Red | Error detection & self-repair |
| Creative | `creative` | Pink | Novel synthesis & ideation |
| Governance | `governance` | White | Ethics, safety & constraint enforcement |
| Execution | `execution` | Orange | Action dispatch & tool invocation |
