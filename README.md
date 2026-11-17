# Spy

[![Check Spy](https://github.com/ArvinUbhi/spy/actions/workflows/checks.yml/badge.svg)](https://github.com/ArvinUbhi/spy/actions/workflows/checks.yml)

[Download the latest ZIP](https://github.com/ArvinUbhi/spy/releases/latest) · [Tests and verification](docs/TESTING.md) · [Measured benchmarks](docs/BENCHMARKS.md)

A local, live React graph viewer for GitHub Copilot CLI sessions. Watch agents appear, delegate, run tools and finish. Click an agent to inspect its reported model, current task, streamed response, tool arguments/results and running time.

**Live view comes first.** No SQLite, database, session files, browser storage or cloud backend for Spy. Current state lives in RAM and disappears when the collector stops. Copilot CLI independently manages its own session persistence.

## Download a ZIP and run

Requires **Node.js 22.12 or newer** and an installed, signed-in Copilot CLI with experimental extension support.

1. Download `spy-v0.1.0.zip` from Releases and extract it fully.
2. **Windows:** double-click `start.cmd`. **macOS/Linux:** run `sh start.sh`.
3. Spy opens at `http://127.0.0.1:4317`. Keep the terminal open.
4. In your working repository, start a new session:

```sh
copilot --experimental
```

The launcher installs Spy's user extension at `~/.copilot/extensions/spy/extension.mjs`. New instrumented sessions appear automatically. If CLI extension controls block loading, enable Spy through your CLI's extension controls. Existing uninstrumented terminal sessions are not silently attached.

**Release ZIPs include the compiled React app.** No npm install, build step, Git or GitHub CLI is required to launch a release ZIP. The viewer works without internet; Copilot still needs its usual authentication/network access.

**GitHub → Code → Download ZIP also works.** A source ZIP does not include `dist`; the same launcher installs npm dependencies and builds the frontend on its first run. This first build requires npm access. Subsequent launches use the compiled app.

Click **Run demo** to try the graph without Copilot. Demo sessions and models are explicitly labelled; synthetic activity is never mixed into live sessions.

## Live canvas

- Multiple connected sessions, selectable from the sidebar.
- Agent nodes update on events; elapsed timers update twice per second.
- Animated delegation/handoff edges and explicit feedback loops.
- **Focus graph** expands the workbench to fill the window.
- Click nodes for activity, outputs, tool arguments/results and reported models.
- Drag nodes to arrange them; dragging disables auto-follow. Follow, Arrange, Fit and zoom controls are available.
- Configurable slow-tool threshold and current execution strip.
- Heartbeat loss is displayed as disconnected, rather than claiming an agent is still live.
- Reconnecting browsers receive the collector's current in-memory snapshot.

Collector updates are coalesced at up to 10 snapshots/second. Actual latency depends on CLI streaming and transport. Completed nodes and bounded activity tails remain in RAM for current-session context, without being saved as history.

## Current limitations

The bridge uses the documented `joinSession()` extension API. The published SDK TypeScript declarations were inspected during implementation. This API is experimental and depends on your installed CLI version.

**Tested with synthetic events, automated HTTP/reducer tests and browser interaction. A signed-in Copilot CLI was unavailable here, so real CLI end-to-end validation remains outstanding.** Validate delegation/model attribution with your installed version. Missing models are shown as unreported; uncertain parents are dashed and labelled.

The execution tree uses spawning tool-call IDs, available agent-instance IDs and explicit parent metadata. Envelope `parentId` is chronological ordering and is never used as hierarchy. The subagent payload's `parentId` has different semantics and can identify a spawning task.

Native delegation events provide the execution tree. Semantic handoffs, workflow loops and structural changes require explicit orchestration metadata. Spy does not invent those connections from repeated text. The demo supplies metadata to demonstrate them.

Dragging rearranges the display. This first version does not rewrite agent organisations, switch a running model, cancel agents or autonomously optimise workflows.

## Developer commands

```sh
npm ci
npm start
npm test
npm run benchmark
npm run build
npm run package
```

`npm start` runs the local development app without installing extensions. `node scripts/launch.mjs` performs end-user setup and opens the production app. `npm run connect` installs/updates the Spy bridge; `npm run disconnect` removes it. After source changes, rebuild before using the production launcher.

`npm run package` produces `release/spy-v0.1.0.zip` with the built frontend, startup scripts, source, lockfile, tests and docs. It excludes dependencies, Git metadata and release archives.

### Ports and corporate proxies

The collector binds only to `127.0.0.1`. Override its port with `node scripts/launch.mjs --port 4320`. The CLI must inherit `SPY_URL=http://127.0.0.1:4320` before launch (PowerShell: `$env:SPY_URL='http://127.0.0.1:4320'`).

Outside the managed preview environment, exact host/origin checks block foreign-browser requests. Ingestion requires a custom bridge header. Spy is designed for localhost, not public or LAN deployment. Project code/output received by the bridge stays in the local app. No external fonts or UI services are used.

Source builds inherit your normal npm/proxy/corporate CA settings. Spy does not disable TLS checks or change proxy settings. Built release ZIPs avoid npm access when launching.

## Orchestration metadata

An orchestrator can POST events to `/api/events` with `Content-Type: application/json` and `X-Agent-Viewer: 1`:

```json
{
  "sessionId": "your-session-id",
  "event": {
    "id": "a-unique-event-id",
    "type": "viewer.edge",
    "data": {
      "source": "reviewer-instance-id",
      "target": "implementer-instance-id",
      "kind": "feedback",
      "label": "verification failed: rework"
    }
  }
}
```

Use actual agent identifiers and unique event IDs to deduplicate retries. `viewer.structure_change` with `data.message` adds a visible change notice. The bridge automatically forwards native session events. Batches accept up to 100 events/512 KB.

Memory caps: 40 sessions, 160 agents/session, 60 activity entries/agent and 120 retained tools/agent (additional active calls are omitted with a visibility-cap message). Disconnected sessions expire after ten minutes without heartbeats. Collector restart clears everything; heartbeats reconnect sessions, but preceding events cannot be reconstructed. No historical session scanning occurs. Bridge queues are bounded; a fresh CLI session gives the clearest graph after dropped/missed events.

## GitHub distribution

The included CI checks Node 22/24 on Windows, macOS and Linux. The initial matrix passed. The latest expanded suite status, JUnit results, browser reports and benchmark artifacts are published by Actions; see the badge and testing guide above.

Pushing a version tag (`v0.1.0`) triggers `.github/workflows/release.yml`: test, build, package and attach the ZIP to a GitHub Release using the repository's Actions token. The check workflow also uploads a ZIP artifact. Release links become available after the workflow succeeds.

## Sources

- [Creating CLI extensions](https://docs.github.com/en/copilot/tutorials/create-an-extension)
- [Streaming session events](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/streaming-events)
- [Custom agents](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents)
