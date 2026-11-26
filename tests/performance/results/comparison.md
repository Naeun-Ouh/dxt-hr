# Local synthetic comparison — Issue #56

Baseline production build: main `e0cf934410fee7f937408677ad970dcb25957786`. After: Issue #56 optimized working tree. Same Node22, Chrome, deterministic 50-profile/four-month workload and measurement actions. Both suites passed 7/7; every recorded HTTP/adapter SQL aggregate has zero errors. Each row has a separate first observation and 10 warm observations in JSON. This is local comparative evidence, not hosted cold-start or Supabase latency.

| Scenario | p50 before → after (ms) | p95 before → after (ms) | median Auth calls | median REST calls | median adapter SQL calls |
|---|---:|---:|---:|---:|---:|
| employee-home | 891 → 914 | 915 → 927 | 15 → 14 | 10 → 10 | 24 → 24 |
| employee-expenses | 663 → 622 | 703 → 627 | 12 → 3 | 12 → 12 | 29 → 26 |
| leader-approvals | 650 → 641 | 672 → 668 | 19 → 17 | 2 → 2 | 6 → 6 |
| admin-expenses | 1993 → 702 | 3075 → 721 | 21 → 13 | 612 → 5 | 1227 → 12 |
| ceo-employees | 671 → 641 | 697 → 655 | 32 → 21 | 2 → 2 | 5 → 5 |
| employee-save | 85 → 101 | 104 → 118 | 5 → 7 | 16.5 → 16 | 45 → 43 |
| leader-approval | 160 → 160 | 171 → 174 | 4 → 4 | 5 → 5 | 18 → 18 |

Timing includes browser/navigation and network-idle readiness; mutation setup is excluded. Query totals exclude transaction/RLS setup and SQL executed internally in RPCs. Auth count reductions do not by themselves establish security: normal cross-user/session-switch regression tests remain required. The optimized admin list displays 50 rows per page while retaining full-month summary; a separate browser check verifies page 2, retained month, unchanged summary and nonoverlapping rows.
