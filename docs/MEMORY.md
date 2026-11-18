# Memory and live-data lifecycle

Spy retains bounded local session history, including visible prompts, arguments and outputs. Atomic snapshots are saved every two seconds and on graceful shutdown to `~/.copilot/spy/history.json` (override with `SPY_HISTORY_PATH`). Restored sessions stay offline until a live bridge reconnects. Limits below apply to application data, not total process RSS or browser memory. Garbage collection and allocators may keep freed memory reserved.

| Data | Retention / budget |
|---|---|
| Bridge delivery queue | At most 2,048 packets and 8 MiB encoded bytes; batches at most 480,000 bytes. Overflow/oversized packets are dropped and reported. |
| Sessions | At most 40. Sessions expire after seven days without bridge contact. |
| Uninspected session details | Retained when switching sessions; only explicit clearing or byte budgets remove payloads. |
| Idle session details | Retained while idle within byte budgets. |
| Stale session details | Retained after heartbeat loss and marked disconnected. Agent activity silent for two minutes is shown as unknown until confirmed. |
| Per-agent detail | Latest 120 events and 24 tools; event text 1,200 characters, output/results 4,000 and arguments 2,000. Excess active calls are flagged. |
| Alias / deduplication maps | At most 320 aliases and 512 event IDs per session. IDs are validated before retention. |
| Serialized retained state | Reclamation targets 2 MiB per session and 16 MiB total; checked during ingestion and independent five-second maintenance. Small ingestion bursts and object overhead are additional. |
| Viewer streams | At most eight. Closed/error connections release caches and listeners. Equivalent projections share a serialized snapshot within each update. |
| Hidden browser tabs | Close the event stream and keep the last received snapshot; reconnect when visible. |
| Design drafts | Explicit authoring data stays in page memory until reset or page close. Imports capped at 1 MB; exports at 2 MB. |

Native session shutdown also stops the bridge’s timers and subscriptions, clears its queue and exits the bridge process.

Cleanup does not depend on a browser being connected. **Clear details** releases the selected session's old payloads immediately without stopping Copilot. The viewer labels cleared, incomplete, stale and visibility-limited data. Cleared content is not recoverable from Spy; new live events resume normally.

`npm run test:memory` runs repeated synthetic churn and cleanup under forced garbage collection, verifies state budgets and checks settled heap growth. Unit/browser tests cover expiry, bounded aliases/queues, stream teardown and manual clearing. Passing these checks is evidence against tested retention regressions, not proof that every possible leak is absent.

The launcher owns the foreground collector directly; it does not detach a server process. Ctrl+C saves local history and closes the server; closing its command window terminates that process. Start/stop scripts identify a prior collector through loopback health and wait for its PID to exit. Updated bridges never auto-start hidden collectors.

Tool counters and token usage aggregates survive detail trimming. Automatic loop checks retain up to 60 SHA-256 argument fingerprints per agent (12 after budget trimming), without storing a second copy of arguments. Pending prompts are transient, bounded to 100 commands, expire after five minutes, and are never replayed from history. A dispatch without acknowledgement is reported as unconfirmed; check Copilot before resending.

## Durable event archive

The live projection's 120 events / 24 tools are a cache, not the transcript. Captured events are appended separately to `SPY_HISTORY_PATH + .archive/` (normally `~/.copilot/spy/history.json.archive/`). Segments rotate at approximately 1 MiB or 250 events. The manifest is atomically replaced; startup reconciles files and recovers torn final lines. Event IDs are deduplicated across retries. HTTP batches receive success only after their archive appends and manifest persist succeed. Power-loss durability depends on the operating system; disk failures surface in the UI and produce retryable HTTP 503 responses.

Defaults: 30 days, 512 MiB total and 128 MiB/session. History & storage supports up to 365 days, 4 GiB total and 1 GiB/session. Oldest complete segments are pruned first. Exports temporarily hold pruning to avoid incomplete downloads. Archive-only sessions remain browsable after the seven-day live snapshot expires. Browser pages load 50 events at a time and hold up to 500; older browsing pauses live refresh. Search scans bounded portions per page; continue loading older pages to search further. Exports stream the entire retained agent transcript independently of page/filter state.

Payload fields retain up to 64,000 characters within a 192,000-byte event-data budget. Larger values are explicitly marked truncated. Streaming deltas are archived and reconstructed into messages; final messages replace corresponding visible chunks. Private reasoning is excluded. Existing old snapshot content can be migrated, but data already lost before this upgrade cannot be recovered.
