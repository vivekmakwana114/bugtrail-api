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

const collection = {
  info: {
    name: 'BugTrail APIs',
    description: [
      'BugTrail API, grouped by module. Start the API (`npm run dev`) and create the Admin (`npm run seed`), then:',
      '',
      '1. Set the collection variables `adminEmail` / `adminPassword` to the Admin you created in the seed.',
      '2. **Auth → Login** (saves `accessToken`).',
      '3. Anything else. Ids created along the way (`userId`, `pendingUserId`) are saved automatically.',
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
          'Always 204. With EMAIL_ENABLED=false the reset link is printed in the API console: copy its token into `resetToken`.',
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
        path: '/users?sortBy=name:asc&limit=10&page=1',
        tests: [ok()],
        description:
          'Requires `user:read`. Filters: name, role (admin | project_manager | developer | qa), status. Returns the compact summary shape.',
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
  ],
};

// Static path resolved relative to this module, not user input
// eslint-disable-next-line security/detect-non-literal-fs-filename
writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
console.log(
  `Wrote BugTrail.postman_collection.json: ${collection.item.map((f) => `${f.name} (${f.item.length})`).join(', ')}`,
);
