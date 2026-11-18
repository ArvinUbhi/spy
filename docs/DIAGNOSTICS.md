# Designing and diagnosing orchestration

Open **Orchestration diagnostics** below the live graph. Everything stays in bounded memory; refreshing loses designs, rates and topology-update counts. Spy does not instruct agents or change runtime permissions.

| View | Meaning and limits |
|---|---|
| Critical path | Longest observed chain of explicit forward control handoffs whose latest invocations do not overlap. Nested delegation and context edges are excluded to prevent double counting. In-flight paths are provisional; uninstrumented dependencies cannot be established. Cycles need feedback labels or iteration metadata. |
| Parallelism | Peak workers and overlap time from observed running-state intervals, excluding coordinator. Invocation bars include waiting; running/waiting totals are separate. Recent interval window is capped at 800; latest 30 runs per agent. Running means observed execution, not CPU activity. |
| Loop health | Feedback signals plus explicit iteration outcomes. Three consecutive failed outcomes with the same supplied fingerprint flag a possible stalled loop. No fingerprint means progress is unknown. Latest 30 iterations per loop, 30 loops per session. |
| Context checks | Latest 120 transfers. Large means at least 4,000 recorded bytes or truncated; duplicate means identical source, target and text. Missing verification keywords is a heuristic, not proof of missing acceptance criteria. Bytes are not model tokens. |
| Model usage | Live API-event input/output tokens, request count and duration, split by agent and model. Up to 20 model rows per agent. Coordinator/subagent rows may overlap; no billing total is calculated. Optional user-supplied rates give hypothetical units, not Copilot billing. Cached/incomplete token breakdowns are excluded from estimates. |
| Reliability | Sequence gaps, bridge attachment count, stale connections and topology updates observed by this page. Reloads cannot reconstruct events from before attachment or collector restart. |

## Report loop iterations

Use the `spy_observe` tool supplied by the installed extension. For each iteration send a start and an outcome. Use actual agent IDs. Example arguments:

```json
{"type":"viewer.iteration","agentId":"root","loopId":"verification","iteration":1,"outcome":"running"}
```

```json
{"type":"viewer.iteration","agentId":"root","loopId":"verification","iteration":1,"outcome":"failed","progressKey":"auth.concurrent-refresh.expected-one-request"}
```

A stable fingerprint identifies the same failed check. Change it when the actual failure changes. Outcomes are `running`, `passed`, `failed`, `cancelled`. These are labelled orchestrator-reported. They never assert model reasoning or semantic improvement.

## Design mode

1. Open **Design mode**. Start from the independent verification template, or add agents.
2. Select a design node to edit its name, exact runtime role and optional expected model. Drag nodes to arrange them. Connect source and target handles using delegation, handoff or feedback. Remove connections using their × controls.
3. Compare required stages, models and connections to the selected live session. Missing means *not yet observed*. Independent review and verification use distinct design nodes; the observer cannot verify the independence of hidden context or reasoning.
4. Export **JSON** for later import or **instructions** for an orchestrator to implement. Exports are specifications, not executable Copilot configuration. Applying a specification remains a separate workflow.

Designs support 80 agents and 200 connections; imports validate endpoints, IDs and sizes. There is no implicit save, database or local storage.

## Integration validation

Run `npm run doctor` (or `node scripts/doctor.mjs` from the extracted release). It checks Node, CLI presence, extension installation and collector identity without reading credentials or starting a model task. Then use a real signed-in Copilot session to verify delegation/model/tool events, skill invocation, a permission/input wait, reload and reconnect. A real authenticated acceptance run remains unverified in the build environment.

Automated tests run the actual bridge module with an SDK transport stub. Browser resource tests use five such bridges and eight workers each; Chromium process CPU/RSS and collector metrics are reported separately in `resources.json`. Stub transport excludes the actual Copilot SDK connection/authentication overhead. Summed RSS can count shared pages more than once. These synthetic resource results are not a guarantee for corporate laptops or actual Copilot sessions.
