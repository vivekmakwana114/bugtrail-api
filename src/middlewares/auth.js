import passport from 'passport';
import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';
import { isValidPermission } from '../config/permissions.js';

/**
 * Authentication: "who are you?" → 401 when the access token is missing, invalid,
 * expired, or belongs to a user who is no longer active.
 * On success `req.user` is the User document with `role` populated.
 */
const auth = () => (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err || info || !user) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
    }
    req.user = user;
    next();
  })(req, res, next);
};

/**
 * Authorization: "are you allowed?" → 403 unless the user holds EVERY listed permission.
 * Must run after auth().
 *
 * Keys are checked against the catalog when the route is defined, so a typo like
 * authorize('bug:raed') crashes at boot instead of silently denying everyone.
 *
 * @param {...string} requiredPermissions
 */
const authorize = (...requiredPermissions) => {
  const unknown = requiredPermissions.filter((perm) => !isValidPermission(perm));
  if (unknown.length) {
    throw new Error(`authorize(): unknown permission(s): ${unknown.join(', ')}`);
  }

  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
    }
    const granted = req.user.getPermissions();
    const allowed = requiredPermissions.every((perm) => granted.includes(perm));
    if (!allowed) {
      return next(new ApiError(httpStatus.FORBIDDEN, 'Forbidden'));
    }
    next();
  };
};

export { auth, authorize };
