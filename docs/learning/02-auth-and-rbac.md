# 02: Authentication and access control (Phases 1–2, backend)

> **Design change in Phase 2.** Phase 1 shipped a `Role` collection, so Admin could edit roles at runtime. In Phase 2 we deliberately removed it: a user stores only a **role enum**, and what each role can do is **defined in code**. Section 3 explains the trade-off.

## What we did
| Change | Why |
|---|---|
| `src/config/permissions.js`: permission **catalog** in code | A permission only means something if code checks it. A key invented in the UI would guard nothing. |
| `src/config/roles.js`: `admin \| project_manager \| developer \| qa` and what each can do | One file answers "what can a QA do?". Changing it is a reviewed PR, and it applies to every QA at once. |
| `User.role` is a plain enum; added `status`, `avatarUrl`, `lastLoginAt` | No join, no extra collection. `status` drives the approval flow. |
| `auth()` split from `authorize(...perms)` | Two questions, two status codes (401 vs 403), two middlewares. The old `auth('manageUsers')` mixed them and hid a "users can always access their own `:userId`" exception inside. |
| Every request re-reads the user (role + status) | Role changes and suspensions apply on the very next request. |
| Refresh token in an **httpOnly cookie**, scoped to `/v1/auth` | JavaScript (and XSS) can't read it. |
| Register → `pending`. Admin approves with a role (`PATCH /users/:id/status`) | Self-register, then approval. |
| Escalation guards in `src/utils/accessGuards.js` | See concept 7. |
| Serializers in `src/serializers/` | Each endpoint returns a chosen shape, never the whole document. See concept 8. |
| `jti` added to every JWT | **Bug found by the tests**, see concept 5. |
| Forgot-password always 204; reset and change-password revoke sessions | No account enumeration; a reset after a hack must end the attacker's sessions. |
| Removed `xss-clean`, CORS limited to `CLIENT_URL` | Stored text stays exactly as typed; only our web app can call the API with cookies. |
| Interactive `npm run seed`, `GET /v1/health`, in-memory MongoDB tests, Postman collection | First Admin without editing the DB, a Railway healthcheck, tests with no setup, click-to-test API. |

## The request flow now
```
GET /v1/users   Authorization: Bearer <access JWT>
   │
   ▼
auth()                       passport-jwt verifies signature + expiry + type=access
   │                         User.findById(sub)              (one indexed read, no join)
   │                         user missing or status != active ─────────────► 401
   ▼
authorize('user:read')       req.user.getPermissions()  →  roles.js[user.role]
   │                           admin   → the whole catalog (always)
   │                           no role → []  (fails closed)
   │                         missing any required permission ─────────────► 403
   ▼
validate(schema) → controller → service (+ escalation guards) → model
   ▼
serializer                   picks exactly the fields this endpoint returns
```

## Concepts worth knowing

### 1. Authentication vs authorization
- **Authentication (401):** *who are you?* A bad, expired or missing token, or a user who is no longer active.
- **Authorization (403):** *I know who you are, and you can't do this.*
The frontend treats them differently. A 401 means "try a silent refresh, then send to login". A 403 means "show 'no permission'". Mixing them up causes logout loops. That's also why a wrong *current password* on change-password is a **400**, not a 401: a typo must not log you out.

### 2. Why permissions are NOT in the JWT
A JWT can't be changed after it's issued. If the token carried `role: 'qa'` and an Admin demoted or suspended that person, the token would keep the old powers until it expired (30 minutes). We pay one indexed `findById` per request to get **instant revocation**. The test `should apply a role change on the very next request, with the same access token` proves it.

### 3. Roles in code vs roles in the database (the Phase 2 decision)
| | Roles collection (Phase 1) | Role enum + code (now) |
|---|---|---|
| Change what QA can do | Admin edits in the UI, instant | PR to `roles.js`, applies on deploy |
| Custom roles ("Team Lead") | Yes | Add one to `roles.js` (code change) |
| Two QAs with different powers | Possible (drift) | Impossible: every QA is identical |
| Per-request cost | `findById` + `populate` (2 reads) | `findById` (1 read) |
| Moving parts | Role model, CRUD, guards for editing roles, seed of roles | One config file |

For an internal tool with four stable roles, the right side wins: simpler, auditable in git, and nothing to drift. The left side is worth it when customers define their own roles (multi-tenant SaaS). The permission *keys* still exist: routes check `authorize('bug:verify')`, never `role === 'qa'`. So if you ever need the left side back, no route has to change.

`authorize('bug:raed')` throws **at boot**, because a typo that silently denied everyone would be a terrible bug to chase.

### 4. Access token in memory, refresh token in an httpOnly cookie
| Storage | XSS can steal it? | Sent automatically? |
|---|---|---|
| `localStorage` | **Yes**: any injected script can read it | No |
| Memory (JS variable) | Only while the page is open | No |
| httpOnly cookie | **No**: JS can't read it at all | Yes, to `Path=/v1/auth` only |

The short-lived access token (30 min) lives in memory. The long-lived refresh token (30 days) lives where scripts can't reach it. On page reload, memory is empty, so the app calls `/auth/refresh-tokens` and the browser sends the cookie.

The cookie's `Path=/v1/auth` has a consequence we used in Phase 2: only auth routes can see the refresh token. That's why **change-password lives at `/auth/change-password`**, not `PATCH /users/me`. It needs the cookie to sign out other sessions while keeping yours.

**Logout and access tokens:** logout revokes the *refresh* token, but an access token already issued stays valid until it expires (max 30 min), because access tokens are stateless. That's the reason they're short-lived. The web app simply forgets it.

