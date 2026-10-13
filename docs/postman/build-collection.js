/* eslint-disable no-console */
/**
 * Source of truth for the Postman collection. Edit the requests here, then run
 *   npm run postman
 * to regenerate BugTrail.postman_collection.json (Postman v2.1) next to this file.
 * Every phase that adds or changes an endpoint updates this file in the same commit.
 */
import { writeFileSync } from 'fs';

const out = new URL('./BugTrail.postman_collection.json', import.meta.url);

const ok = (code = 200) => `pm.test('Status is ${code}', () => pm.response.to.have.status(${code}));`;
const saveVar = (name, expr) => `if (pm.response.code < 300) { pm.collectionVariables.set('${name}', ${expr}); }`;
const saveAccessToken = saveVar('accessToken', 'pm.response.json().tokens.access.token');

/**
 * @param {Object} r
 * @param {string} r.name
 * @param {string} r.method
 * @param {string} r.path - after {{baseUrl}}, may include ?query
 * @param {Object} [r.body]
 * @param {string[]} [r.tests]
 * @param {boolean} [r.noAuth]
 * @param {string} [r.description]
 */
const req = ({ name, method, path, body, tests = [], prerequest = [], noAuth = false, description = '' }) => {
  const [pathname, query = ''] = path.split('?');
  const item = {
    name,
    request: {
      method,
      header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: {
        raw: `{{baseUrl}}${path}`,
        host: ['{{baseUrl}}'],
        path: pathname.split('/').filter(Boolean),
        ...(query && {
          query: query.split('&').map((pair) => {
            const [key, value] = pair.split('=');
            return { key, value };
          }),
        }),
      },
      description,
    },
    response: [],
  };
  if (noAuth) item.request.auth = { type: 'noauth' };
  if (body) item.request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  item.event = [];
  if (prerequest.length) item.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: prerequest } });
  if (tests.length) item.event.push({ listen: 'test', script: { type: 'text/javascript', exec: tests } });
  return item;
};

const folder = (name, description, item) => ({ name, description, item });

/**
 * Project keys are unique forever (deleted projects keep theirs), so each run makes a fresh one.
 * @param {string} variable - collection variable to store it in
 */
const randomProjectKey = (variable) => [
  "const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';",
  "let key = 'P';",
  'for (let i = 0; i < 5; i += 1) { key += letters[Math.floor(Math.random() * letters.length)]; }',
  `pm.collectionVariables.set('${variable}', key);`,
];

