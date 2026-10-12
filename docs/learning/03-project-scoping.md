# 03: Projects and project scoping (Phase 3, backend)

## What we did
| Change | Why |
|---|---|
| `Project` model: `name`, `key`, `description`, `status`, `manager`, `members[]`, `bugCounter`, `deletedAt` | One document per project. Members live on the project, so "who is in this project?" and "which projects am I in?" are both one indexed query. |
| `src/utils/scope.js`: `projectScopeFilter(user)`, `getAccessibleProjectIds(user)` | **One** place decides which projects a user can see. Every project query (and later bugs, chat, dashboard) starts from it. See concept 1. |
| A project outside your scope is a **404**, not a 403 | A 403 would confirm the id exists. See concept 2. |
| `key` is uppercase, unique, `immutable`, and stays reserved after delete | `BT-42` ends up in links, emails and chat. If keys could change or be reused, old links would point at the wrong project. |
| Soft delete (`deletedAt`) | Bugs, activity and chat keep a project to point at. The scope filter hides deleted projects everywhere at once. |
| Members added with `$addToSet`, removed with `$pull` | Atomic and idempotent. See concept 4. |
| `bugSummary` on every project (byStatus, `open`, 3-slice `pie`), computed by one aggregation per page | The card's pie, with the mapping owned by the server. See concept 5. |
| Manager must be a member and able to manage members (PM or Admin); can't be removed while manager | Keeps "manager" meaningful and the data consistent. |
| Deleting a user pulls them from every project | No dangling ids in `members` or `manager`. |
| `sortBy` limited to an allow-list (projects **and** users) | An open `sortBy=password:asc` lets a caller sort users by password hash. See concept 6. |
| Error converter fixed; duplicate key (E11000) → 409 | Boilerplate bug: `a \|\| b ? x : y` parses as `(a \|\| b) ? x : y`, so every error with a status (e.g. 413) became 400. |

## The request flow
```
PATCH /v1/projects/:id   (PM)
   │
auth()                         who are you?                              ── 401
authorize('project:update')    can your ROLE edit projects at all?        ── 403
validate()                     key/members not allowed here, ids valid    ── 400
   ▼
projectService.updateProject(actor, id, body)
   getProjectOrThrow(actor, id)
      Project.findOne({ _id: id, ...projectScopeFilter(actor) })
                   = { _id, deletedAt: null, members: actor._id }   (no read_all)
      not found → 404 "Project not found"   ← same answer whether it doesn't exist or isn't yours
   manager rules → save
   ▼
projectSerializer.projectDetail   picks the fields
```

## Concepts worth knowing

### 1. Two questions: "can you do this?" and "to which projects?"
`authorize('project:update')` checks the **role**: PMs can edit projects. It can't know *which* projects, because that depends on data. That second question is **scope**, and it's answered by data (membership), in the service.

The danger with scope is forgetting it once. If every service writes its own `members: user._id` check, one day someone writes `Project.findById(id)` and a developer can read every project. So the rule lives in **one helper**, and every lookup goes through `getProjectOrThrow(actor, id)`. Phase 4 will use `getAccessibleProjectIds(user)` the same way for bugs:
```js
Bug.find({ ...clientFilter, project: { $in: await getAccessibleProjectIds(user) } })
```

**Merge order matters:** `{ ...clientFilter, ...projectScopeFilter(user) }`. Spread last, the scope overwrites anything the client tried to set (`members`, `deletedAt`). Spread first, a crafted query could widen it.

### 2. 404 vs 403 for things you can't see
- **403** means "this exists and you can't touch it". Fine for *actions* (a developer calling `PATCH /projects/...` has no `project:update` at all).
- For *specific records* outside your scope, a 403 leaks existence: try ids and you learn which projects exist. A **404** gives the same answer as a random id. GitHub does the same for private repos.

### 3. Soft delete, and why the key stays reserved
A hard delete leaves bugs, activity and chat pointing at nothing. With `deletedAt`, the project disappears from every list and lookup (the scope filter includes `deletedAt: null`), and the data stays. The key stays taken so `BT-42` in an old email never points at a new project that reused `BT`.

### 4. Atomic updates for arrays
Two PMs add members at the same moment. With load → push → `save()`, both load `[a, b]`, one saves `[a, b, c]`, the other saves `[a, b, d]`, and `c` is gone (a **lost update**). `$addToSet` / `$pull` change the array inside MongoDB in one step, so both changes survive. `$addToSet` also ignores duplicates, which makes "add member" safe to retry.

### 5. Computed summaries: one aggregation, not N queries
The projects page shows 10 cards, each with a pie. Counting per card means 10 queries (**N+1**). Instead, one `$match` + `$group` by `{project, status}` for the whole page. With the `{project, status}` index coming in Phase 4, that's cheap.

Why compute instead of storing counters on the project? Stored counters must be updated on every status change, and any missed update (a crash, a bug, a manual DB fix) leaves them wrong forever. Computing is always right. If it ever gets slow, the fix is caching, not counters.

The pie mapping (ongoing = ongoing + failed, resolved = resolved + pass) lives in `config/bugStatuses.js`. The server owns it, so the web app and any future client draw the same chart.

*Phase 3 note:* the Bug model arrives in Phase 4, so the aggregation reads the `bugs` collection directly for now. Phase 4 swaps it for `Bug.aggregate`.

### 6. Allow-list your sort fields
`sortBy` was a free string passed into `.sort()`. Sorting users by `password` doesn't return hashes, but ordering reveals information about them, and sorting on unindexed fields is an easy way to load the DB. Now `sortBy` accepts only named fields. This is the same idea as the serializers: **allow-lists, not block-lists**.

## Try it yourself
1. Import the Postman collection and **Run collection**: the new **Projects** folder creates a project, adds the approved user, removes them and deletes the project.
2. Create a project as Admin, then log in as a developer who isn't a member and `GET /v1/projects/<id>`. You get 404. Add them as a member and try again.
3. **Exercise:** in `queryProjects`, move `...projectScopeFilter(actor)` to the **top** of the filter object. Which request shape could now widen a developer's scope? (Hint: what if `members` were an accepted filter?) Revert afterwards.
4. **Exercise:** insert a few documents into the `bugs` collection with `mongosh` (`{ project: ObjectId('...'), status: 'failed', deletedAt: null }`) and watch the project's `pie` change. Which slice does `failed` count toward, and why?
