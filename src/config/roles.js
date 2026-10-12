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
  QA: 'qa',
});

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
    permissions: ['dashboard:view', 'project:read', 'bug:read', 'bug:progress', 'chat:read', 'chat:send'],
  },
  [roles.QA]: {
    label: 'QA',
    description: 'Reports bugs and verifies fixes (Pass / Failed).',
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
});

const roleValues = Object.freeze(Object.values(roles));

/**
 * @param {string|null} role
 * @returns {string[]} the role's permissions (a copy); none for a user without a role
 */
const getRolePermissions = (role) => (role ? [...roleDefinitions[role].permissions] : []);

export { roles, roleValues, roleDefinitions, getRolePermissions };
