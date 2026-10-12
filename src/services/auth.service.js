import httpStatus from 'http-status';
import tokenService from './token.service.js';
import userService from './user.service.js';
import emailService from './email.service.js';
import notificationService from './notification.service.js';
import { Token, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { tokenTypes } from '../config/tokens.js';
import { userStatuses } from '../config/userStatuses.js';
import { getRolesWithPermission } from '../config/roles.js';
import { notificationTypes } from '../config/notificationTypes.js';
import logger from '../config/logger.js';

const inactiveStatusMessages = {
  [userStatuses.PENDING]: 'Your account is awaiting approval',
  [userStatuses.SUSPENDED]: 'Your account has been suspended',
  [userStatuses.REJECTED]: 'Your registration was not approved',
};

/**
 * Self-registration. The account starts `pending` with no role, so it can't log in
 * until an approver activates it. Everyone who can approve gets an in-app notification.
 * @param {{ name: string, email: string, password: string }} userBody
 * @returns {Promise<User>}
 */
const register = async ({ name, email, password }) => {
  const user = await userService.createUser({ name, email, password, status: userStatuses.PENDING, role: null });
  const approvers = await User.find({
    role: { $in: getRolesWithPermission('user:approve') },
    status: userStatuses.ACTIVE,
  }).select('_id');
  await notificationService.notify({
    recipients: approvers.map((approver) => approver._id),
    actor: user,
    type: notificationTypes.USER_REGISTERED,
    title: `${user.name} is waiting for approval`,
    message: `${user.name} (${user.email}) registered. Approve them with a role, or reject the request.`,
    entity: { kind: 'user', id: user.id },
    link: '/users?status=pending',
  });
  return user;
};

/**
 * Login with email and password.
 * The password is checked BEFORE the status, so a wrong password never reveals
 * whether an account exists or is pending.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  if (!user || !(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  if (user.status !== userStatuses.ACTIVE) {
    throw new ApiError(httpStatus.FORBIDDEN, inactiveStatusMessages[user.status] || 'Account is not active');
  }
  user.lastLoginAt = new Date();
  await user.save();
  return user;
};

/**
 * Logout. Idempotent: a missing or already-revoked token is not an error,
 * because the client's goal (being logged out) is already met.
 * @param {string} [refreshToken]
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  if (!refreshToken) {
    return;
  }
  await Token.deleteOne({ token: refreshToken, type: tokenTypes.REFRESH });
};

/**
 * Rotate the refresh token: the old one is deleted, a new pair is issued.
 * Inactive users can't refresh, so suspension also ends existing sessions.
 * @param {string} [refreshToken]
 * @returns {Promise<Object>} tokens
 */
const refreshAuth = async (refreshToken) => {
  try {
    if (!refreshToken) {
      throw new Error('Missing refresh token');
    }
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const user = await userService.getUserById(refreshTokenDoc.user);
    if (!user || user.status !== userStatuses.ACTIVE) {
      throw new Error('User not active');
    }
    await refreshTokenDoc.deleteOne();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

/**
 * Start a password reset. Always succeeds from the caller's point of view, so the
 * endpoint can't be used to discover which emails have accounts.
 * @param {string} email
 * @returns {Promise}
 */
const forgotPassword = async (email) => {
  const user = await userService.getUserByEmail(email);
  if (!user || user.status !== userStatuses.ACTIVE) {
    logger.info(`Password reset requested for unknown or inactive account`);
    return;
  }
  const resetPasswordToken = await tokenService.generateResetPasswordToken(user);
  await emailService.sendResetPasswordEmail(user.email, resetPasswordToken);
};

/**
 * Reset password, then revoke every refresh token: if the password was reset
 * because the account was compromised, the attacker's sessions must end too.
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(resetPasswordToken, tokenTypes.RESET_PASSWORD);
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await Token.deleteMany({ user: user.id, type: { $in: [tokenTypes.RESET_PASSWORD, tokenTypes.REFRESH] } });
    await userService.updateUserById(user.id, { password: newPassword });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

/**
 * Change your own password. Every refresh token is revoked (signing out other devices) and a
 * fresh pair is returned, so the caller's own session continues.
 * Wrong current password is a 400, not a 401: the web app treats 401 as "session expired"
 * and would log the user out for a typo.
 * @param {User} user - the logged-in user
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<Object>} tokens
 */
const changePassword = async (user, currentPassword, newPassword) => {
  if (!(await user.isPasswordMatch(currentPassword))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Current password is incorrect');
  }
  await userService.updateUserById(user._id, { password: newPassword });
  await Token.deleteMany({ user: user._id, type: tokenTypes.REFRESH });
  return tokenService.generateAuthTokens(user);
};

export default {
  register,
  changePassword,
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
  forgotPassword,
  resetPassword,
};
