import { roleService } from '../../src/services/index.js';

/**
 * Insert the default roles (same code path as `npm run seed`).
 * @returns {Promise<Record<string, Role>>} roles keyed by slug, e.g. roles.admin, roles.qa
 */
const insertDefaultRoles = async () => {
  const roles = await roleService.ensureDefaultRoles();
  return Object.fromEntries(roles.map((role) => [role.slug, role]));
};

export { insertDefaultRoles };