**CSRF note:** cookies are sent automatically, which is the CSRF risk. With `SameSite=Lax` (our default, fine on `app.<domain>` + `api.<domain>`), browsers don't send the cookie on cross-site POSTs, and CORS stops other sites from *reading* the new access token. If you ever deploy on two unrelated domains (`SameSite=None`), revisit this. See `docs/DEPLOYMENT.md`.

### 5. Refresh-token rotation, and the bug the tests caught
Each refresh deletes the old refresh token and issues a new one, so a stolen token works at most once. But a JWT is a deterministic signature of its payload, and our payload was `{sub, iat, exp, type}` with `iat` in **seconds**. Two refreshes in the same second produced **byte-identical** tokens: rotation deleted the old one and saved the same string again, so the "used" token kept working. The fix is a random `jti` (JWT ID) per token. You only find this kind of bug by testing the property you *think* you have.

### 6. Fail closed, and don't leak
- `getPermissions()` returns `[]` for a user with no role. A bug gives *less* access, never more.
- Login checks the password **before** the status, so you can't probe whether `ceo@invennico.com` has a pending account.
- Forgot-password always returns 204 for the same reason.

### 7. Escalation guards: "can this user change *who* can do X?"
`authorize()` answers "can you call this endpoint?". It can't answer "can you do it *to this person*?", because that depends on the target. Those rules live in the service layer (`accessGuards.js`), so they apply however the service is called:

| Guard | Attack it stops |
|---|---|
| You can't assign a role whose permissions you don't hold | A user with `user:approve` approving their friend as QA, gaining `bug:verify` by proxy |
| Only an Admin assigns Admin | Anyone creating a new Admin |
| You can't manage a user who holds permissions you don't | Resetting a QA's (or the Admin's) password, then logging in as them |
| You can't change your own role/status or delete yourself | Self-promotion, accidental lock-out |
| The last active Admin can't be suspended, deleted or demoted | Nobody left who can manage the system |

Today only Admin holds `user:create/update/approve/delete`, so the non-Admin guards are dormant. They're there for the day you give PMs `user:approve`, and the tests simulate that day with a Jest spy.

**A known gap, accepted on purpose:** two Admins suspending each other at the same instant both see "2 active Admins" and both succeed. Closing that needs a MongoDB transaction, which needs a replica set, which a single VPS `mongod` doesn't have. The odds are tiny, and the recovery is built in: `npm run seed` creates a new Admin whenever no **active** Admin exists.

### 8. Response shaping: the server decides
Controllers never `res.send(document)`. They pass it through a serializer (`src/serializers/user.serializer.js`) that **picks** fields:
- `userSummary` (lists): `id, name, email, role, status, avatarUrl`
- `userDetail` (one user, `/me`, login): summary + `permissions, lastLoginAt, createdAt`

Picking (an allow-list) beats removing (a block-list): a field added to the model later, like an internal flag or a reset counter, is **invisible until someone deliberately exposes it**. Lists stay small too, which matters when the bug grid embeds a reporter and an assignee in every row.

### 9. Cookie settings from the environment, and the CSRF guard that comes with them (2026-10-13)
The refresh cookie used to take `COOKIE_SECURE` and `COOKIE_SAME_SITE` from env. Getting them wrong broke sign-in in ways that are hard to debug, and the right values follow from where we run, so they now live in code (`src/utils/refreshCookie.js`):
- **development/test:** `SameSite=Lax`, not `Secure`. Localhost is plain HTTP, and the browser would never send a `Secure` cookie there. `:3000` and `:5000` are the same *site* (ports don't count), so `Lax` is enough.
- **production:** `Secure` + `SameSite=None`. Our first deploy uses two `*.up.railway.app` URLs. That domain is on the Public Suffix List, so a browser treats them as **different sites**, and only `None` lets the cookie travel between them.

`None` has a cost: a page on *any* site can make the browser send our cookie, which is cross-site request forgery (CSRF). CORS doesn't stop that, because CORS only hides the response from the attacker's script; the request (and its `Set-Cookie`) still happens. So the two routes that act on the cookie alone (`/auth/refresh-tokens`, `/auth/logout`) go through `requireAppOrigin`: browsers always send an `Origin` header on cross-site POSTs and a page can't fake it, so anything other than `CLIENT_URL` gets a 403. A request with no `Origin` comes from Postman, curl or tests, which have no victim's cookie to abuse, so it passes.

Takeaway: when you loosen one browser protection (`SameSite`), add the guard that replaces it in the same change, and test both sides. A production-mode check confirmed the flags (`HttpOnly; Secure; SameSite=None`), a 403 for a foreign Origin, and 200 for the web app's.

## Try it yourself
1. `npm run seed` in **PowerShell or Command Prompt** (Git Bash: `winpty npm run seed`). Notice the password is masked, and an invalid password is rejected with the same rule the API uses.
2. Import `docs/postman/BugTrail.postman_collection.json`, set `adminEmail`/`adminPassword`, and **Run collection**. Then open `List users` and `Me`: compare the two shapes.
3. **Exercise:** remove the `jti` line in `token.service.js` and run `npm test`. Which tests fail, and why does one return 200 instead of 401?
4. **Exercise:** in `roles.js`, give `project_manager` the `user:approve` permission. Approve a pending user as a PM with `role: "qa"`. What happens, and which guard stopped it? (Revert afterwards.)
5. **Exercise:** add a field `internalNote` to the User model and save a value. Does it appear in `GET /users/:id`? Why not?
