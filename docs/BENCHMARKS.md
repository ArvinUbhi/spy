# Spy benchmark results

Measured: 2026-11-17T20:52:17.746Z

Environment: Node v24.22.1, linux/x64, AMD EPYC 9V74 80-Core Processor; 9 reported logical CPUs.

Synthetic collector and localhost HTTP-to-SSE overhead; excludes browser paint, actual Copilot delivery, model inference and workflow quality.

| Workload | Sessions / workers each | Events/s | Snapshot p95 | Graph layout p95 | Live payload | Retained heap | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Single active session | 1 / 8 | 119,530 | 1.578 ms | 0.029 ms | 0.21 MiB | 0.721 MiB | PASS |
| Ten concurrent sessions | 10 / 16 | 257,264 | 2.241 ms | 0.043 ms | 0.26 MiB | 3.52 MiB | PASS |
| Forty concurrent sessions | 40 / 12 | 306,513 | 0.825 ms | 0.04 ms | 0.14 MiB | 6.098 MiB | PASS |
| Skills and context handoffs | 10 / 16 | 307,757 | 1.569 ms | 0.018 ms | 0.45 MiB | 3.926 MiB | PASS |

Local HTTP ingestion → SSE delivery (20 sequential samples): p50 **100.183 ms**, p95 **181.165 ms**, p99 **181.165 ms**. Includes the collector's 100 ms coalescing interval.

Fresh idle production collector: **39.7 MiB RSS**, **8.8 MiB JS heap**, **1.48% CPU** averaged over five one-second samples after warmup. Excludes bridges, browser and Copilot.

The 40-session workload sends only the selected graph plus summaries, reducing its serialized live payload by **97.294%** compared with streaming every graph.

Regression gates: ≥2,000 events/s per workload; snapshot serialization p95 <250 ms; selected-session graph layout p95 <25 ms; retained heap growth <256 MiB per workload; localhost delivery p95 <1,000 ms. Gates are intentionally generous for heterogeneous CI runners. Results vary by hardware; synthetic events do not establish live Copilot performance or model quality. Heap growth is measured after explicit GC when available and excludes the frontend/browser. Snapshot timings measure selected-session live projection and JSON serialization; byte measurement is outside the timer.

Overall: **PASS**. Run `npm run benchmark` to reproduce. Raw results: `reports/benchmark.json`. CI publishes reports and a job summary.
