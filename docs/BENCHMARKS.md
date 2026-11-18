# Spy benchmark results

Measured: 2026-11-18T07:53:56.333Z

Environment: Node v24.22.3, linux/x64, INTEL(R) XEON(R) PLATINUM 8573C; 9 reported logical CPUs.

Synthetic collector and localhost HTTP-to-SSE overhead; excludes browser paint, actual Copilot delivery, model inference and workflow quality.

| Workload | Sessions / workers each | Events/s | Snapshot p95 | Graph layout p95 | Diagnostics p95 | Live payload | Retained heap | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Single active session | 1 / 8 | 61,095 | 1.545 ms | 0.045 ms | 0.103 ms | 0.21 MiB | 0.876 MiB | PASS |
| Ten concurrent sessions | 10 / 16 | 131,524 | 7.073 ms | 0.082 ms | 0.361 ms | 0.26 MiB | 3.631 MiB | PASS |
| Forty concurrent sessions | 40 / 12 | 247,323 | 1.07 ms | 0.021 ms | 0.262 ms | 0.14 MiB | 6.532 MiB | PASS |
| Skills and context handoffs | 10 / 16 | 136,054 | 6.194 ms | 0.121 ms | 3.319 ms | 0.45 MiB | 4.04 MiB | PASS |

Local HTTP ingestion → SSE delivery (20 sequential samples): p50 **100.308 ms**, p95 **103.068 ms**, p99 **103.068 ms**. Includes the collector's 100 ms coalescing interval.

Fresh idle production collector: **39.8 MiB RSS**, **8.1 MiB JS heap**, **1% CPU** averaged over five one-second samples after warmup. Excludes bridges, browser and Copilot.

The 40-session workload sends only the selected graph plus summaries, reducing its serialized live payload by **97.28%** compared with streaming every graph.

Regression gates: ≥2,000 events/s per workload; snapshot serialization p95 <250 ms; selected-session graph layout p95 <25 ms; diagnostics p95 <50 ms; retained heap growth <256 MiB per workload; localhost delivery p95 <1,000 ms. Gates are intentionally generous for heterogeneous CI runners. Results vary by hardware; synthetic events do not establish live Copilot performance or model quality. Heap growth is measured after explicit GC when available and excludes the frontend/browser. Snapshot timings measure selected-session live projection and JSON serialization; byte measurement is outside the timer.

Overall: **PASS**. Run `npm run benchmark` to reproduce. Raw results: `reports/benchmark.json`. CI publishes reports and a job summary.
