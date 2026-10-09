/**
 * Permission catalog: the single source of truth for every permission key.
 *
 * The catalog lives in code because a permission only means something when a route
 * or service checks it. Which role has which permissions is also code (roles.js); a user
 * only stores their role.
 *
 * Groups and labels let the web app show what a role can do in readable words.
 */
const permissionGroups = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [
      { key: 'dashboard:view', label: 'View dashboard' },
      { key: 'dashboard:view_performance', label: 'View developer performance' },
    ],
  },
  {
    key: 'project',
    label: 'Projects',
    permissions: [
      { key: 'project:create', label: 'Create projects' },
      { key: 'project:read', label: 'View own projects' },
      { key: 'project:update', label: 'Edit projects' },
      { key: 'project:delete', label: 'Delete projects' },
      { key: 'project:manage_members', label: 'Manage project members' },
      { key: 'project:read_all', label: 'View all projects (ignore membership)' },
    ],
  },
  {
    key: 'bug',
    label: 'Bugs',
    permissions: [
      { key: 'bug:create', label: 'Report bugs' },
      { key: 'bug:read', label: 'View bugs' },
      { key: 'bug:update', label: 'Edit bug details' },
      { key: 'bug:delete', label: 'Delete bugs' },
      { key: 'bug:assign', label: 'Assign bugs' },
      { key: 'bug:progress', label: 'Move own bugs Reported → Ongoing → Resolved' },
      { key: 'bug:verify', label: 'Mark bugs Pass / Failed' },
      { key: 'bug:set_any_status', label: 'Set any status' },
    ],
  },
  {
    key: 'chat',
    label: 'Bug chat',
    permissions: [
      { key: 'chat:read', label: 'Read bug chat' },
      { key: 'chat:send', label: 'Send chat messages' },
    ],
  },
  {
    key: 'user',
    label: 'Users',
    permissions: [
      { key: 'user:read', label: 'View users' },
      { key: 'user:create', label: 'Create users' },
      { key: 'user:update', label: 'Edit users' },
      { key: 'user:delete', label: 'Delete users' },
      { key: 'user:approve', label: 'Approve, reject and suspend users' },
    ],
  },
];

/** Flat list of every permission key, e.g. ['dashboard:view', ...] */
const allPermissions = Object.freeze(permissionGroups.flatMap((group) => group.permissions.map(({ key }) => key)));

const permissionSet = new Set(allPermissions);

/**
 * @param {string} key
 * @returns {boolean}
 */
const isValidPermission = (key) => permissionSet.has(key);

export { permissionGroups, allPermissions, isValidPermission };
