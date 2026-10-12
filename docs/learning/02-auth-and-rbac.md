# 02: Authentication and RBAC (Phase 1, backend)

## What we did
| Change | Why |
|---|---|
| `src/config/permissions.js`: permission **catalog** in code | A permission only means something if code checks it. A key invented in the UI would guard nothing. |
| `Role` model: which role holds which permission, **in the DB** | Admin can create "Team Lead" or tweak QA without a deploy. |
| `User.role` is now a ref to `Role`; added `status`, `avatarUrl`, `lastLoginAt` | Roles are data, not a hardcoded `['user', 'admin']` enum. `status` drives the approval flow. |
| `auth()` split from `authorize(...perms)` | Two questions, two status codes (401 vs 403), two middlewares. The old `auth('manageUsers')` mixed them and hid a "users can always access their own `:userId`" exception inside. |
| Passport populates `role` and rejects non-`active` users | Permissions and status are re-read **every request**, so edits apply instantly. |
| Refresh token in an **httpOnly cookie**, scoped to `/v1/auth` | JavaScript (and XSS) can't read it. |
| Register → `pending`. Login → 403 for pending/suspended/rejected | Self-register, then Admin approval (approval endpoint is Phase 2). |
| `GET /auth/me` | The web app's source of truth for "who am I and what can I do". |
| `jti` added to every JWT | **Bug found by the new tests**, see concept 5. |
| Forgot-password always returns 204 | The old 404 told an attacker which emails have accounts. |
| Reset-password revokes all refresh tokens | If you reset because you were hacked, the attacker's sessions must die too. |
| Removed `xss-clean` | It HTML-escaped stored text. `<b>` pasted into a bug report came back as `&lt;b&gt;`. Escaping is the UI's job, at render time. |
| CORS limited to `CLIENT_URL` with credentials | `cors()` with no options let any website call the API from a user's browser. |
| `npm run seed`, `GET /v1/health`, `mongodb-memory-server`, tests in CI | First Admin without hand-editing the DB, a Railway healthcheck, and tests that need no MongoDB. |

## The request flow now
```
GET /v1/users   Authorization: Bearer <access JWT>
   │
   ▼
auth()                       passport-jwt verifies signature + expiry + type=access
   │                         User.findById(sub).populate('role')
   │                         user missing or status != active ─────────────► 401
   ▼
authorize('user:read')       req.user.getPermissions()
   │                           Admin role → the whole catalog (always)
   │                           other role → role.permissions
   │                           no role    → []  (fails closed)
   │                         missing any required permission ─────────────► 403
   ▼
validate(schema) → controller → service → model
```

## Concepts worth knowing

### 1. Authentication vs authorization
- **Authentication (401):** *who are you?* A bad, expired or missing token, or a user who is no longer active.
- **Authorization (403):** *I know who you are, and you can't do this.*
The frontend treats them differently. A 401 means "try a silent refresh, then send to login". A 403 means "show 'no permission'". Mixing them up causes logout loops.

### 2. Why permissions are NOT in the JWT
It's tempting to put `permissions: [...]` in the token and skip the DB lookup. But a JWT can't be changed after it's issued. If Admin removes `bug:delete` from a role, or suspends someone, every token already issued keeps the old powers until it expires (30 minutes here). We pay one indexed `findById + populate` per request to get **instant revocation**. The test `should apply a role edit on the very next request, with the same access token` proves it.

### 3. Catalog in code, assignment in DB
| | Lives in | Changed by |
|---|---|---|
| *Which permissions exist* (`bug:verify`) | `permissions.js` | a developer, in a PR, together with the code that checks it |
| *Who has them* (QA has `bug:verify`) | `roles` collection | Admin, at runtime |

`authorize('bug:raed')` throws **at boot**, because a typo that silently denied everyone would be a terrible bug to chase. The Role model also rejects unknown keys, so the DB can't drift from the catalog.

### 4. Access token in memory, refresh token in an httpOnly cookie
| Storage | XSS can steal it? | Sent automatically? |
|---|---|---|
| `localStorage` | **Yes**: any injected script can read it | No |
| Memory (JS variable) | Only while the page is open | No |
| httpOnly cookie | **No**: JS can't read it at all | Yes, to `Path=/v1/auth` only |

The short-lived access token (30 min) lives in memory. The long-lived refresh token (30 days) lives where scripts can't reach it. On page reload, memory is empty, so the app calls `/auth/refresh-tokens` and the browser sends the cookie.

**CSRF note:** cookies are sent automatically, which is the CSRF risk. With `SameSite=Lax` (our default, and fine on `app.<domain>` + `api.<domain>`), browsers don't send the cookie on cross-site POSTs. CORS also stops other sites from *reading* the new access token. If you ever deploy on two unrelated domains (`SameSite=None`), revisit this. See `docs/DEPLOYMENT.md`.

### 5. Refresh-token rotation, and the bug the tests caught
Each refresh deletes the old refresh token and issues a new one, so a stolen token works at most once. But a JWT is a deterministic signature of its payload, and our payload was `{sub, iat, exp, type}` with `iat` in **seconds**. Two refreshes in the same second produced **byte-identical** tokens. Rotation deleted the old token and saved the same string again, so the "used" token kept working. The fix is a random `jti` (JWT ID) per token. It's the kind of bug you only find by writing the test for the property you *think* you have.

### 6. Fail closed, and don't leak
- `getPermissions()` returns `[]` for a user with no role or an unpopulated one. A bug in loading gives *less* access, never more.
- Login checks the password **before** the status. A wrong password always gets "Incorrect email or password", so you can't probe whether `ceo@invennico.com` has a pending account.
- Forgot-password always returns 204 for the same reason.

## Try it yourself
1. `npm run seed`, `npm run dev`, then in Swagger (`/v1/docs`) log in as the seed Admin and call `GET /auth/me`. Count the permissions (27).
2. Register a new user and try to log in. Read the 403 message. In Compass/mongosh set `status: 'active'` and assign the Developer role id, then log in and call `GET /users`. Why is it 403 and not 401?
3. **Exercise:** remove the `jti` line in `token.service.js` and run `npm test`. Which two tests fail, and why does one of them return 200 instead of 401?
4. **Exercise:** add a permission `bug:export` to the catalog. Without running anything, predict which role gets it automatically, and why no migration is needed. Then check with `/auth/me`.
