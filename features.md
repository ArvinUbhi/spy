# Spy features

Spy is a local React dashboard for observing and designing GitHub Copilot CLI orchestration.

| Feature | What it does |
|---|---|
| Live session graph | Switch between connected sessions and watch agent delegation, handoffs and explicit feedback loops update live. |
| Agent inspector | Click agents to inspect their model, task, output, tools, arguments, results and timings. |
| Agent states | Filter running, waiting, blocked, idle and inactive agents; distinguish configured definitions from observed invocations. |
| Skills | Show per-agent skill invocations, excerpts and available session skills. |
| Context transfers | Inspect recorded prompts, results and reported handoffs, with source/destination and evidence labels. |
| Timing and bottlenecks | Show elapsed time, slow tools, waiting totals, worker overlap and the observed critical path. |
| Loop health | Track reported iterations, outcomes and durations; flag repeated failure fingerprints. |
| Design mode | Arrange agents, roles, models and connections; import/export JSON or orchestration instructions. |
| Design comparison | Highlight unobserved stages, unexpected connections, model differences and ambiguous agent independence. |
| Context checks | Flag large, truncated, missing or repeated payloads and possible missing verification criteria. |
| Model usage | Break down reported tokens, API calls and request time by agent/model; optionally estimate using supplied rates. |
| Reliability | Flag stale connections, sequence gaps and observed topology updates. |
| Resource monitoring | Display collector and bridge CPU, memory and event rate. Browser resource measurements are published separately. |
| Simple startup | Run an extracted release ZIP with Node.js; no `gh`, Git or dependency installation. Sessions share one collector. |
| Validation | Automated unit, integration, browser and ZIP-startup tests, plus published performance/resource benchmarks. |

## Scope

- Bounded local history survives reconnects and restarts; seven-day expiry and byte caps apply.
- Existing CLI sessions need the bridge loaded; earlier activity cannot be reconstructed.
- Unknown models/context stay unknown. Full context sharing and iteration outcomes require explicit metadata.
- Critical paths and diagnostics cover observed events; some checks are heuristics. Rate estimates are not Copilot billing.
- Designing or rearranging graphs does not change running agents or automatically improve orchestration.
- Automated integration tests use synthetic events; real signed-in Copilot CLI acceptance remains unverified.

[Setup](docs/SETUP.md) · [Diagnostics and design](docs/DIAGNOSTICS.md) · [Tests](docs/TESTING.md) · [Benchmarks](docs/BENCHMARKS.md)

## Memory cleanup and skill authoring (0.4)

- Byte-bounded delivery queues, independent cleanup, seven-day session expiry, stale-state handling and explicit clearing. Hidden tabs close streams and preserve their last snapshot. See [memory limits](docs/MEMORY.md).
- Define reusable skills, assign required/recommended skills per agent, edit role/workflow instructions and preview generated SKILL.md files. Export installable skill folders or a standard marketplace plugin directory. See [skill authoring](docs/SKILL-AUTHORING.md).

## v0.4.1

- Fixed Windows JavaScript/CSS serving in extracted ZIPs.
- Missing assets return a clear 404 instead of HTML; startup replaces collectors lacking the fix.
- ZIP checks verify JavaScript contents and MIME types on Windows, macOS and Linux.

## v0.4.2

- Startup keeps the collector in the command window and stops the previous verified Spy PID on the selected port.
- `stop.cmd` / `sh stop.sh` stops a hidden legacy collector before updates; unrelated Node/Copilot processes are left running.
- Updated bridges reconnect to an open viewer without starting hidden collectors. Reload existing extensions after updating.

## v0.4.3

- Fixed Copilot 1.0.113 extension startup: supports Microsoft SDK v2 imports/tool definitions and older GitHub SDK hosts. No extra SDK installation.
- Real CLI compatibility tests verify extension startup, spy_observe registration and live heartbeat/events using an offline local model fixture. CI pins Node 22.14 and Copilot 1.0.113 on Windows/Linux.

## v0.6 agent workspaces

Double-click agents for searchable captured conversations, tool arguments/results, permission/input requests, paginated activity, copy and Markdown/JSONL export. Needs attention links to problematic agents. History & storage offers 30-day / 512 MB defaults, larger configurable budgets, archive-only sessions, snapshot migration and crash-tail recovery.
