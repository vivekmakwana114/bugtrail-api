import { allPermissions } from './permissions.js';

/**
 * Roles are a fixed enum stored on the User (there is no Role collection).
 * An approver picks one when activating a user. What each role can do is defined here,
 * in code: permissions are derived from the role and never stored or edited per user.
 */
const roles = Object.freeze({
  ADMIN: 'admin',
  PROJECT_MANAGER: 'project_manager',
  DEVELOPER: 'developer',
  UI_UX: 'ui_ux',
  QA: 'qa',
});

/** Fixing bugs: shared by Developer and UI/UX (designers fix UI bugs the same way). */
const BUG_FIXER_PERMISSIONS = ['dashboard:view', 'project:read', 'bug:read', 'bug:progress', 'chat:read', 'chat:send'];

/**
 * What each role can do. Changing a role's permissions is a code change (reviewed in a PR,
 * applied on deploy) and affects every user with that role at once.
 * Admin always has the whole catalog, so new permissions reach Admin automatically.
 */
const roleDefinitions = Object.freeze({
  [roles.ADMIN]: {
    label: 'Admin',
    description: 'Full access. Manages users and every project.',
    permissions: allPermissions,
  },
  [roles.PROJECT_MANAGER]: {
    label: 'Project Manager',
    description: 'Runs projects and their members, triages and assigns bugs.',
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
  [roles.DEVELOPER]: {
    label: 'Developer',
    description: 'Works on assigned bugs: Reported → Ongoing → Resolved.',
    permissions: BUG_FIXER_PERMISSIONS,
  },
  // Added 2026-10-13: same permissions as Developer, for designers fixing UI/UX bugs.
  [roles.UI_UX]: {
    label: 'UI/UX',
    description: 'Works on assigned design and UI bugs: Reported → Ongoing → Resolved.',
    permissions: BUG_FIXER_PERMISSIONS,
  },
  [roles.QA]: {
    label: 'QA',
    description: 'Reports bugs and verifies fixes (Pass / Failed). Sets up projects and their members.',
    // Project and delete rights added 2026-10-15: QA sets up the projects it tests and cleans up bugs.
    permissions: [
      'dashboard:view',
      'dashboard:view_performance',
      'project:create',
      'project:read',
      'project:update',
      'project:manage_members',
      'bug:create',
      'bug:read',
      'bug:update',
      'bug:delete',
      'bug:assign',
      'bug:progress',
      'bug:verify',
      'bug:set_any_status',
      'chat:read',
      'chat:send',
    ],
  },
});

const roleValues = Object.freeze(Object.values(roles));

/**
 * @param {string|null} role
 * @returns {string[]} the role's permissions (a copy); none for a user without a role
 */
const getRolePermissions = (role) => (role ? [...roleDefinitions[role].permissions] : []);

/**
 * Roles that hold a permission, e.g. who to notify about a pending registration ('user:approve').
 * Asking by permission (not "notify admins") keeps it right if the matrix changes.
 * @param {string} permission
 * @returns {string[]}
 */
const getRolesWithPermission = (permission) =>
  roleValues.filter((role) => roleDefinitions[role].permissions.includes(permission));

export { roles, roleValues, roleDefinitions, getRolePermissions, getRolesWithPermission };
