import httpStatus from 'http-status';
import config from '../config/config.js';
import ApiError from '../utils/ApiError.js';

const appOrigin = new URL(config.clientUrl).origin;

/**
 * CSRF guard for the routes that act on the refresh-token cookie (refresh, logout).
 *
 * In production the cookie is SameSite=None (see utils/refreshCookie.js), so a page on any site
 * could make the browser send it here. Browsers always attach an Origin header to cross-site
 * POSTs and pages can't forge it, so refusing any Origin other than the web app's stops that.
 * CORS alone doesn't: it only stops the attacker from *reading* the response, not the request
 * (and its Set-Cookie) from happening.
 *
 * Requests with no Origin come from non-browser clients (Postman, curl, tests), which have no
 * victim's cookie to abuse, so they're allowed.
 */
const requireAppOrigin = (req, res, next) => {
  const origin = req.get('Origin');
  if (origin && origin !== appOrigin) {
    return next(new ApiError(httpStatus.FORBIDDEN, 'Request origin not allowed'));
  }
  return next();
};

export default requireAppOrigin;
