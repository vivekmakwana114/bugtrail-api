# BugTrail: Bug Reporting Panel Plan

## Context
Invennico needs an internal bug reporting panel. QA reports bug tickets against projects, developers fix them, and QA verifies them. Admin controls what every role can do, and everyone sees only the projects they belong to.

There are two repos:
- `D:\Invennico\backend-development`: the hagopj13 express-mongoose boilerplate (ESM), nested in `server-development-main/`. It already has JWT access/refresh, Joi validation, paginate/toJSON plugins, Swagger, and Jest. The RBAC is a hardcoded `Map` in `src/config/roles.js`, so it can't support runtime permissions.
- `D:\Invennico\frontend-development`: a Kooji marketing-site copy. **It will be fully replaced** with a clean, purpose-built Next.js panel. Nothing from Kooji is kept.

**Decisions**
- Name: **BugTrail** (`bugtrail-api`, `bugtrail-web`).
- Database: MongoDB only. **No Docker, no Redis.**
- Roles: **Admin is the top role** (no Super Admin). Roles and permissions are stored in the DB, and access is scoped to project membership.
- Seeded roles: Admin, Project Manager, Developer, QA.
- Accounts: self-register, then Admin approval.
- Ticket statuses: **Reported → Ongoing → Resolved → Pass / Failed**.
  - QA can set any status.
  - The developer can only move Reported → Ongoing → Resolved.
  - Only QA marks Pass or Failed.
- Each ticket shows a **fail count** (how many times QA sent it back) and **time taken**.
- Attachments: **Google Drive links only** (images and videos). Nothing is stored on our side.
- Notifications: in-app realtime **always**. Email **only when the "Send email" checkbox** is ticked on that action.
- Each bug detail page has a **realtime chat** between QA and developers.

**Step 1 of execution:** save this plan as `docs/PROJECT_PLAN.md` in both repos.

---

## 1. Repo setup (Phase 0)

### Backend → `bugtrail-api`
- Move `server-development-main/*` up to the repo root and remove the wrapper folder.
- Delete `Dockerfile`, `.dockerignore`, `docker-compose*.yml`, `.travis.yml`, `bin/createNodejsApp.js`, and the `docker:*` scripts and `bin` field in `package.json`.
- Rename the package to `bugtrail-api` and update the description and keywords.
- `.env.example`: `MONGODB_URL=mongodb://127.0.0.1:27017/bugtrail`, plus the new vars (section 3).
- Rewrite the README for Windows setup without Docker: MongoDB Community or an Atlas URL, then `npm run seed`, then `npm run dev`.
- Add a GitHub Actions `ci.yml` that runs lint and test.

### Frontend → `bugtrail-web`
- Remove all Kooji code, assets, i18n, and the Vercel workflow.
- Re-scaffold with `create-next-app` (TS, App Router, Tailwind, ESLint, `src/`).
- Keep the team conventions from the current README (components under 400 lines, SRP, strict types, custom hooks).
- Add a GitHub Actions `ci.yml` that runs lint, typecheck, and build.

---

## 2. Access control

