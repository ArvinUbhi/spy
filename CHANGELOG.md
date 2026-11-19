# Changelog

## 0.8.0 — 2026-11-18

- Add Run Centre progress cards, evidence timelines with historical state reconstruction, correction delivery/activity/review tracking, captured file diffs and concurrent-edit warnings, a request/blocker/stall inbox and run comparisons.
- Add a local MCP registry, explicit stdio/Streamable HTTP connection controls, protocol negotiation, paginated tool discovery, schema inspection, manual tool calls, results/error/duration receipts and archived console activity. Keep manual calls separate from agent runs.
- Connect MCP tool requests to saved workflow stages and coordinator prompts; show explicit or inferred MCP provenance on observed agent calls. Preserve runtime permission and configuration boundaries.
- Add Recovery Centre for archive health, disconnected runs, full exports and browser prompt draft recovery/editing. Add reading preferences, quick keyboard navigation and a searchable, resizable live inspector.
- Fix restored-version save-state reporting. Bound MCP response/catalog/call memory and omit saved credential values from the catalog. Exclude private MCP registries from ZIPs.


## 0.7.0 — 2026-11-18

- Rebuild Design as Workflow Studio: block/template palette, central canvas, tabbed inspector, focus/expanded editing, readable cards and an export workspace loaded on demand.
- Add agent/start/decision/finish blocks, IO/verification contracts, join rules and editable connections with success/failure conditions, requested payload/context and bounded feedback. Preserve these fields in JSON, Markdown and skill/plugin exports.
- Persist a design library with autosave, optimistic revision checks, undo/redo, named/periodic checkpoints, restore, duplicate and reversible archive. Explicit permanent removal is limited to archived designs. Keep 30 active / 50 stored designs and bounded checkpoint storage.
- Add actionable design checks, expected-vs-observed comparison, per-session runtime links, ambiguous-instance selection, live card/inspector activity and capture of an observed topology.
- Preview success/failure paths, incoming information, parallel joins and feedback limits without executing agents.
- Prepare stage corrections or a coordinator workflow update for explicit runtime delivery. Add correction templates, per-agent draft recovery, recent receipts, queued-prompt cancellation and retry-safe request IDs.
- Package shared runtime design modules and keep private design files out of distribution ZIPs.

## 0.6.0 — 2026-11-18

- Add a disk-backed segmented event archive, independent of the small live graph cache. Default retention is 30 days / 512 MB total / 128 MB per session; users can adjust this in History & storage.
- Double-click an agent for a full workspace with conversation, paired tool arguments/results, permission/input requests, raw activity and overview. Add search, failure filters, pagination, copy, Markdown/JSONL exports, pause/resume, keyboard access and related-agent navigation.
- Add a Needs attention panel for failed, blocked, waiting, stale and possibly looping agents.
- Archive captured streamed text, prompts and delivery receipts. Migrate available old snapshot content on upgrade without replaying any commands. Retain archive-only sessions after the live snapshot expires.
- Increase bridge payload capture to 64,000 characters per field / 192 KB per event and its delivery buffer to 2,048 events / 8 MB. Drain queued batches immediately after successful delivery.
- Recover incomplete final writes, deduplicate transport retries and show archive failures/retention boundaries. Keep browser history windows bounded while exports cover the full retained agent transcript.

## 0.5.0 — 2026-11-18

- Separate Live sessions, Design builder and Stats pages, with persistent navigation and larger typography/controls on desktop and phones.
- Preserve the last browser snapshot through visibility changes and SSE failures. Save bounded local history every two seconds and on graceful shutdown; restore offline sessions after restart. Expire sessions after seven days, replacing minute-scale idle/uninspected deletion.
- Retain 120 activity events per agent and show detail-window boundaries. Keep aggregate tool-call/failure and model-usage stats through detail trimming.
- Detect identical tool retries and repeating sequences of up to four tool calls automatically. Label these as possible loops, with evidence separate from explicit iteration reports.
- Reconcile agent state against the optional runtime task registry every five seconds. Close synchronous delegations when their tool returns, correlate lifecycle events that omit tool IDs, and show silent agents as unconfirmed after two minutes. Do not bury activity history under unchanged registry confirmations.
- Populate session titles from runtime metadata, title events, or the first observed user prompt.
- Send prompts to the coordinator or identified subagent tasks through the host SDK, with queued/sending/delivered/failed status, idempotent acknowledgements and no automatic prompt redelivery. Unsupported/offline/finished targets are disabled.
- Install the new control bridge module and require matching collector features on upgrades.

Validation: backend/integration tests, synthetic benchmark and memory soak, clean ZIP verification, and real Copilot CLI 1.0.114 with an isolated local model fixture. The 15 Chromium browser/resource tests passed in GitHub CI; local Chromium execution was blocked by the build environment's socket restrictions. Paid model delivery and enterprise policies require a signed-in host.
