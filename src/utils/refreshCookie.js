import config from '../config/config.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * httpOnly: JavaScript (and therefore an XSS payload) can never read the refresh token.
 * path: the browser only sends it to /v1/auth/*, not to every API call.
 * secure/sameSite come from env so local HTTP dev and HTTPS production both work.
 */
const baseOptions = () => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
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
