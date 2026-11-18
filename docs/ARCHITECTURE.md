# Spy architecture

Spy is a local observer with a React/React Flow canvas, a dependency-free production Node HTTP/SSE collector and a Copilot CLI session extension. It does not use SQLite or persist session history.

## Data path

The extension joins its current Copilot session using the experimental `joinSession()` API. It projects supported activity, usage, tool and lifecycle events into a bounded memory queue. Native skill invocation, catalog and permission/input events are included. Private/opaque reasoning is excluded; large visible outputs are clipped. It batches events to a verified localhost Spy collector without blocking Copilot on delivery.

User-level installation copies the collector and built React assets alongside the extension. The manual launcher owns the foreground collector directly. It stops the verified previous collector on its configured port and waits for that PID to exit before reinstalling the bridge. Updated bridges only connect to an existing viewer; they never create a background server. Foreign services are rejected by a protocol health check before telemetry is delivered. The stop scripts use the same health identity check; they do not enumerate or kill all Node/Copilot processes.

The collector correlates native subagent invocations with spawning tool calls and available instance/parent metadata. The envelope `parentId` is chronological ordering and is not an agent hierarchy. Unknown relationships are visibly marked. Native task-tool prompts/results form runtime-observed context-transfer records. Explicit `viewer.context_handoff` and `viewer.context_mode` events (or the `spy_observe` extension tool) record orchestrator-reported sharing metadata with visible provenance. Unknown context isolation remains unknown. Explicit `viewer.edge` events identify workflow feedback/handoff relationships that cannot be established from native delegation alone.

One browser subscription receives the selected graph plus lightweight summaries of the other sessions. Graph updates are coalesced at 100 ms; collector metrics use small separate one-second events. Bridges send a heartbeat/resource sample every five seconds. SSE reconnect sends the current projection. Failed or missed historical events cannot be recovered after collector restart.

## Memory limits

40 sessions, 160 agents/session, 60 activity entries/agent, 120 tools/agent, 400 explicit edges/session and 300 queued events/bridge. Additional active tools are omitted with a visibility-cap message; older completed tools/nodes are evicted first. Disconnected sessions expire after ten minutes. Context transfers retain at most 120 records/session with 6,000-character payloads. Agents retain 20 skill records with 2,000-character content excerpts; session catalogs retain 60 definitions each. These limits bound display state rather than constrain Copilot's actual work.

## Designing orchestration

The graph distinguishes observable execution relationships from explicitly supplied feedback metadata. Clicking nodes exposes reported models, current actions, tool output, wall time and model request time when provided. Tool durations can overlap, so they are not summed as wall time. Slow-tool thresholds surface bottlenecks for your orchestration work.

Node dragging rearranges the view; it does not modify agent instructions or a running workflow. Runtime organisation editing, model switching, cancellation and autonomous optimisation are not implemented in this observer release. Such control needs an explicit workflow contract, evaluation tasks and a runtime integration.

An orchestrator may POST this packet to `/api/events` with `Content-Type: application/json` and `X-Agent-Viewer: 1`:

```json
{
  "sessionId": "your-session-id",
  "event": {
    "id": "unique-event-id",
    "type": "viewer.edge",
    "data": {
      "source": "reviewer-instance",
      "target": "implementer-instance",
      "kind": "feedback",
      "label": "verification failed: rework"
    }
  }
}
```

`viewer.structure_change` with `data.message` adds a visible structural-change notice. Use actual agent IDs and unique event IDs. Native events normally arrive through the bridge. Batches accept at most 100 events/512 KB.

## Resource scope

Collector CPU/RSS measures that Node process; bridge samples measure each extension process. These include their own instrumentation overhead. Browser and Copilot CPU/RAM are excluded, so the UI does not claim to measure total machine consumption. See the published benchmarks for methodology and limits.

## Distribution

Release ZIPs contain compiled assets and require only Node.js at runtime. Source builds use Vite. CI checks unit/integration/startup tests on Node 22/24 and Windows/macOS/Linux, browser behavior in Chromium, benchmark gates and clean ZIP startup. Version-tag workflows attach the ZIP and reports to GitHub Releases.

## Development dependency note

The ZIP's production collector uses only Node built-ins; build tools are not loaded. Vite is a development dependency. The current upstream picomatch advisory GHSA-fc5q-39xc-vjpf has no patched release as of this build and appears in a full development audit through Vite's glob tooling. Spy does not accept user-supplied glob patterns or load that tooling in production. Packaging's fflate dependency was updated to its available fixed patch. Use the release ZIP for the minimal runtime; development audit status is distinct from production runtime coverage.

## Custom observation events

`spy_observe` accepts `viewer.context_handoff` (`source`, `target`, optional `payload`, `summary`, `mode`), `viewer.context_mode` (`agentId`, `mode`), `viewer.agent_state` (`agentId`, `state`, `reason`) and `viewer.structure_change` (`message`). These are observer annotations, not execution controls. The same packets can be posted to the local event endpoint. Mode is `shared`, `isolated` or `unknown`. State is `running`, `idle`, `waiting`, `blocked`, `completed`, `failed`, `cancelled` or `unknown`. Native tool/skill payloads have runtime provenance; annotations cannot promote themselves to runtime evidence.
