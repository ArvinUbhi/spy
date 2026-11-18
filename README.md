# Spy

[![Tests](https://github.com/ArvinUbhi/spy/actions/workflows/checks.yml/badge.svg)](https://github.com/ArvinUbhi/spy/actions/workflows/checks.yml)

A live React graph for your **GitHub Copilot CLI** agents. See delegations, skills, context handoffs, models, tools, timings and running/waiting/blocked/idle states. Click agents to inspect their activity; drag nodes to arrange the view. Spy also reports its collector and bridge CPU/memory use.

## Install

**Requires:** Node.js **22.12+** and a signed-in **Copilot CLI** with extension support. **No `gh`, Git, database or npm install is needed for the release ZIP.**

1. [Download the latest release ZIP](https://github.com/ArvinUbhi/spy/releases/latest) and extract it.
2. Windows: double-click **`start.cmd`**. macOS/Linux: **`sh start.sh`**.
3. Start new sessions as usual with **`copilot --experimental`**.

Keep the command window open while using Spy. Startup stops the previous Spy collector on its port; all Copilot sessions share the new viewer. Open **http://127.0.0.1:4317** whenever you want the view. Try **Run demo** without a CLI session.

Spy keeps a bounded local history snapshot at `~/.copilot/spy/history.json`, including visible prompts, tool arguments and outputs. Sessions expire after seven days without bridge contact; byte limits may trim older details sooner. History survives tab changes, reconnects and collector restarts. Set `SPY_HISTORY_PATH` to choose a different file. Press **Ctrl+C**, close the command window, or run **`stop.cmd`** / **`sh stop.sh`** to stop it. Run the new launcher to update; reload existing Copilot extensions after upgrading. Existing sessions need the extension loaded once; they cannot be discovered retrospectively.

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
