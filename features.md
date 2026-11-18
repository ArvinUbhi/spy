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

- Current state stays in bounded memory: no database or saved session history.
- Existing CLI sessions need the bridge loaded; earlier activity cannot be reconstructed.
- Unknown models/context stay unknown. Full context sharing and iteration outcomes require explicit metadata.
- Critical paths and diagnostics cover observed events; some checks are heuristics. Rate estimates are not Copilot billing.
- Designing or rearranging graphs does not change running agents or automatically improve orchestration.
- Automated integration tests use synthetic events; real signed-in Copilot CLI acceptance remains unverified.

[Setup](docs/SETUP.md) · [Diagnostics and design](docs/DIAGNOSTICS.md) · [Tests](docs/TESTING.md) · [Benchmarks](docs/BENCHMARKS.md)

## Memory cleanup and skill authoring (0.4)

- Byte-bounded delivery queues, independent cleanup, idle/uninspected payload expiry, stale-state handling and explicit clearing. Hidden tabs release live snapshots. See [memory limits](docs/MEMORY.md).
- Define reusable skills, assign required/recommended skills per agent, edit role/workflow instructions and preview generated SKILL.md files. Export installable skill folders or a standard marketplace plugin directory. See [skill authoring](docs/SKILL-AUTHORING.md).
