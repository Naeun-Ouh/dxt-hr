# Local synthetic performance comparison

Build the target revision with the same local test environment as ordinary E2E, then run:

```sh
DXT_PERF_LABEL=before npx playwright test --config tests/performance/playwright.config.ts
# Rebuild the changed revision, keeping this harness identical.
DXT_PERF_LABEL=after npx playwright test --config tests/performance/playwright.config.ts
```

Uses the existing local Chrome option `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Requires Node22. Output defaults to `<os.tmpdir()>/dxt-performance-results/{label}.json`; set `DXT_PERF_OUTPUT` to override. Normal `npm run test:e2e` does not select this suite or activate its fixtures.

Each scenario captures its first observation separately and ten subsequent observations, reporting nearest-rank p50/p95. The first observation is **not** a hosted cold start: local mock migrations, Next startup and earlier scenarios may already warm shared resources. Route timing is full hard navigation to network idle (including Playwright's idle interval), not an isolated server render. Mutation timing starts after edit/navigation setup and includes action completion and network idle. Approval samples consume distinct synthetic half-day requests in the same deterministic sequence before/after.

The fixture creates 50 synthetic employee profiles with four months of claims (50 items/month); ordinary fixture records remain. It sets only the measurement mock's expense date to 2026-11-26, preserving editability of October. All records/emails are synthetic. `DXT_PERF_HARNESS=1` is set only on this config's local server processes. No production code, hosted service or real employee data is involved.

A gated local mock endpoint resets/reads aggregate counters, requiring `x-dxt-perf-control: synthetic-only`. Recorded categories are only Auth, membership, REST, RPC and Storage, with counts, aggregate elapsed milliseconds and error counts. No request body, SQL text, URL parameters, tokens, UUIDs or employee information is recorded. SQL totals count adapter `query()` calls, excluding transaction/RLS context setup and internal statements of stored procedures. HTTP timing includes in-process mock queueing. PGlite timings are **not** Supabase network/database latency. These results demonstrate comparative call patterns under one reproducible workload, not production SLA or load capacity.

For navigation scenarios compare request counts as well as p50/p95. Inspect JSON errors and the browser exit code before accepting a run. Absolute timings are noisy on a shared development machine; keep build mode, dataset, harness and browser version identical.

After the optimized build, run `npx playwright test --config tests/performance/validation.config.ts` separately to verify >50 employee pagination, month preservation, complete summary and nonoverlapping rows. This check does not change measurement samples or counters.
