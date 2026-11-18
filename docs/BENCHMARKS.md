# Spy benchmark results

Measured: 2026-11-18T08:27:14.169Z

Environment: Node v24.22.3, linux/x64, INTEL(R) XEON(R) PLATINUM 8573C; 9 reported logical CPUs.

Synthetic collector and localhost HTTP-to-SSE overhead; excludes browser paint, actual Copilot delivery, model inference and workflow quality.

| Workload | Sessions / workers each | Events/s | Snapshot p95 | Graph layout p95 | Diagnostics p95 | Live payload | Retained heap | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Single active session | 1 / 8 | 58,647 | 1.004 ms | 0.041 ms | 0.192 ms | 0.05 MiB | 0.565 MiB | PASS |
| Ten concurrent sessions | 10 / 16 | 38,469 | 0.71 ms | 0.055 ms | 0.439 ms | 0.11 MiB | 1.609 MiB | PASS |
| Forty concurrent sessions | 40 / 12 | 55,059 | 0.859 ms | 0.114 ms | 0.353 ms | 0.09 MiB | 4.627 MiB | PASS |
| Skills and context handoffs | 10 / 16 | 37,080 | 2.037 ms | 0.027 ms | 1.965 ms | 0.30 MiB | 2.08 MiB | PASS |

Local HTTP ingestion → SSE delivery (20 sequential samples): p50 **100.128 ms**, p95 **107.367 ms**, p99 **107.367 ms**. Includes the collector's 100 ms coalescing interval.

Fresh idle production collector: **39.6 MiB RSS**, **8.1 MiB JS heap**, **0.64% CPU** averaged over five one-second samples after warmup. Excludes bridges, browser and Copilot.

The 40-session workload sends only the selected graph plus summaries, reducing its serialized live payload by **97.148%** compared with streaming every graph.

Regression gates: ≥2,000 events/s per workload; snapshot serialization p95 <250 ms; selected-session graph layout p95 <25 ms; diagnostics p95 <50 ms; retained heap growth <256 MiB per workload; localhost delivery p95 <1,000 ms. Gates are intentionally generous for heterogeneous CI runners. Results vary by hardware; synthetic events do not establish live Copilot performance or model quality. Heap growth is measured after explicit GC when available and excludes the frontend/browser. Snapshot timings measure selected-session live projection and JSON serialization; byte measurement is outside the timer.

Overall: **PASS**. Run `npm run benchmark` to reproduce. Raw results: `reports/benchmark.json`. CI publishes reports and a job summary.
