import httpStatus from 'http-status';
import { Bug, Token, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import escapeRegex from '../utils/escapeRegex.js';
import { userStatuses, allowedStatusTransitions } from '../config/userStatuses.js';
import { roles, getRolesWithPermission } from '../config/roles.js';
import { tokenTypes } from '../config/tokens.js';
import projectService from './project.service.js';
import emailService from './email.service.js';
import logger from '../config/logger.js';
import { disconnectUser } from '../sockets/emitter.js';
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
 * End every session of a user: refresh tokens and live sockets. Their access token already stops
 * working on the next request if their status is no longer active (see config/passport.js).
 * @param {ObjectId} userId
 */
const revokeSessions = async (userId) => {
  await Token.deleteMany({ user: userId, type: tokenTypes.REFRESH });
  disconnectUser(userId);
};

/**
 * Account emails are a side effect of a status change that is already saved: log a failure
 * instead of failing the request.
 * @param {Function} send - emailService.send...Email
 * @param {User} user
 */
const queueAccountEmail = async (send, user) => {
  try {
    await send(user);
  } catch (error) {
    logger.error(`Could not queue account email for user ${user.id}: ${error.message}`);
  }
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
 * @param {Object} filter - name, role, status (exact), and `search`: part of the name or email,
 *   case-insensitive ("riya" finds "Riya Shah" and "riya@invennico.com")
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async ({ search, ...filter }, options) => {
  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: 'i' };
    Object.assign(filter, { $or: [{ name: pattern }, { email: pattern }] });
  }
  return User.paginate(filter, options);
};

/**
 * Everyone a bug can be assigned to: active users whose role can work on bugs (bug:progress).
 * Feeds the assignee pickers and the bug list's assignee filter. Asked by permission, not by
 * role name, so a new role (or a changed matrix) is picked up automatically.
 * Admins are left out: only an admin can assign a bug to themselves (see bugService.assertAssignable),
 * so the one admin listed is the actor, when they are one.
 * @param {User} actor
 * @returns {Promise<User[]>} sorted by name
 */
const getAssignableUsers = async (actor) =>
  User.find({
    status: userStatuses.ACTIVE,
    role: { $in: getRolesWithPermission('bug:progress') },
    $or: [{ role: { $ne: roles.ADMIN } }, { _id: actor._id }],
  }).sort({ name: 1 });

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
 * @param {Object} userBody - name, email, password, role, designation
 * @returns {Promise<User>}
 */
const createUserAsActor = async (actor, userBody) => {
  assertCanAssignRole(actor, userBody.role);
  return createUser({ ...userBody, status: userStatuses.ACTIVE });
};

/**
 * @param {User} actor
 * @param {ObjectId} userId
 * @param {Object} updateBody - name, email, password, avatarUrl, role, designation
 * @returns {Promise<User>}
 */
const updateUserAsActor = async (actor, userId, { role, ...profile }) => {
  const target = await getUserOrThrow(userId);
  assertCanManageUser(actor, target);

  const roleChanged = role && role !== target.role;
  if (roleChanged) {
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
  } else if (roleChanged) {
    // What they may see changed: drop live connections so they re-join only what's still allowed.
    disconnectUser(target._id);
  }
  return target;
};

/**
 * Approve, reject, suspend or reactivate a user.
 * Activating grants access, so it needs a role (sent, or one the user already has) and
 * goes through the same role-assignment guard as any other role change.
 * @param {User} actor
 * @param {ObjectId} userId
 * @param {{ status: string, role?: string, designation?: string }} body
 * @returns {Promise<User>}
 */
const updateUserStatusAsActor = async (actor, userId, { status, role, designation }) => {
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
    if (designation !== undefined) target.designation = designation;
  } else if (role || designation !== undefined) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A role and designation can only be set when activating a user');
  }

  if (target.status === userStatuses.ACTIVE) {
    await assertNotLastActiveAdmin(target);
  }

  target.status = status;
  await target.save();
  if (status !== userStatuses.ACTIVE) {
    await revokeSessions(target._id);
  }
  // Always emailed (no checkbox): the person can't see in-app notifications until they can log in.
  if (status === userStatuses.ACTIVE) {
    await queueAccountEmail(emailService.sendAccountActiveEmail, target);
  } else if (status === userStatuses.REJECTED) {
    await queueAccountEmail(emailService.sendAccountRejectedEmail, target);
  }
  return target;
};

/**
 * Hard delete. Prefer suspending: it keeps the user's history and can be undone.
 * Users who reported or were assigned bugs can't be deleted: their names are part of the history.
 * @param {User} actor
 * @param {ObjectId} userId
 */
const deleteUserAsActor = async (actor, userId) => {
  assertNotSelf(actor, userId, "You can't delete your own account");
  const target = await getUserOrThrow(userId);
  assertCanManageUser(actor, target);
  await assertNotLastActiveAdmin(target);
  if (await Bug.exists({ $or: [{ reporter: target._id }, { assignee: target._id }] })) {
    throw new ApiError(httpStatus.CONFLICT, 'This user has reported or been assigned bugs. Suspend them instead.');
  }
  await Token.deleteMany({ user: target._id });
  await projectService.removeUserFromAllProjects(target._id);
  await target.deleteOne();
  disconnectUser(target._id);
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
  getAssignableUsers,
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
