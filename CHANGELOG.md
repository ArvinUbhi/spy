# Changelog

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
