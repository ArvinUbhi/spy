# Memory and live-data lifecycle

Spy retains current state, not a session archive. Limits below apply to application data, not total process RSS or browser memory. Garbage collection and allocators may keep freed memory reserved.

| Data | Retention / budget |
|---|---|
| Bridge delivery queue | At most 128 packets and 512,000 encoded bytes; batches at most 240,000 bytes. Overflow/oversized packets are dropped and reported. |
| Sessions | At most 40. Disconnected sessions expire after two minutes without contact. |
| Uninspected session details | Cleared after one minute without being viewed. Agent and running-tool summaries remain. |
| Idle session details | Cleared after two minutes without work, even while heartbeats continue. |
| Stale session details | Cleared on cleanup after heartbeat loss; unfinished work becomes unknown, not falsely running. |
| Per-agent detail | Latest 24 events and 24 tools; event text 1,200 characters, output/results 4,000 and arguments 2,000. Excess active calls are flagged. |
| Alias / deduplication maps | At most 320 aliases and 512 event IDs per session. IDs are validated before retention. |
| Serialized retained state | Reclamation targets 2 MiB per session and 16 MiB total; checked during ingestion and independent five-second maintenance. Small ingestion bursts and object overhead are additional. |
| Viewer streams | At most eight. Closed/error connections release caches and listeners. Equivalent projections share a serialized snapshot within each update. |
| Hidden browser tabs | Close the event stream and release live snapshots; reconnect when visible. |
| Design drafts | Explicit authoring data stays in page memory until reset or page close. Imports capped at 1 MB; exports at 2 MB. |

Cleanup does not depend on a browser being connected. **Clear details** releases the selected session's old payloads immediately without stopping Copilot. The viewer labels cleared, incomplete, stale and visibility-limited data. Cleared content is not recoverable from Spy; new live events resume normally.

`npm run test:memory` runs repeated synthetic churn and cleanup under forced garbage collection, verifies state budgets and checks settled heap growth. Unit/browser tests cover expiry, bounded aliases/queues, stream teardown and manual clearing. Passing these checks is evidence against tested retention regressions, not proof that every possible leak is absent.
