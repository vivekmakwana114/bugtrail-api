import { allPermissions } from './permissions.js';

/** Admin is the single system role: always the full catalog, cannot be edited or deleted. */
const ADMIN_ROLE_SLUG = 'admin';

/**
 * Roles created by `npm run seed` (see docs/PROJECT_PLAN.md §2 for the matrix).
 * The seed only inserts missing roles. It never overwrites permissions an Admin
 * has since edited, except Admin's own, which are always the full catalog.
 */
const defaultRoles = [
  {
    name: 'Admin',
    slug: ADMIN_ROLE_SLUG,
    description: 'Full access. Manages users, roles and every project.',
    isSystem: true,
    permissions: [...allPermissions],
  },
  {
    name: 'Project Manager',
    slug: 'project-manager',
    description: 'Runs projects and their members, triages and assigns bugs.',
    isSystem: false,
    permissions: [
      'dashboard:view',
      'dashboard:view_performance',
      'project:read',
      'project:update',
      'project:manage_members',
      'bug:create',
      'bug:read',
      'bug:update',
      'bug:assign',
      'bug:progress',
      'chat:read',
      'chat:send',
      'user:read',
    ],
  },
  {
    name: 'Developer',
    slug: 'developer',
    description: 'Works on assigned bugs: Reported → Ongoing → Resolved.',
    isSystem: false,
    permissions: ['dashboard:view', 'project:read', 'bug:read', 'bug:progress', 'chat:read', 'chat:send'],
  },
  {
    name: 'QA',
    slug: 'qa',
    description: 'Reports bugs and verifies fixes (Pass / Failed).',
    isSystem: false,
    permissions: [
      'dashboard:view',
      'dashboard:view_performance',
      'project:read',
      'bug:create',
      'bug:read',
      'bug:update',
      'bug:assign',
      'bug:progress',
      'bug:verify',
      'bug:set_any_status',
      'chat:read',
      'chat:send',
    ],
  },
];

export { ADMIN_ROLE_SLUG, defaultRoles };