const collection = {
  info: {
    name: 'BugTrail APIs',
    description: [
      'BugTrail API, grouped by module. Start the API (`npm run dev`) and create the Admin (`npm run seed`), then:',
      '',
      '1. Set the collection variables `adminEmail` / `adminPassword` to the Admin you created in the seed.',
      '2. **Auth → Login** (saves `accessToken`).',
      '3. Anything else. Ids created along the way (`userId`, `pendingUserId`, `projectId`, `bugId`) are saved automatically.',
      'Or just **Run collection**: the folders are ordered so a full top-to-bottom run passes against a freshly seeded API.',
      '',
      'Roles are fixed values: admin, project_manager, developer, qa. What each role can do is defined in code',
      '(see **Roles → Access catalog**); permissions are never sent in requests.',
      '',
      'Every request sends `Authorization: Bearer {{accessToken}}` (collection-level auth) unless it says "No auth".',
      'The refresh token is an httpOnly cookie: Postman keeps it in its cookie jar, so **Auth → Refresh tokens** works like a browser.',
      'When the access token expires (30 min) you get 401: run Refresh tokens or Login again.',
      '',
      'Swagger with full schemas: {{baseUrl}}/docs (development only).',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5000/v1' },
    { key: 'adminEmail', value: 'admin@example.com' },
    { key: 'adminPassword', value: 'change-me-123' },
    { key: 'accessToken', value: '' },
    { key: 'userId', value: '' },
    { key: 'pendingUserId', value: '' },
    { key: 'resetToken', value: '' },
    { key: 'projectId', value: '' },
    { key: 'projectKey', value: '' },
    { key: 'bugProjectId', value: '' },
    { key: 'bugProjectKey', value: '' },
    { key: 'bugId', value: '' },
    { key: 'bugKey', value: '' },
    { key: 'chatProjectId', value: '' },
    { key: 'chatProjectKey', value: '' },
    { key: 'chatBugId', value: '' },
    { key: 'messageId', value: '' },
    { key: 'notificationId', value: '' },
  ],
  item: [
    folder('Health', 'Liveness + MongoDB check. No auth.', [
      req({ name: 'Health check', method: 'GET', path: '/health', noAuth: true, tests: [ok()] }),
    ]),

    folder('Auth', 'Login, session refresh (httpOnly cookie), registration, password flows and the current user.', [
      req({
        name: 'Login',
        method: 'POST',
        path: '/auth/login',
        noAuth: true,
        body: { email: '{{adminEmail}}', password: '{{adminPassword}}' },
        tests: [ok(), saveAccessToken],
        description:
          'Returns the user (with role and permissions) and an access token; sets the `refreshToken` httpOnly cookie. Pending/suspended/rejected accounts get 403.',
      }),
      req({
        name: 'Me',
        method: 'GET',
        path: '/auth/me',
        tests: [ok()],
        description: 'Current user with role and the permissions it grants.',
      }),
      req({
        name: 'Refresh tokens',
        method: 'POST',
        path: '/auth/refresh-tokens',
        noAuth: true,
        tests: [ok(), saveAccessToken],
        description: 'No body: uses the `refreshToken` cookie from Login and rotates it.',
      }),
      req({
        name: 'Register (pending account)',
        method: 'POST',
        path: '/auth/register',
        noAuth: true,
        body: { name: 'New Developer', email: 'dev.{{$timestamp}}@example.com', password: 'password1' },
        tests: [ok(201), saveVar('pendingUserId', 'pm.response.json().user.id')],
        description: 'Creates a `pending` user with no role. They can log in only after Users → Approve pending user.',
      }),
      req({
        name: 'Change password',
        method: 'POST',
        path: '/auth/change-password',
        body: { currentPassword: '{{adminPassword}}', newPassword: 'new-password-123' },
        tests: [ok(), saveAccessToken],
        description:
          'Signs out other sessions and keeps this one (new cookie + access token). Followed by "Change password back" so the seed Admin keeps its password.',
      }),
      req({
        name: 'Change password back',
        method: 'POST',
        path: '/auth/change-password',
        body: { currentPassword: 'new-password-123', newPassword: '{{adminPassword}}' },
        tests: [ok(), saveAccessToken],
        description: 'Restores adminPassword so the collection can be re-run.',
      }),
      req({
        name: 'Forgot password',
        method: 'POST',
        path: '/auth/forgot-password',
        noAuth: true,
        body: { email: '{{adminEmail}}' },
        tests: [ok(204)],
        description:
          'Always 204. With SMTP_HOST empty the reset link is printed in the API console: copy its token into `resetToken`.',
      }),
      req({
        name: 'Reset password',
        method: 'POST',
        path: '/auth/reset-password?token={{resetToken}}',
        prerequest: ["if (!pm.collectionVariables.get('resetToken')) { pm.execution.skipRequest(); }"],
        noAuth: true,
        body: { password: 'new-password-123' },
        tests: [ok(204), "pm.collectionVariables.set('resetToken', '');"],
        description:
          'Sets a new password and signs out every session. Skipped automatically while `resetToken` is empty (copy it from the API console after Forgot password). Remember to update `adminPassword` after using it.',
      }),
      req({
        name: 'Logout',
        method: 'POST',
        path: '/auth/logout',
        noAuth: true,
        tests: [ok(204)],
        description:
          'Revokes the refresh token in the cookie and clears it. Idempotent. Note: the access token stays valid until it expires (max 30 min). Access tokens are stateless, which is why they are short-lived. The web app simply forgets it.',
      }),
    ]),

    folder(
      'Roles',
      'Roles are a fixed list on the user (no roles table); permissions follow from the role. Read-only catalog served from code.',
      [
        req({
          name: 'Access catalog',
          method: 'GET',
          path: '/roles',
          tests: [ok()],
          description: 'The four roles with what each can do, plus the grouped permission labels. Any signed-in user.',
        }),
      ],
    ),

    folder('Users', 'User management, the approval queue and your own profile.', [
      req({
        name: 'List users',
        method: 'GET',
        path: '/users?search=a&sortBy=name:asc&limit=10&page=1',
        tests: [ok()],
        description:
          'Requires `user:read`. Filters: search (part of the name or email, case-insensitive), name (exact), role (admin | project_manager | developer | qa), status. Each row is the summary plus createdAt and lastLoginAt.',
      }),
      req({
        name: 'List pending users (approval queue)',
        method: 'GET',
        path: '/users?status=pending',
        tests: [ok()],
      }),
      req({
        name: 'Create user',
        method: 'POST',
        path: '/users',
        body: { name: 'Dana Developer', email: 'dana.{{$timestamp}}@example.com', password: 'password1', role: 'developer' },
        tests: [ok(201), saveVar('userId', 'pm.response.json().id')],
        description: 'Requires `user:create`. Created active. Permissions follow from the role.',
      }),
      req({ name: 'Get user', method: 'GET', path: '/users/{{userId}}', tests: [ok()] }),
      req({
        name: 'Update user',
        method: 'PATCH',
        path: '/users/{{userId}}',
        body: { name: 'Dana D.', role: 'qa' },
        tests: [ok()],
        description:
          "Requires `user:update`. Changing the role changes what the user can do on their next request. You can't manage a user with permissions you don't hold, or change your own role. Setting `password` signs the user out.",
      }),
      req({
        name: 'Reject pending user',
        method: 'PATCH',
        path: '/users/{{pendingUserId}}/status',
        body: { status: 'rejected' },
        tests: [ok()],
        description: 'pending → rejected. A rejected user can still be approved later (next request).',
      }),
      req({
        name: 'Approve user',
        method: 'PATCH',
        path: '/users/{{pendingUserId}}/status',
        body: { status: 'active', role: 'developer' },
        tests: [ok()],
        description:
          'Requires `user:approve`. pending/rejected → active needs a role. Run Auth → Register first to fill `pendingUserId`.',
      }),
      req({
        name: 'Suspend user',
        method: 'PATCH',
        path: '/users/{{userId}}/status',
        body: { status: 'suspended' },
        tests: [ok()],
        description: 'Ends their sessions immediately. The last active Admin can never be suspended.',
      }),
      req({
        name: 'Reactivate user',
        method: 'PATCH',
        path: '/users/{{userId}}/status',
        body: { status: 'active' },
        tests: [ok()],
        description: 'Keeps the role the user had.',
      }),
      req({
        name: 'Update my profile',
        method: 'PATCH',
        path: '/users/me',
        body: { name: 'BugTrail Admin', avatarUrl: null },
        tests: [ok()],
        description: 'Name and avatar only. Password → Auth → Change password.',
      }),
      req({
        name: 'Delete user',
        method: 'DELETE',
        path: '/users/{{userId}}',
        tests: [ok(204)],
        description: "Requires `user:delete`. You can't delete yourself or the last active Admin. Prefer suspending.",
      }),
    ]),

    folder(
      'Projects',
      "Projects, members and the bug summary behind each card's pie. You see the projects you're a member of; Admin (project:read_all) sees all. A project outside your scope is a 404.",
      [
        req({
          name: 'Create project',
          method: 'POST',
          path: '/projects',
          prerequest: randomProjectKey('projectKey'),
          body: { name: 'Demo project {{projectKey}}', key: '{{projectKey}}', description: 'Created from Postman' },
          tests: [ok(201), saveVar('projectId', 'pm.response.json().id')],
          description:
            'Requires `project:create` (Admin). `key` (2-10 letters/digits, starts with a letter) prefixes every bug key (BT-42); stored uppercase, unique, never changes. Optional: `manager` (a PM or Admin, auto-added as member), `members` (active user ids), `status`.',
        }),
        req({
          name: 'List projects',
          method: 'GET',
          path: '/projects?sortBy=name:asc&limit=10&page=1',
          tests: [ok()],
          description:
            'Requires `project:read`. Filters: status (active | completed | archived), search (name or key). Each item has `bugSummary` (byStatus counts, open count and the 3-slice `pie`).',
        }),
        req({
          name: 'Get project',
          method: 'GET',
          path: '/projects/{{projectId}}',
          tests: [ok()],
          description: 'Detail with description, manager and members.',
        }),
        req({
          name: 'Update project',
          method: 'PATCH',
          path: '/projects/{{projectId}}',
          body: { description: 'Updated from Postman', status: 'active' },
          tests: [ok()],
          description:
            "Requires `project:update` (PM within their projects, Admin). Name, description, status, manager. The key can't change; a new manager must already be a member.",
        }),
        req({
          name: 'Add members',
          method: 'POST',
          path: '/projects/{{projectId}}/members',
          body: { userIds: ['{{pendingUserId}}'] },
          tests: [ok()],
          description:
            'Requires `project:manage_members`. Idempotent; only active users. Uses the user approved in Users → Approve user. Returns the full member list.',
        }),
        req({
          name: 'Module names (autocomplete)',
          method: 'GET',
          path: '/projects/{{projectId}}/modules',
          tests: [ok()],
          description: "Distinct module/screen names used in the project's bugs, for the report form. Empty here: see Bugs.",
        }),
        req({
          name: 'Remove member',
          method: 'DELETE',
          path: '/projects/{{projectId}}/members/{{pendingUserId}}',
          tests: [ok()],
          description: "The project manager can't be removed; change the manager first. Returns the full member list.",
        }),
        req({
          name: 'Delete project',
          method: 'DELETE',
          path: '/projects/{{projectId}}',
          tests: [ok(204)],
          description:
            'Requires `project:delete` (Admin). Soft delete: hidden everywhere, history kept, key stays reserved.',
        }),
      ],
    ),

    folder(
      'Bugs',
      [
        'Tickets, the status workflow, assignment and the timeline. Self-contained: it creates its own project, walks one bug',
        "through the whole lifecycle (including a QA fail) and cleans up. As Admin every move is allowed; the bug's",
        '`allowedStatuses` shows what the current user may do. A developer (the assignee) may only do',
        'reported → ongoing → resolved and failed → ongoing.',
      ].join(' '),
      [
        req({
          name: 'Setup: create a project with a member',
          method: 'POST',
          path: '/projects',
          prerequest: randomProjectKey('bugProjectKey'),
          body: { name: 'Bug demo {{bugProjectKey}}', key: '{{bugProjectKey}}', members: ['{{pendingUserId}}'] },
          tests: [ok(201), saveVar('bugProjectId', 'pm.response.json().id')],
          description: 'The member is the developer approved in Users → Approve user; the bug gets assigned to them.',
        }),
        req({
          name: 'Report bug',
          method: 'POST',
          path: '/bugs',
          body: {
            project: '{{bugProjectId}}',
            title: 'Login button does nothing on Safari',
            moduleName: 'Login',
            description: '1. Open /login in Safari\n2. Enter valid credentials\n3. Click "Sign in": nothing happens',
            attachments: [{ title: 'Screen recording', url: 'https://drive.google.com/file/d/demo/view' }],
            assignee: '{{pendingUserId}}',
            sendEmail: false,
          },
          tests: [
            ok(201),
            saveVar('bugId', 'pm.response.json().id'),
            saveVar('bugKey', 'pm.response.json().key'),
            "pm.test('Key is <PROJECT>-1', () => pm.expect(pm.response.json().key).to.eql(pm.collectionVariables.get('bugProjectKey') + '-1'));",
          ],
          description:
            'Requires `bug:create`. Gets the next number (key like BT-42). Status defaults to reported. Attachments: Google Drive links only. `sendEmail` (the "Send email" checkbox) is accepted now; emails arrive in Phase 5.',
        }),
        req({
          name: 'List bugs (ticket grid)',
          method: 'GET',
          path: '/bugs?projectId={{bugProjectId}}&sortBy=age:desc&limit=20&page=1',
          tests: [ok()],
          description:
            'Requires `bug:read`. Filters: status (comma-separated), assignee (id | me | none), moduleName, search (title/module, or a key like BT-42). sortBy: age | failCount | updatedAt | createdAt | bugNumber. Without projectId: every project you can see.',
        }),
        req({
          name: 'My open bugs',
          method: 'GET',
          path: '/bugs?assignee=me&status=reported,ongoing,failed',
          tests: [ok()],
        }),
        req({
          name: 'Get bug by key',
          method: 'GET',
          path: '/bugs/{{bugKey}}',
          tests: [ok()],
          description:
            'Id or key. Includes `allowedStatuses` for you, `timeInStatus` (ms per status) and `ageMs` (created until passed, or now).',
        }),
        req({
          name: 'Update bug',
          method: 'PATCH',
          path: '/bugs/{{bugId}}',
          body: { title: 'Login button does nothing on Safari 17' },
          tests: [ok()],
          description:
            'Requires `bug:update`. Title, module, description, attachments. Status and assignee have their own endpoints.',
        }),
        req({
          name: 'Module names (autocomplete)',
          method: 'GET',
          path: '/projects/{{bugProjectId}}/modules',
          tests: [ok(), "pm.test('Has Login', () => pm.expect(pm.response.json().modules).to.include('Login'));"],
        }),
        ...[
          ['Start work (→ ongoing)', 'ongoing', 0],
          ['Resolve (→ resolved)', 'resolved', 0],
          ['QA: fail it (→ failed, failCount 1)', 'failed', 1],
          ['Back to work (→ ongoing)', 'ongoing', 1],
          ['Resolve again (→ resolved)', 'resolved', 1],
          ['QA: pass it (→ pass)', 'pass', 1],
        ].map(([name, status, failCount]) =>
          req({
            name,
            method: 'PATCH',
            path: '/bugs/{{bugId}}/status',
            body: { status, sendEmail: false },
            tests: [
              ok(),
              `pm.test('failCount is ${failCount}', () => pm.expect(pm.response.json().failCount).to.eql(${failCount}));`,
            ],
            description:
              'The move must be in your `allowedStatuses`: 403 otherwise, 409 if someone else changed the bug first. Every move to failed adds 1 to failCount.',
          }),
        ),
        req({
          name: 'Unassign',
          method: 'PATCH',
          path: '/bugs/{{bugId}}/assign',
          body: { assignee: null, sendEmail: false },
          tests: [ok()],
          description:
            'Requires `bug:assign`. The assignee must be an active project member who can work on bugs; null unassigns.',
        }),
        req({
          name: 'Activity (timeline)',
          method: 'GET',
          path: '/bugs/{{bugId}}/activity',
          tests: [ok()],
          description: 'Oldest first: created, assigned, every status change, edits.',
        }),
        req({
          name: 'Delete bug',
          method: 'DELETE',
          path: '/bugs/{{bugId}}',
          tests: [ok(204)],
          description: 'Requires `bug:delete` (Admin). Soft delete: its number is never reused.',
        }),
        req({
          name: 'Cleanup: delete the project',
          method: 'DELETE',
          path: '/projects/{{bugProjectId}}',
          tests: [ok(204)],
        }),
      ],
    ),

    folder(
      'Chat',
      [
        'Messages on a bug. Saved through REST, then broadcast over Socket.IO to everyone with the bug open',
        '(message:new / message:updated / message:deleted). To watch them live, run',
        '`npm run realtime:listen -- <accessToken> <bugId>` in a terminal while you send these.',
        'Self-contained: creates a project and a bug, then cleans up.',
      ].join(' '),
      [
        req({
          name: 'Setup: create a project with a member',
          method: 'POST',
          path: '/projects',
          prerequest: randomProjectKey('chatProjectKey'),
          body: { name: 'Chat demo {{chatProjectKey}}', key: '{{chatProjectKey}}', members: ['{{pendingUserId}}'] },
          tests: [ok(201), saveVar('chatProjectId', 'pm.response.json().id')],
        }),
        req({
          name: 'Setup: report a bug',
          method: 'POST',
          path: '/bugs',
          body: {
            project: '{{chatProjectId}}',
            title: 'Checkout total is wrong',
            moduleName: 'Checkout',
            assignee: '{{pendingUserId}}',
          },
          tests: [ok(201), saveVar('chatBugId', 'pm.response.json().id')],
          description: 'The assignee (the developer approved in Users) gets a bug_assigned notification.',
        }),
        req({
          name: 'Send message (with a mention)',
          method: 'POST',
          path: '/bugs/{{chatBugId}}/messages',
          body: { body: 'Can you check this on mobile too?', mentions: ['{{pendingUserId}}'] },
          tests: [ok(201), saveVar('messageId', 'pm.response.json().id')],
          description:
            'Requires `chat:send`. Mentions must be project members (others are ignored). Mentioned users get bug_mentioned; the assignee and reporter get bug_message, except whoever has the bug open right now.',
        }),
        req({
          name: 'List messages (latest page)',
          method: 'GET',
          path: '/bugs/{{chatBugId}}/messages?limit=30',
          tests: [ok()],
          description:
            "Requires `chat:read`. Oldest first within the page. If `nextCursor` isn't null, load older messages with `?before={nextCursor}`.",
        }),
        req({
          name: 'Edit message',
          method: 'PATCH',
          path: '/messages/{{messageId}}',
          body: { body: 'Can you check this on mobile (iOS and Android) too?' },
          tests: [ok()],
          description: "Your own messages only (403 otherwise). Sets `editedAt`; mentions aren't re-notified.",
        }),
        req({
          name: 'Delete message',
          method: 'DELETE',
          path: '/messages/{{messageId}}',
          tests: [ok(204)],
          description: 'Your own messages only. It stays in the thread as a tombstone: `deleted: true`, `body: null`.',
        }),
        req({
          name: 'Cleanup: delete the bug',
          method: 'DELETE',
          path: '/bugs/{{chatBugId}}',
          tests: [ok(204)],
        }),
        req({
          name: 'Cleanup: delete the project',
          method: 'DELETE',
          path: '/projects/{{chatProjectId}}',
          tests: [ok(204)],
        }),
      ],
    ),

    folder(
      'Notifications',
      'Your bell: always your own notifications. New ones also arrive live as `notification:new`. Auth → Register gave the Admin a "waiting for approval" notification, so this folder has something to show.',
      [
        req({
          name: 'List notifications',
          method: 'GET',
          path: '/notifications?limit=10&page=1',
          tests: [
            ok(),
            "const first = pm.response.json().results[0]; if (first) { pm.collectionVariables.set('notificationId', first.id); }",
          ],
          description: 'Newest first. `?unread=true` for unread only. Each has `link` (a web app path) and `entity`.',
        }),
        req({ name: 'Unread count', method: 'GET', path: '/notifications/unread-count', tests: [ok()] }),
        req({
          name: 'Mark one read',
          method: 'PATCH',
          path: '/notifications/{{notificationId}}/read',
          prerequest: ["if (!pm.collectionVariables.get('notificationId')) { pm.execution.skipRequest(); }"],
          tests: [ok()],
          description: 'Skipped when you have no notifications yet.',
        }),
        req({ name: 'Mark all read', method: 'PATCH', path: '/notifications/read-all', tests: [ok(204)] }),
      ],
    ),

    folder(
      'Dashboard',
      [
        'Dashboard numbers, limited to the projects you can see. Filters on every request: `projectId`,',
        '`from` / `to` (when the bug was reported: `2026-10-12` or an ISO date-time; a date-only `to` covers the whole day, UTC).',
        'The other folders clean up after themselves, so on a fresh database most numbers are 0: report a few bugs to see them move.',
      ].join(' '),
      [
        req({
          name: 'Summary (top cards)',
          method: 'GET',
          path: '/dashboard/summary',
          tests: [ok()],
          description: 'Requires `dashboard:view`. Projects by status, and bugs by status with total/open and the pie.',
        }),
        req({
          name: 'Summary for a date range',
          method: 'GET',
          path: '/dashboard/summary?from=2026-01-01&to=2026-12-31',
          tests: [ok()],
          description: 'Bugs reported in 2026. Project counts are not date-filtered.',
        }),
        req({
          name: 'Bug status chart',
          method: 'GET',
          path: '/dashboard/bug-status',
          tests: [ok(), "pm.test('Five statuses', () => pm.expect(pm.response.json().statuses).to.have.length(5));"],
        }),
        req({
          name: 'Developer performance',
          method: 'GET',
          path: '/dashboard/developer-performance',
          tests: [ok()],
          description:
            'Requires `dashboard:view_performance` (QA, PM, Admin). Per current assignee: assigned, open, passed, totalFails, firstPassRate, avgTimeToPassMs.',
        }),
        req({
          name: 'Slowest open tickets',
          method: 'GET',
          path: '/dashboard/slowest-tickets?open=true&limit=10',
          tests: [ok()],
          description: 'Top tickets by age (reported until passed, or now). `open=true` leaves out passed ones.',
        }),
      ],
    ),
  ],
};

// Static path resolved relative to this module, not user input
// eslint-disable-next-line security/detect-non-literal-fs-filename
writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
console.log(
  `Wrote BugTrail.postman_collection.json: ${collection.item.map((f) => `${f.name} (${f.item.length})`).join(', ')}`,
);
