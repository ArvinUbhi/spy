# Spy verification

The repository contains executable tests and reproducible benchmarks. These reports cover Spy, not Copilot model quality.

## Automated coverage

| Layer | Checks |
|---|---|
| Skills / context / states | Agent-scoped invocations, available catalogs, prompt/result capture, provenance, overlapping waits, denial/resume, stale connections and bounded payloads |
| Graph layout | Handoff order, parallel branches, feedback-loop stability, cyclic input, deterministic positions |
| Event projection | Parent/child correlation, model attribution, lifecycle timing, native shell output, deduplication, heartbeat expiry |
| Bounds and validation | Session/agent/tool/output caps, malformed IDs and metrics, prototype-safe instance IDs |
| Bridge | Reasoning exclusion, clipping, Unicode-aware batching, retry order, overflow reporting |
| Shared startup | Eight concurrent sessions start exactly one collector; reuse, foreign-service rejection and symlinked installation paths (including macOS /var aliases), verified collector upgrades |
| Resources / live projection | Collector CPU/RSS endpoint, bridge resource attribution, selected-session-only detail streaming |
| Installer | Repeat installation, companion module, safe removal, unrelated-file preservation |
| HTTP/SSE | Bridge headers, foreign/malformed origins, malformed JSON, streamed state |
| Release ZIP | Extracted build serves React without node_modules; extension installation succeeds |
| Browser | Empty startup/setup, live nodes and edges, agent inspector/model, parallel verification, feedback loop, mobile graph focus |

The local Node suite passed **40 tests** on Node 24/Linux. GitHub Actions runs it on Node 22 and 24 across Windows, macOS and Linux. The initial six-platform build/ZIP matrix passed; the expanded suite's authoritative status is the latest [Check Spy workflow](https://github.com/ArvinUbhi/spy/actions/workflows/checks.yml).

Browser tests run in Chromium on GitHub Actions. Do not treat their source alone as a pass: inspect the workflow's Browser job result. Local interactive browser checks covered rendering, clicking agents and graph focus.

## Reproduce

```sh
npm ci
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm run benchmark
npm run package
npm run verify:zip
```

`npm test` produces `reports/junit.xml`. Browser tests produce `reports/browser-junit.xml` and an HTML report; failures retain traces/screenshots. CI publishes per-platform test artifacts, browser reports, benchmark results and the ZIP. Benchmark regression gates fail the job when exceeded. The release workflow also checks tests, browser behavior, benchmarks and the extracted ZIP before attaching files.

See [measured benchmarks](BENCHMARKS.md) and [machine-readable results](benchmark.json). Timings are synthetic collector/transport/layout measurements. They exclude model inference, real Copilot delivery and browser paint. No live signed-in Copilot CLI was available during implementation, so that integration still needs a real-session acceptance check.

## Real CLI acceptance check

1. Extract the release ZIP; launch Spy and confirm its local page opens.
2. Start a new `copilot --experimental` session with Spy enabled.
3. Ask it to delegate a small task; confirm distinct nodes, reported models and live tool output.
4. Run two sessions concurrently and switch between them.
5. Stop a CLI process; confirm disconnected status after the heartbeat timeout.
6. Use explicit workflow metadata to exercise feedback edges. Confirm visual rearrangement is separate from runtime control.

An automated synthetic pass cannot replace this acceptance check against your installed CLI version.

## Spy 0.3 diagnostics

54 unit/integration tests cover timing overlap, bounded loops, usage attribution, design validation/drift, sequence gaps and the actual extension module against a synthetic SDK transport. Browser tests cover diagnostic tabs, critical-path highlighting and design import/export. A resource test reports Chromium processes, collector and five bridge processes in `reports/resources.json`; it is not real Copilot acceptance. `npm run doctor` checks prerequisites.

## Spy 0.4 retention and skill exports

Unit/integration and browser/resource tests cover byte-bounded queues, repeated alias IDs, history retention across idle periods, navigation and restart, SSE limits/teardown, hidden-tab retention, manual clear, skill definitions/assignments and both skill/plugin ZIP layouts. `npm run test:memory` exercises 58,752 synthetic events across 12 cleanup rounds and publishes `reports/memory-soak.json`. This tests retention regressions, not every possible leak or real signed-in Copilot execution.

Lifecycle checks exercise a live bridge across manual viewer shutdown/restart, refuse unrelated processes, and verify extracted-ZIP foreground PID ownership, replacement, stop and folder cleanup across the OS/Node matrix.

`npm run test:cli` uses the real Copilot host and bundled SDK with an isolated temporary Copilot home and a loopback model fixture. Set SPY_COPILOT_CLI to a Copilot executable or npm-loader.js. CI pins Copilot 1.0.113 and Node 22.14 on Windows/Linux; reports/cli-compatibility.json records the result. The fixture verifies startup, tool registration and live bridge events/heartbeat without a sign-in or API key; it does not establish enterprise policy or paid-model acceptance.
