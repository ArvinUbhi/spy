# Changelog

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
