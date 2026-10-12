# 06: MongoDB aggregations and the dashboard (Phase 6, backend)

## What we did
| Change | Why |
|---|---|
| `GET /dashboard/summary`, `/bug-status`, `/developer-performance`, `/slowest-tickets` | The dashboard's cards, chart, performance table and "longest-running" list. |
| One `getScope()` used by all four | Same project scope, `projectId` check and date range everywhere. A filter fixed once is fixed for every card. |
| Every number computed by **one aggregation** inside MongoDB | Only totals travel over the network, never thousands of bugs. See concept 1. |
| `developer-performance` needs `dashboard:view_performance` | Comparing people is more sensitive than counting bugs. Developers see the dashboard, not the league table. |
| `from` / `to` on the bug's report date; a date-only `to` = end of that day | `?from=2026-10-12&to=2026-10-12` means "that day", the way people expect. |
| `slowest-tickets` returns the same row shape as the ticket grid | The web app reuses its grid row component (`toBugRows` + `bugListItem`). |
| Swagger audit: all 45 routes documented, none stale | Phase 6's "Swagger docs" goal, checked by a script rather than by eye. |

## The flow: developer performance
```
GET /v1/dashboard/developer-performance?projectId=…&from=2026-10-01   (QA)
   │
auth() → authorize('dashboard:view_performance') → validate()   (dates parsed, from ≤ to)
   ▼
getScope(qa, filter)
   getAccessibleProjectIds(qa)        → [ids]  (projectId must be one of them, else 404)
   bugMatch = { project ∈ ids, deletedAt: null, createdAt ≥ from }
   ▼
Bug.aggregate
   $match  bugMatch + assignee ≠ null            ← uses the {project, status} index
   $group  by assignee:
             assigned     = count
             passed       = count where status = pass
             firstPass    = count where status = pass AND failCount = 0
             totalFails   = sum(failCount)
             avgTimeToPass = avg(passedAt − createdAt) for passed only
   $sort   passed desc
   ▼
User.find(ids) → names   ·   firstPassRate = firstPass / passed (null if 0 passed)
```

## Concepts worth knowing

### 1. Push the counting to the database
The naive version loads every bug into Node and loops. With 20,000 bugs, that's 20,000 documents over the network, in memory, for every dashboard load, to produce about a dozen numbers. An aggregation **pipeline** runs inside MongoDB and returns only the result:
- `$match` first, so the indexes cut the data down before anything else.
- `$group` collapses rows into totals (`$sum`, `$avg`).
- `$cond` counts "only the rows where...". `$sum: { $cond: [isPass, 1, 0] }` is "count the passed ones".
- `$addFields` computes a value per row, like age = `($passedAt ?? $$NOW) − $createdAt`.

### 2. `$avg` ignores nulls, which we use on purpose
For the average time to pass, failed and open bugs must not count. `{$cond: [isPass, passedAt − createdAt, null]}` turns non-passed rows into `null`, and `$avg` skips them. The same trick works for "average of the rows that match", in any group.

### 3. Rates need a sensible empty value
`firstPass / passed` with `passed = 0` is a division by zero. We return `null` ("no data"), not `0` ("terrible") or `1` ("perfect"). The UI can show "–". Choosing the empty value is a product decision, not just a technical one.

### 4. Know what your metric attributes to
Performance counts bugs **currently** assigned to someone. If Dana fails a bug twice and it's reassigned to Sam, who passes it, Sam gets the pass and the 2 fails (failCount lives on the bug). The fully fair version reads the activity log (who was assigned at each fail) and is worth building if this table ever drives decisions about people. For a team dashboard, simple and explainable wins, as long as it's **written down** (it's in Swagger and in the plan).

### 5. Dates and time zones
`2026-10-12` has no time zone. We treat date-only values as UTC days and make a date-only `to` cover the whole day. Invennico is in IST (UTC+5:30), so "today" in UTC starts at 05:30 local. The web app should send full ISO date-times with the offset (`2026-10-12T00:00:00+05:30`) when it means a local day. The API accepts both.

### 6. When to precompute
Every number here is computed on request, so it's always current and there's nothing to keep in sync. That stays fast while the `$match` can use indexes and the matched set is thousands, not millions, of bugs. If the dashboard ever gets slow, the next steps in order are: check the index with `explain()`, cache results for a minute, and only then store precomputed daily totals.

## Try it yourself
1. In Postman, report three bugs to one developer. Pass one, fail-then-pass another, leave one open. Run **Dashboard → Developer performance**: you should see `passed: 2, totalFails: 1, firstPassRate: 0.5`.
2. In `mongosh`, run the developer-performance pipeline from `dashboard.service.js` yourself (paste the stages with your own project id). Then add `.explain('executionStats')` and find which index the `$match` used.
3. **Exercise:** add `avgFailsPerPassed` (total fails ÷ passed) to developer performance. Which `$group` fields do you already have, and what should it return when nothing has passed?
4. **Exercise:** make `slowest-tickets` accept `assignee=me`. Which function would you reuse from `bug.service` so the rule matches the ticket grid exactly?
