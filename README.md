# Spy

[![Tests](https://github.com/ArvinUbhi/spy/actions/workflows/checks.yml/badge.svg)](https://github.com/ArvinUbhi/spy/actions/workflows/checks.yml)

A live React graph for your **GitHub Copilot CLI** agents. See delegations, skills, context handoffs, models, tools, timings and running/waiting/blocked/idle states. Click agents to inspect their activity; drag nodes to arrange the view. Spy also reports its collector and bridge CPU/memory use.

## Install

**Requires:** Node.js **22.12+** and a signed-in **Copilot CLI** with extension support. **No `gh`, Git, database or npm install is needed for the release ZIP.**

1. [Download the latest release ZIP](https://github.com/ArvinUbhi/spy/releases/latest) and extract it.
2. Windows: double-click **`start.cmd`**. macOS/Linux: **`sh start.sh`**.
3. Start new sessions as usual with **`copilot --experimental`**.

Keep the command window open while using Spy. Startup stops the previous Spy collector on its port; all Copilot sessions share the new viewer. Open **http://127.0.0.1:4317** whenever you want the view. Try **Run demo** without a CLI session.

Spy keeps a bounded local history snapshot at `~/.copilot/spy/history.json`, including visible prompts, tool arguments and outputs. The live snapshot expires after seven days; the separate event archive defaults to 30 days, 512 MB total and 128 MB per session, adjustable in History & storage. History survives tab changes, reconnects and collector restarts. Set `SPY_HISTORY_PATH` to choose a different file. Press **Ctrl+C**, close the command window, or run **`stop.cmd`** / **`sh stop.sh`** to stop it. Run the new launcher to update; reload existing Copilot extensions after upgrading. Existing sessions need the extension loaded once; they cannot be discovered retrospectively.

## More

[Exact setup and troubleshooting](docs/SETUP.md) · [Tests](docs/TESTING.md) · [Benchmarks](docs/BENCHMARKS.md) · [Architecture](docs/ARCHITECTURE.md)

Development: `npm ci`, `npm start`. Checks: `npm test`, `npm run benchmark`. Package: `npm run build`, `npm run package`, `npm run verify:zip`.

**Integration status:** CI also tests the real Copilot 1.0.113 host/SDK on Node 22.14 with an isolated offline local-model fixture. Real signed-in model and enterprise-policy validation is still required. Full-context sharing and custom feedback edges need explicit orchestration metadata; arranging the view does not rewrite a running workflow.

Orchestration diagnostics: critical-path highlighting, parallel timing, loop health, context checks, per-model usage and an import/export design canvas. [How it works](docs/DIAGNOSTICS.md).

[Memory cleanup and limits](docs/MEMORY.md) · [Graph-to-skill authoring and exports](docs/SKILL-AUTHORING.md)

## Control room (v0.5.0)

Use **Live sessions** to watch work and inspect agents. **Design builder** is a separate page for workflow authoring; **Stats** contains tool-call/failure counters, model usage, timing, parallelism and loop evidence. Text and controls are larger, including on phones.

Select an agent to **Send prompt**. The coordinator uses the host's `session.send` steering API; identified live/idle subagent tasks use `session.rpc.tasks.sendMessage`. The UI distinguishes queued, sending, delivered and failed requests. Unsupported older hosts, offline sessions and finished tasks are disabled. Delivered means accepted by the runtime, not that the model has acted on it. Prompts are never retried automatically after dispatch.

Spy polls the runtime's optional task registry and session metadata every five seconds to reconcile lifecycle state and names, alongside native events. Old hosts fall back to events and the first observed user prompt. After two minutes without agent activity, unconfirmed running state is shown as unknown; this does not claim the task stopped. Exact repeated tool arguments and short repeated tool sequences flag possible loops automatically; intentional polling can also trigger these alerts.

After upgrading, run the new startup script and **reload Spy in existing Copilot sessions** to activate task reconciliation and prompt delivery. Earlier missing history cannot be reconstructed.

## Agent workspace and event archive (v0.6.0)

**Double-click an agent** or choose **Open full agent workspace** in its inspector. Browse Conversation, Tool calls, Requests, All activity and Overview. Tool calls pair their arguments with returned results; Requests includes permissions, user input and elicitation. Search across the retained archive, filter failures, load older pages, copy messages, export readable Markdown or raw JSONL, follow live updates, or pause while reviewing older evidence. Esc closes the workspace and / focuses search. Related-agent buttons let you move through a delegation.

**Needs attention** surfaces failed tools/agents, waiting/blocked requests, stale state and possible loops. **History & storage** controls retention and disk budgets. Archives are kept beside the snapshot in `history.json.archive/`; segmented files preserve captured messages and requests when the in-memory graph trims details. Existing snapshot data is migrated on upgrade where available, with an incomplete-recovery label. Clearing live details does not delete the event archive.

The bridge now retains up to 64,000 characters per payload field (192 KB encoded event budget) and queues up to 2,048 events / 8 MB, draining follow-up batches immediately. Oversized payloads are visibly marked as truncated; offline queue overflow is reported. Private model reasoning, events before attachment and network payloads not exposed by Copilot remain unavailable. A transcript export covers all retained events for the selected agent, independently of the UI page/filter. Default 30-day/512 MB retention can be raised to 365 days / 4 GB; per-session budgets can reach 1 GB. Retention deletes oldest complete segments; an active export can briefly defer pruning.
