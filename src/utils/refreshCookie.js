import config from '../config/config.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

const isProduction = config.env === 'production';

/**
 * httpOnly: JavaScript (and therefore an XSS payload) can never read the refresh token.
 * path: the browser only sends it to /v1/auth/*, not to every API call.
 *
 * secure/sameSite follow from where we run, so there's nothing to configure:
 *  - development/test: plain HTTP on localhost, where Secure cookies would never be sent.
 *    The web (:3000) and API (:5000) are the same site, so Lax works.
 *  - production: HTTPS. SameSite=None so the cookie also works when the web and API are on
 *    different sites (the two *.up.railway.app URLs). Browsers require Secure with None.
 *    None lets other sites' requests carry the cookie, so the routes that read it check the
 *    request's Origin (middlewares/appOrigin.js): that's the CSRF protection.
 */
const baseOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/v1/auth',
});

/**
 * @param {import('express').Response} res
 * @param {{ token: string, expires: Date }} refresh
 */
const setRefreshCookie = (res, refresh) => {
  res.cookie(REFRESH_COOKIE_NAME, refresh.token, { ...baseOptions(), expires: refresh.expires });
};

/** @param {import('express').Response} res */
const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
};

/**
 * @param {import('express').Request} req
 * @returns {string|undefined}
 */
const readRefreshCookie = (req) => req.cookies?.[REFRESH_COOKIE_NAME];

export { REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie, readRefreshCookie };