> **Changed on 2026-10-09 (Phase 2), this note overrides the rest of this section:**
> - There is **no Role collection** and no role CRUD. `User.role` is an enum: `admin | project_manager | developer | qa`, assigned by the Admin when approving a user.
> - What each role can do is defined in code (`src/config/roles.js`), using the matrix below. Permissions are never stored or edited per user; changing a role's permissions is a code change.
> - `npm run seed` creates only the Admin (it asks for email and password).
> - Every endpoint returns a server-chosen shape through serializers (`src/serializers/`), never whole documents.
> - The `role:*` permissions were dropped. `GET /roles` is a read-only catalog of the roles and their permissions. _(2026-10-13: a fifth role, `ui_ux`, with the Developer's permissions; users also get a free-text `designation`, e.g. "MERN Developer", set by an Admin.)_
> - The escalation guards still apply: only an Admin assigns Admin, you can't assign a role or manage a user with permissions you don't hold, you can't change your own role, and the last active Admin is protected.
> - See `docs/learning/02-auth-and-rbac.md` §3 for the trade-off.

**The permission catalog lives in code. Which role has which permission lives in the DB.**
- `src/config/permissions.js` lists the permission keys, grouped for the UI:
  - `dashboard:view`, `dashboard:view_performance`
  - `project:create | read | update | delete | manage_members | read_all`
  - `bug:create | read | update | delete | assign | progress | verify | set_any_status`
  - `chat:read | send`
  - `user:read | create | update | delete | approve`
  - `role:read | create | update | delete`
- **Role** (DB): `name`, `slug`, `description`, `permissions[]` (validated against the catalog), `isSystem`.
- **Admin** is the single system role:
  - It always has the full catalog, and it can't be edited or deleted.
  - The **last active Admin** can't be suspended, deleted, or given another role.
  - Admin creates and edits all other roles, including custom ones like "Team Lead".
- **Project scope:** users only see projects they're a member of, unless they have `project:read_all`. Every query goes through `getAccessibleProjectIds(user)`.
- **Escalation guards:**
  - You can't grant permissions you don't hold.
  - You can't change your own role.
  - Only an Admin can assign the Admin role.
- Permissions are loaded per request (the JWT strategy populates `user.role`), so role edits apply immediately. Nothing is cached in the token.
- Middleware: `auth()` checks who you are, and `authorize(...perms)` checks what you can do. `src/config/roles.js` is deleted.

**Default matrix** (Admin = everything, locked):

| Permission | Project Manager | Developer | QA |
|---|---|---|---|
| dashboard:view / view_performance | ✓ / ✓ | ✓ / – | ✓ / ✓ |
| project create / update / delete | – / ✓ / – | – | – |
| project manage_members / read_all | ✓ / – | – | – |
| bug create / update / assign | ✓ / ✓ / ✓ | – | ✓ / ✓ / ✓ |
| bug read | ✓ | ✓ | ✓ |
| bug progress (Reported → Ongoing → Resolved, own tickets) | ✓ | ✓ | ✓ |
| bug verify (Pass / Failed) | – | – | ✓ |
| bug set_any_status | – | – | ✓ |
| chat read / send | ✓ | ✓ | ✓ |
| user read / approve | ✓ / – | – | – |

---

## 3. Backend

Keep the existing layers: `routes → validations (Joi) → controllers (catchAsync) → services → models`, plus `ApiError` and the error middleware. New folders: `src/sockets/`, `src/jobs/`, `src/scripts/seed.js`, `src/utils/scope.js`.

**New env vars** (all validated in `config.js`): `CLIENT_URL`, plus `DNS_SERVERS` as a local-only workaround. _(Changed 2026-10-13: cookie settings follow `NODE_ENV` in code with an Origin check on refresh/logout; email sends when `SMTP_HOST` is set; the seed always asks in the terminal. `COOKIE_*`, `EMAIL_ENABLED` and `SEED_ADMIN_*` are gone.)_

**Security fixes to the boilerplate:**
- Limit `cors()` to `CLIENT_URL` with credentials. It currently allows any origin.
- Put the refresh token in an **httpOnly cookie** and keep the access token in memory on the frontend.
- **Remove `xss-clean`.** It's deprecated and HTML-escapes request bodies, which would break code pasted into descriptions and chat. Text is escaped when it's displayed instead.
- Tests use `mongodb-memory-server`, so you don't need MongoDB running to run them.

### Data models
- **User** (extend): `role` (ref Role), `status: pending|active|suspended|rejected`, `avatarUrl`, `lastLoginAt`.
- **Role**: as in section 2.
- **Project**: `name`, `key` (unique, e.g. `BT`), `description`, `status: active|completed|archived`, `manager`, `members[]`, `bugCounter`, `deletedAt`.
- **Bug**, with the fields QA fills in and fields the system sets.
  - **QA fills in:** `project`, `title`, `moduleName` (module/screen), `description`, `attachments[] {title, url}` (optional, Drive links), `status` (defaults to `reported`), `assignee`.
  - **System sets:**
    - `bugNumber`: an atomic `$inc` on the project's counter gives keys like `BT-42`.
    - `reporter`, `failCount`, `lastStatusChangedAt`, `resolvedAt`, `passedAt`, `deletedAt`.
  - Indexes: `{project, status}`, `{assignee, status}`, and a text index on title, module and description. *(2026-10-12: built as `{project, bugNumber}` unique instead of the text index; search is a case-insensitive match on title and module, which also finds partial words, and runs inside the already-narrowed project set.)*
- **BugActivity** (audit trail): `bug`, `project`, `actor`, `type` (created / status_changed / assigned / updated), `from`, `to`, timestamp. It powers the ticket timeline, the time-per-status numbers, and developer performance.
- **BugMessage** (chat): `bug`, `sender`, `body`, `mentions[]`, `editedAt`, `deletedAt`. Index: `{bug, createdAt}`.
- **Notification**: `recipient`, `actor`, `type`, `title`, `message`, `entity`, `readAt`. Expires after 90 days.
- **EmailOutbox**: `to`, `subject`, `html`, `status: pending|sent|failed`, `attempts`, `nextAttemptAt`, `lastError`. *(2026-10-12: built with plain `text` (what the existing mailer sends) and a `sending` status + `lockedAt`, so an email claimed by a process that died is retried; sent rows expire after 30 days.)*
- **Token**: unchanged.

### Ticket status rules (`bug.service`, single transition table)
```
Reported → Ongoing → Resolved ──QA──► Pass
             ▲          │
             │          └──QA──► Failed  (failCount++)
             └────── dev picks it up again
```
| Who | Allowed moves |
|---|---|
| **Developer (assignee)**, needs `bug:progress` | Reported → Ongoing, Ongoing → Resolved, Failed → Ongoing |
| **QA**, needs `bug:verify` + `bug:set_any_status` | Resolved → Pass / Failed, or any status → any status |
| **Admin** | anything |
- Every move to **Failed** adds 1 to `failCount`. That's the "came back from QA" count shown on the ticket.
- `Failed → Ongoing` is allowed for the developer so a failed ticket doesn't sit waiting until QA moves it back. Say so if you'd rather QA do that step.
- Every change writes a `BugActivity` row and notifies the assignee/reporter.
- The bug payload includes `allowedStatuses` for the current user, so the UI only shows valid options.

### Time tracking ("which ticket takes more time")
- **Age:** from created until Pass, or until now if not passed yet.
- **Time in each status:** worked out from the `BugActivity` timestamps.
- Shown on the ticket grid (sortable "Age" and "Fail count" columns), on the detail page (time per status), and on the dashboard ("Longest-running tickets").

### Chat on the bug detail page
- REST:
  - `GET /bugs/:id/messages?before=<cursor>&limit=30` loads older messages page by page.
  - `POST` sends a message, and `PATCH`/`DELETE` edit or delete your own message.
- Socket.IO:
  - The client sends `bug:join` / `bug:leave`. The server checks project access before letting it join the room `bug:<id>`.
  - Server events: `message:new`, `message:updated`, `message:deleted`, `bug:updated` (status or assignee changes show up live).
- Messages are saved through REST first and then broadcast, so the DB is always the source of truth and a reconnect never loses messages.
- Notifications: a new message notifies the ticket's assignee, its reporter, and anyone @mentioned (in-app). People currently in the room aren't notified.

### Notifications & email
- Socket.IO authenticates with the access token in the handshake. Each user joins the room `user:<id>`.
- **In-app is always sent.** Create ticket, reassign, and status change accept `sendEmail: boolean` (default `false`). It's an unticked "Send email" checkbox in the UI.
- `notify({recipients, type, entity, actor, sendEmail})` saves the Notification and emits it live. When `sendEmail` is ticked, it also adds an `EmailOutbox` row. The API never waits on SMTP.
- **Outbox worker** (`src/jobs/emailOutbox.worker.js`):
  - Runs every ~15s.
  - Claims each pending email with an atomic `findOneAndUpdate`, so no email is sent twice.
  - Retries with backoff, up to 5 attempts.
  - Password-reset and approval emails also go through the outbox, and they're always sent.
- **Why no Redis/BullMQ:** we send few emails from a single process, so a Mongo outbox gives us retries and survives restarts with no extra infrastructure.
- The actor never gets notified of their own action. PM2 runs **one instance**, because the socket rooms and the worker assume a single process.

### Auth flows
- `register` creates a `pending` user, and approvers get an in-app notification.
- `login` returns 403 for pending, suspended, or rejected users.
- `refresh`, `logout`, `forgot-password`, and `reset-password` are adapted to the cookie.
- `GET /auth/me` returns the user, their role, and `permissions[]`.

### API (`/v1`)
| Module | Endpoints |
|---|---|
| auth | register, login, logout, refresh-tokens, forgot/reset-password, me |
| users | list, get, create, update, delete, `PATCH /:id/status` (approve/reject/suspend), `PATCH /me`. *(2026-10-12)* List takes `search` (part of name or email, case-insensitive) and each row includes `createdAt` and `lastLoginAt` |
| roles | CRUD, `GET /roles/permissions` (catalog) |
| projects | `GET /projects` (each project includes a status summary for its pie chart), get, create, update, delete, `POST/DELETE /:id/members`, `GET /:id/modules` (distinct module names, for autocomplete) |
| bugs | `GET /bugs?projectId=` (filters: status, assignee, module, search; sort: age, failCount, updatedAt; paginated), get by id/key, create, update, delete (soft), `PATCH /:id/status` `{status, sendEmail}` *(`status`, not `to`, to match `PATCH /users/:id/status`)*, `PATCH /:id/assign` `{assignee, sendEmail}`, `GET /:id/activity` |
| messages | `GET/POST /bugs/:id/messages`, `PATCH/DELETE /messages/:id` |
| notifications | list, unread-count, `PATCH /:id/read`, `PATCH /read-all` |
| dashboard | `/summary`, `/bug-status`, `/developer-performance`, `/slowest-tickets` (filters: `projectId`, `from`, `to`; scoped to your projects) |

### Dashboard metrics
- **Top cards:** Active projects, Completed projects, Reported, Ongoing, Resolved, Failed (plus Passed).
- **Bug status chart:** count per status, for all 5 statuses.
- **Developer performance** (per assignee):
  - tickets passed
  - total fails
  - **first-pass rate** (passed with `failCount = 0`)
  - average time from Reported to Pass
- **Longest-running tickets:** the top 10 by age, with their fail count.
- *(2026-10-12, as built)* `from` / `to` filter on when the bug was **reported** (a date-only `to` covers that whole UTC day); project counts ignore dates. Developer performance counts the bugs **currently** assigned to each person, so a bug reassigned before passing counts for its new assignee. `slowest-tickets` takes `open=true` to leave out passed tickets.

---

## 4. Frontend (`bugtrail-web`, fresh)

**Stack:**
- Next.js 16 App Router and TypeScript (strict)
- Tailwind 4 with shadcn/ui
- TanStack Query (server data) and TanStack Table (ticket grid)
- react-hook-form + zod (forms)
- axios, Recharts, socket.io-client
- sonner (toasts), lucide-react (icons), next-themes (dark mode)

### Screens & flow
- **Sidebar** (items shown by permission): Dashboard, Projects, Users, Roles, Notifications. The topbar has the notification bell and the profile menu.
- **Projects page (`/projects`):** a grid of project cards.
  - Each card shows the project name, with a box under it holding a **pie chart of Reported / Ongoing / Resolved** and the counts.
  - Pie mapping: **Reported** = reported, **Ongoing** = ongoing + failed (still being worked on), **Resolved** = resolved + pass.
  - Clicking a card opens the project.
- **Project ticket grid (`/projects/[projectId]`):** a table of the project's bugs.
  - Columns: Key, Title, Module/Screen, Status badge, Assignee, Reporter, **Fail count**, **Age**, Updated.
  - Filter by status, assignee, and module, plus search.
  - "Report bug" button (QA).
  - Clicking a row opens the detail page.
- **Report bug form** (modal):
  - Project (preselected inside a project)
  - Title
  - Module/Screen name (autocompletes from the project's existing modules)
  - Description
  - Attachments (optional): repeatable Drive links, with a hint to check the sharing settings
  - Status (defaults to Reported, limited to statuses you're allowed to set)
  - Assignee (project members)
  - **"Send email" checkbox**
- **Bug detail (`/projects/[projectId]/bugs/[bugKey]`)**, in two columns:
  - **Left:** title, key, module, description, attachment links, status control (only allowed statuses, plus the "Send email" checkbox), assignee, fail count, age, time per status, activity timeline.
  - **Right: chat panel.** Realtime messages, load older messages on scroll, @mentions, edit/delete your own messages.
- Users (with a pending-approval tab), Roles (permission matrix with checkboxes), Notifications, Profile.

### Structure
```
src/
  app/(auth)/        login, register, forgot-password, reset-password, pending-approval
  app/(panel)/       layout.tsx (sidebar + topbar + auth guard)
    dashboard/  projects/  projects/[projectId]/  projects/[projectId]/bugs/[bugKey]/
    users/  roles/  roles/[roleId]/  notifications/  profile/
  components/ui/       shadcn primitives
  components/layout/   Sidebar, Topbar, NotificationBell, PageHeader
  components/shared/   DataTable, StatusBadge, PieSummary, EmptyState, ConfirmDialog
  features/<module>/   api.ts hooks.ts types.ts schemas.ts components/
                       (auth, dashboard, projects, bugs, chat, users, roles, notifications)
  lib/                 api-client.ts (silent refresh via cookie), query-client.ts, socket.ts, utils.ts
  providers/           Auth, Query, Socket, Theme
  config/              permissions.ts, nav.ts, routes.ts
```
- `usePermission()` and `<Can permission="...">` hide what a role can't do. This only affects what users see; the backend still checks every request.

### Design direction: no "zombie UI"
We follow the four principles from Katie Dill's (Stripe) talk. The goal is a panel that looks like someone cared about it, not the default AI dashboard.

**1. Point of view: "a calm instrument for triage."**
- BugTrail is a tool people live in all day. It should feel quiet, dense and precise, like a well-made instrument, not a marketing page.
- **Colour means something or it isn't used.** The base is neutral (warm greys, off-white or ink). Saturated colour is reserved for the 5 statuses and for danger. There are no decorative gradients.
- **Typography carries the hierarchy, not boxes.** One characterful sans for text and a monospace for anything machine-like (ticket keys `BT-42`, timestamps, counts). We pick the final pair in the Phase 7 style tile, avoiding the default choices (Inter or Space Grotesk on purple).
- **Banned defaults:** purple or blue gradient heroes, glassmorphism, stat cards with an icon in a coloured circle, `rounded-2xl` on everything, drop shadows as decoration, emoji in the UI, centred "empty" illustrations from stock libraries.
- **The product's own metaphor is the trail.** A ticket's life is a path, and every QA fail is a loop back.

**2. Encode the standards (an "opinionated harness").**
- `src/styles/tokens.css` holds the design tokens: colour roles, the type scale, spacing, radii, motion, and status colours. Each status has a **colour + glyph** pair, so status is never shown by colour alone. Tailwind's theme maps only to these tokens.
- shadcn components are **restyled to our tokens**, not shipped with the stock look.
- **Page templates, not just components:** `ListPage` (header, filters, table, empty/loading/error states), `DetailPage` (main + side panel), `FormDialog`, `ProjectCard`. New screens are built from templates, so the whole app stays coherent.
- `docs/design/DESIGN_SYSTEM.md` sets out the rules with do/don't examples. A frontend `CLAUDE.md` points AI-assisted work at those rules.
- Guardrail lint rules: no raw hex colours or arbitrary Tailwind values outside the token file.

**3. Don't confuse done with good: an editing pass on every screen.** Before a screen counts as finished, it's checked against:
- **Real data:** 80-character titles, 0 tickets, 500 tickets, a fail count of 7, long module names, a user with no avatar.
- **All states:** loading (skeletons shaped like the content), empty (with the next action), error (with a retry), and "no permission".
- **Five-second test:** can a PM tell on the projects page which project is in trouble, and can a dev see their next ticket on the grid?
- **Keyboard and focus order, both themes, and widths 1280, 1440 and tablet.**
- **Copy:** verbs on buttons, no jargon, no placeholder text.
- I share screenshots at each frontend checkpoint so you can review them as the editor.

**4. Creativity: protect the strange.** These are the deliberate signature pieces:
- **The Trail:** each ticket's history drawn as a small path. Reported → Ongoing → Resolved → Pass, with a visible loop for every Failed return. It appears small in the ticket grid (fail count at a glance) and large at the top of the detail page, with the time spent on each segment. This turns "fail count" and "time taken" into a picture rather than two numbers.
- **The ticket's story:** the chat panel interleaves human messages with system events ("QA marked Failed, 2nd return", "Moved to Resolved after 3d 4h"). The conversation and the history are one timeline.
- **Keyboard-first:** `j`/`k` to move through the grid, `Enter` to open, `c` to report a bug, and `⌘K` for a command palette to jump to any project or ticket.
- **Project cards:** the pie is shown as a precise ring with the open count in the centre and an exact legend, and the trouble signal (failed or ageing tickets) gets the only accent colour on the card.

**Process:** Phase 7 starts with a **style tile** (type pair, palette, status glyphs, one project card, one ticket row, one Trail) built as a single page for your approval. We only build screens after the direction is agreed. I'll use the `frontend-design` skill for this step.

---

## 5. Build order
0. **Phase 0:** rename and clean both repos, scaffold the frontend, add `docs/PROJECT_PLAN.md`.
1. **Phase 1:** backend foundation (config, CORS + cookies, remove xss-clean, permission catalog, Role, User changes, `auth`/`authorize`, seed, auth flows, test setup).
2. **Phase 2:** users (with approval) + roles.
3. **Phase 3:** projects + members + scope helper + pie summary. *(2026-10-12: `GET /projects/:id/modules` moved to Phase 4, since it reads module names from bugs.)*
4. **Phase 4:** bugs, status rules, fail count, activity, time tracking, `GET /projects/:id/modules`.
5. **Phase 5:** Socket.IO, chat, notifications, `sendEmail` + email outbox.
6. **Phase 6:** dashboard endpoints + Swagger docs.
7. **Phase 7 (frontend):** style tile + tokens + templates (approval gate) → auth → layout → projects grid → ticket grid → report form → bug detail + chat → dashboard → users → roles → notifications.

Each phase is its own commit or PR: a conventional subject plus 2–5 bullets, with no AI attribution.

### Learning-first build (every phase)
1. **Why:** the concept and the problem it solves, plus the alternatives we rejected. For example: authentication vs authorization, why permissions aren't stored in the JWT, why chat is saved through REST and then broadcast, why email goes through an outbox.
2. **How:** build in small steps (model → validation → service → controller → route) and follow a request through each layer as we go.
3. **What:** a walkthrough of the changed files, how to try the feature yourself, and what could break in production.
4. **Notes:** a short note in `docs/learning/` (`01-project-setup`, `02-auth-and-rbac`, `03-project-scoping`, `04-bug-status-rules`, `05-realtime-chat-and-notifications`, `06-mongo-aggregations`, `07-frontend-architecture`, `08-design-system`, `09-deployment`) with the concepts, decisions, a request-flow diagram, and 2–3 exercises.
5. **Checkpoint:** I stop after each phase for your questions before moving on.

## 6. Verification
- `npm run lint` and `npm test` (Jest + supertest + mongodb-memory-server). Must-have tests:
  - 403s when a permission is missing
  - no data leaking between projects
  - escalation guards
  - every status move per role (e.g. a developer can't set Pass or Failed, QA can set anything)
  - `failCount` increments on Failed
  - `sendEmail` creates an outbox row only when true
  - chat access checks
  - Drive URL validation
  - pending users can't log in
- Manual flow after `npm run seed`:
  1. Register a user, have Admin approve them and assign a role.
  2. Create a project and add members.
  3. QA reports a ticket, once with "Send email" ticked and once without.
  4. The developer moves it Ongoing → Resolved.
  5. QA marks it Failed (fail count 1). The developer moves it Ongoing → Resolved again, and QA marks it Pass.
  6. Chat between the two in separate browsers.
  7. Check the pie chart, the dashboard cards, and the Age and Fail count columns.
- Frontend: `npm run lint`, `tsc --noEmit`, `npm run build`, then click through the flow as each role. Every screen also goes through the design editing checklist (section 4), with screenshots reviewed at each checkpoint.

## 7. Deployment (Railway or own VPS, no Docker)
Both targets run the same thing: **one API process** (REST + Socket.IO + outbox worker) and **one Next.js process**, plus MongoDB.

| | Railway | VPS |
|---|---|---|
| API | Railway service, Nixpacks build, `npm start` (PM2 `--no-daemon`), **1 replica** | PM2 (`ecosystem.config.json`, 1 instance), Nginx reverse proxy with WebSocket upgrade headers, Let's Encrypt TLS |
| Web | Railway service, `next build` with `output: 'standalone'` | PM2 runs `next start` behind the same Nginx |
| MongoDB | Railway Mongo plugin or MongoDB Atlas | MongoDB on the box (auth enabled, bound to localhost) or Atlas |
| Config | Railway variables | `.env` on the server (never committed) |

- **Use a custom domain on both** (`app.<domain>` for the web, `api.<domain>` for the API). The two default `*.up.railway.app` URLs count as different sites to the browser, so the refresh-token cookie would need `SameSite=None` plus CSRF protection. On subdomains of one domain, `SameSite=Lax` just works. The cookie settings come from env vars, so both setups are supported.
- Add a `GET /v1/health` endpoint (checks the DB connection) for Railway healthchecks and uptime monitoring.
- Phase 0 adds a short `docs/DEPLOYMENT.md` covering both paths. CI only runs lint and tests; deploys stay manual or use Railway's GitHub auto-deploy.

## 8. Open items
- Optional later ticket fields: priority/severity (not in the current form).
