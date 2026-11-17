# Spy benchmark results

Measured: 2026-11-17T20:07:21.089Z

Environment: Node v24.22.1, linux/x64, AMD EPYC 9V74 80-Core Processor; 9 reported logical CPUs.

Synthetic collector and localhost HTTP-to-SSE overhead; excludes browser paint, actual Copilot delivery, model inference and workflow quality.

| Workload | Sessions / workers each | Events/s | Snapshot p95 | Graph layout p95 | Snapshot size | Retained heap | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Single active session | 1 / 8 | 123,730 | 1.12 ms | 0.032 ms | 0.21 MiB | 0.643 MiB | PASS |
| Ten concurrent sessions | 10 / 16 | 293,462 | 16.903 ms | 0.047 ms | 2.53 MiB | 5.742 MiB | PASS |
| Forty concurrent sessions | 40 / 12 | 378,122 | 30.887 ms | 0.104 ms | 5.01 MiB | 11.016 MiB | PASS |

Local HTTP ingestion → SSE delivery (20 sequential samples): p50 **100.463 ms**, p95 **106.034 ms**, p99 **106.034 ms**. Includes the collector's 100 ms coalescing interval.

Regression gates: ≥2,000 events/s per workload; snapshot serialization p95 <250 ms; selected-session graph layout p95 <25 ms; retained heap growth <256 MiB per workload; localhost delivery p95 <1,000 ms. Gates are intentionally generous for heterogeneous CI runners. Results vary by hardware; synthetic events do not establish live Copilot performance or model quality. Heap growth is measured after explicit GC when available and excludes the frontend/browser. Snapshot timings include projection and JSON serialization; byte measurement is outside the timer.

Overall: **PASS**. Run `npm run benchmark` to reproduce. Raw results: `reports/benchmark.json`. CI publishes reports and a job summary.
