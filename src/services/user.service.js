import httpStatus from 'http-status';
import { Token, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { userStatuses, allowedStatusTransitions } from '../config/userStatuses.js';
import { roles } from '../config/roles.js';
import { tokenTypes } from '../config/tokens.js';
import { assertCanAssignRole, assertCanManageUser, assertNotSelf } from '../utils/accessGuards.js';

/*
 * Two kinds of functions live here:
 *  - raw ones (createUser, updateUserById, ...) used by register, seed and reset-password,
 *    where no human is acting on someone else;
 *  - actor-aware ones (createUserAsActor, updateUserAsActor, ...) used by the admin endpoints.
 *    They take the acting user first and enforce the escalation guards.
 */

/* ------------------------------------------------------------------ helpers */

/**
 * @param {ObjectId|string} userId
 * @returns {Promise<User>}
 */
const getUserOrThrow = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  return user;
};

/**
 * Block any change that would leave the system with no active Admin.
 * Call it before suspending, deleting or demoting `target`.
 * Note: two Admins acting on each other at the same instant can both pass this check;
 * see docs/learning/02-auth-and-rbac.md for why we accept that and how to recover.
 * @param {User} target - in its CURRENT state
 */
const assertNotLastActiveAdmin = async (target) => {
  if (!target.isAdmin() || target.status !== userStatuses.ACTIVE) {
    return;
  }
  const activeAdmins = await User.countDocuments({ role: roles.ADMIN, status: userStatuses.ACTIVE });
  if (activeAdmins <= 1) {
    throw new ApiError(httpStatus.CONFLICT, 'This is the last active Admin. Make another user Admin first.');
  }
};

/**
 * End every session of a user (refresh tokens). Their access token already stops working
 * on the next request if their status is no longer active (see config/passport.js).
 * @param {ObjectId} userId
 */
const revokeSessions = async (userId) => {
  await Token.deleteMany({ user: userId, type: tokenTypes.REFRESH });
};

/* ------------------------------------------------------------------ raw */

/**
 * Create a user (no actor checks)
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  return User.create(userBody);
};

/**
 * Query for users
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async (filter, options) => {
  return User.paginate(filter, options);
};

/**
 * @param {ObjectId} id
 * @returns {Promise<User>}
 */
const getUserById = async (id) => {
  return User.findById(id);
};

/**
 * @param {string} email
 * @returns {Promise<User>}
 */
const getUserByEmail = async (email) => {
  return User.findOne({ email });
};

/**
 * Update user by id (no actor checks)
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async (userId, updateBody) => {
  const user = await getUserOrThrow(userId);
  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  Object.assign(user, updateBody);
  await user.save();
  return user;
};

/**
 * First-run setup (npm run seed): create the Admin, unless an active Admin already exists.
 * @param {{ email: string, password: string, name?: string }} adminBody
 * @returns {Promise<{ created: boolean, user: User }>}
 */
const createFirstAdmin = async ({ email, password, name = 'Admin' }) => {
  const existing = await User.findOne({ role: roles.ADMIN, status: userStatuses.ACTIVE });
  if (existing) {
    return { created: false, user: existing };
  }
  const user = await createUser({ name, email, password, role: roles.ADMIN, status: userStatuses.ACTIVE });
  return { created: true, user };
};

/* ------------------------------------------------------------------ actor-aware */

/**
 * Admin-created users are active immediately (they skip the approval queue).
 * @param {User} actor
 * @param {Object} userBody - name, email, password, role
 * @returns {Promise<User>}
 */
const createUserAsActor = async (actor, userBody) => {
  assertCanAssignRole(actor, userBody.role);
  return createUser({ ...userBody, status: userStatuses.ACTIVE });
};

/**
 * @param {User} actor
 * @param {ObjectId} userId
 * @param {Object} updateBody - name, email, password, avatarUrl, role
 * @returns {Promise<User>}
 */
const updateUserAsActor = async (actor, userId, { role, ...profile }) => {
  const target = await getUserOrThrow(userId);
  assertCanManageUser(actor, target);

  if (role && role !== target.role) {
    assertNotSelf(actor, target._id, "You can't change your own role");
    assertCanAssignRole(actor, role);
    if (role !== roles.ADMIN) {
      await assertNotLastActiveAdmin(target);
    }
    target.role = role;
  }
  if (profile.email && (await User.isEmailTaken(profile.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  Object.assign(target, profile);
  await target.save();
  // Someone else set this user's password: end the user's existing sessions.
  if (profile.password) {
    await revokeSessions(target._id);
  }
  return target;
};

/**
 * Approve, reject, suspend or reactivate a user.
 * Activating grants access, so it needs a role (sent, or one the user already has) and
 * goes through the same role-assignment guard as any other role change.
 * @param {User} actor
 * @param {ObjectId} userId
 * @param {{ status: string, role?: string }} body
 * @returns {Promise<User>}
 */
const updateUserStatusAsActor = async (actor, userId, { status, role }) => {
  assertNotSelf(actor, userId, "You can't change your own status");
  const target = await getUserOrThrow(userId);
  assertCanManageUser(actor, target);

  if (!allowedStatusTransitions[target.status].includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Can't change status from ${target.status} to ${status}`);
  }

  if (status === userStatuses.ACTIVE) {
    const nextRole = role ?? target.role;
    if (!nextRole) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Assign a role to approve this user');
    }
    assertCanAssignRole(actor, nextRole);
    target.role = nextRole;
  } else if (role) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A role can only be set when activating a user');
  }

  if (target.status === userStatuses.ACTIVE) {
    await assertNotLastActiveAdmin(target);
  }

  target.status = status;
  await target.save();
  if (status !== userStatuses.ACTIVE) {
    await revokeSessions(target._id);
  }
  // TODO(Phase 5): notify the user in-app, and queue the approval/rejection email in the outbox.
  return target;
};

/**
 * Hard delete. Prefer suspending: it keeps the user's history and can be undone.
 * TODO(Phase 4): block deleting users who reported or are assigned bugs.
 * @param {User} actor
 * @param {ObjectId} userId
 */
const deleteUserAsActor = async (actor, userId) => {
  assertNotSelf(actor, userId, "You can't delete your own account");
  const target = await getUserOrThrow(userId);
  assertCanManageUser(actor, target);
  await assertNotLastActiveAdmin(target);
  await Token.deleteMany({ user: target._id });
  await target.deleteOne();
};

/**
 * Self-service profile edit. Deliberately narrow: no email, role or status.
 * Password changes go through POST /auth/change-password (it needs the refresh cookie).
 * @param {User} user - the logged-in user
 * @param {{ name?: string, avatarUrl?: string|null }} updateBody
 * @returns {Promise<User>}
 */
const updateMe = async (user, updateBody) => {
  Object.assign(user, updateBody);
  await user.save();
  return user;
};

export default {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  createFirstAdmin,
  createUserAsActor,
  updateUserAsActor,
  updateUserStatusAsActor,
  deleteUserAsActor,
  updateMe,
};
