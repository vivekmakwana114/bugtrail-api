# 04: Bugs, status rules and time tracking (Phase 4, backend)

## What we did
| Change | Why |
|---|---|
| `Bug` model: reporter fields (title, module, description, Drive attachments, status, assignee) + system fields (bugNumber, failCount, resolvedAt, passedAt, deletedAt) | The ticket. System fields are never accepted from the client. |
| `BugActivity`: an append-only log (created, updated, status_changed, assigned, deleted) | The timeline, time per status and (Phase 6) developer performance all come from it. |
| Transition table in `config/bugStatuses.js`; `getAllowedStatuses(user, bug, project)` in `bug.service` | One place decides who can move what where. See concept 1. |
| `allowedStatuses` in every bug response | The UI shows only valid options and never duplicates the rules. |
| Bug numbers from `$inc` on `project.bugCounter` | `BT-42` with no duplicates under concurrency. See concept 3. |
| Status and assign changes are **conditional updates**; a lost race returns **409** | Two people moving the same bug at once can't silently overwrite each other. See concept 2. |
| `ageMs` (created until pass, or now) and `timeInStatus` (from the activity log) | "Which ticket takes the most time?" See concept 4. |
| Bugs are read by id or by key (`GET /bugs/BT-42`) | Readable URLs in the web app. |
| Archived projects are read-only | Nothing changes in a project that's been put away. |
| Can't remove a member with open bugs; can't delete a user with bugs (409) | Open work never silently loses its owner, and history keeps its names. |
| Attachments must be `https://drive.google.com` or `docs.google.com`, checked with `new URL()` | A regex like `/drive\.google\.com/` would accept `drive.google.com.evil.com`. |
| `sendEmail` accepted on create, status and assign | The "Send email" checkbox; sending arrives with the outbox in Phase 5. |

## The request flow: a developer resolving a bug
```
PATCH /v1/bugs/:id/status  { status: "resolved" }   (developer)
   │
auth() → authorize('bug:read')        route only checks you can see bugs at all
validate()                             status is one of the five
   ▼
bugService.changeStatus
   getBugOrThrow(actor, id)           bug + its project, within YOUR project scope ── 404
   assertProjectWritable(project)     archived? ── 400
   getAllowedStatuses(actor, bug)     bug:progress + you're the assignee + ongoing → [resolved]
      not in the list ─────────────────────────────────────────────────────── 403
   Bug.findOneAndUpdate({ _id, status: 'ongoing' }, { $set: { status: 'resolved', resolvedAt, ... } })
      null (someone changed it first) ────────────────────────────────────── 409
   BugActivity.create({ type: 'status_changed', from: 'ongoing', to: 'resolved' })
   ▼
bugSerializer.bugDetail               includes the NEW allowedStatuses ([] for the dev now)
```

## Concepts worth knowing

### 1. Rules that depend on data belong in the service, not the route
`authorize('bug:verify')` can say "QA can verify bugs". It can't say "a developer can move *this* bug to resolved", because that depends on **who's assigned** and **what status it's in now**. So the status route only checks `bug:read`, and the service applies the table:

| Who | Moves |
|---|---|
| `bug:progress`, **as the assignee** | reported → ongoing, ongoing → resolved, failed → ongoing |
| `bug:verify` | resolved → pass / failed |
| `bug:set_any_status` (QA, Admin) | any → any |

The same function feeds `allowedStatuses` in the response. The rule the UI shows and the rule the API enforces **can't drift apart**, because they're the same code.

### 2. Lost updates and conditional writes (optimistic concurrency)
QA opens a resolved bug and clicks *Failed*. At the same moment the developer, looking at a stale page, clicks something too. With "load, change, `save()`", the last write wins and the first change vanishes without an error.

Instead, the update says **what it expects**: `findOneAndUpdate({ _id, status: 'resolved' }, ...)`. If the status is no longer `resolved`, nothing matches, nothing is written, and the API returns **409 "Reload and try again"**. No locks are needed, and MongoDB applies a single-document update atomically. This is called *optimistic concurrency*: assume no conflict, detect it if it happens. Assign uses the same trick on `assignee`.

### 3. Sequence numbers without duplicates
"Count the bugs and add 1" breaks when two bugs are reported in the same millisecond: both count 41 and both become BT-42. `$inc` on the project's `bugCounter` is atomic: each caller gets its own number. If the bug insert then fails, that number is skipped. **Gaps are fine, duplicates aren't.** A unique index on `{project, bugNumber}` is the safety net.

### 4. Derived values: store events, compute numbers
We don't store "age" or "time in ongoing"; they change every second. We store **timestamps of events** (the activity log), then compute:
- `ageMs = (passedAt ?? now) - createdAt`. Passing stops the clock, and reopening restarts it.
- `timeInStatus`: each status event starts a stretch that ends at the next event (see `utils/bugTime.js`).

Sorting the grid by age needs the value in the database query, so `queryBugs` computes it in the aggregation pipeline (`$subtract` with `$$NOW`) only when you sort by age.

### 5. Audit logs are append-only
`BugActivity` rows are never edited or deleted, not even when the bug is soft-deleted (that adds a `deleted` row). An audit trail you can rewrite isn't an audit trail. It's also why deleting a user with bugs is blocked: the history would point at nobody.

**Honest limitation:** the bug and its activity row are two writes. Without a replica set there are no transactions, so a crash between them could leave a change without a row. We write the bug (the source of truth) first, so the worst case is a missing timeline entry, never a wrong bug.

## Try it yourself
1. **Run collection** in Postman: the **Bugs** folder reports a bug and walks it through ongoing → resolved → failed → ongoing → resolved → pass. Watch `failCount` and `timeInStatus` in the responses.
2. Approve a developer, add them to a project, assign them a bug, log in as them and `GET /v1/bugs/<key>`. Compare `allowedStatuses` before and after each move. Then try `{ "status": "pass" }` as the developer.
3. **Exercise:** in `changeStatus`, replace the conditional `findOneAndUpdate` with `bug.status = status; await bug.save()`. Fire two different status changes at the same bug at the same time (two Postman tabs, or `Promise.all` in a script). What ends up in the bug, and what does the activity log say? Revert afterwards.
4. **Exercise:** QA moves a passed bug back to `ongoing`. What happens to `passedAt` and `ageMs`, and why is that the right behaviour for "which ticket takes the most time"?
