import httpStatus from 'http-status';
import ApiError from './ApiError.js';
import { roles, getRolePermissions } from '../config/roles.js';

/**
 * Escalation guards used by the user service.
 *
 * These are business rules, not route rules: they depend on *who* is acting and *what* the
 * target is, which a route-level authorize('...') can't know. That's why they live in the
 * service layer and take the acting user (`actor`) as an argument.
 */

/**
 * "You can't grant permissions you don't hold."
 * Admin holds the whole catalog, so this never blocks Admin.
 * @param {User} actor
 * @param {string[]} permissions - permissions being granted (or managed)
 * @param {string} [action] - wording for the error message
 */
const assertHoldsPermissions = (actor, permissions, action = 'grant') => {
  const held = new Set(actor.getPermissions());
  const missing = permissions.filter((perm) => !held.has(perm));
  if (missing.length) {
    throw new ApiError(httpStatus.FORBIDDEN, `You can't ${action} permissions you don't hold: ${missing.join(', ')}`);
  }
};

/**
 * You may only act on (edit, change status, delete) users who are not more powerful than you.
 * Without this, anyone with user:update could reset a more powerful user's password, log in
 * as them, and inherit their permissions: the Admin's, or a QA's bug:verify.
 * @param {User} actor
 * @param {User} target
 */
const assertCanManageUser = (actor, target) => {
  if (target.isAdmin() && !actor.isAdmin()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only an Admin can manage an Admin user');
  }
  assertHoldsPermissions(actor, target.getPermissions(), 'manage a user with');
};

/**
 * Assigning a role grants everything that role can do, so the same rule applies as granting
 * permissions directly: only an Admin hands out Admin, and nobody hands out more than they hold.
 * (Today only Admin can assign roles at all; this keeps it safe if, say, PMs get user:approve.)
 * @param {User} actor
 * @param {string} role - roles enum value
 */
const assertCanAssignRole = (actor, role) => {
  if (role === roles.ADMIN && !actor.isAdmin()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only an Admin can assign the Admin role');
  }
  assertHoldsPermissions(actor, getRolePermissions(role), 'assign a role with');
};

/**
 * @param {User} actor
 * @param {ObjectId|string} targetId
 * @param {string} message
 */
const assertNotSelf = (actor, targetId, message) => {
  if (actor._id.equals(targetId)) {
    throw new ApiError(httpStatus.FORBIDDEN, message);
  }
};

export { assertHoldsPermissions, assertCanManageUser, assertCanAssignRole, assertNotSelf };
