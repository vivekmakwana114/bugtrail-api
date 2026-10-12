import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import { authService, tokenService } from '../services/index.js';
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from '../utils/refreshCookie.js';

/**
 * The refresh token only ever travels in the httpOnly cookie. The body carries the
 * short-lived access token, which the web app keeps in memory (never localStorage).
 * @param {import('express').Response} res
 * @param {Object} tokens - output of tokenService.generateAuthTokens
 * @returns {{ access: { token: string, expires: Date } }}
 */
const issueTokens = (res, tokens) => {
  setRefreshCookie(res, tokens.refresh);
  return { access: tokens.access };
};

const register = catchAsync(async (req, res) => {
  const user = await authService.register(req.body);
  res.status(httpStatus.CREATED).send({ user, message: 'Registration received. An admin will review your account.' });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(user);
  res.send({ user, permissions: user.getPermissions(), tokens: issueTokens(res, tokens) });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  try {
    const tokens = await authService.refreshAuth(readRefreshCookie(req));
    res.send({ tokens: issueTokens(res, tokens) });
  } catch (error) {
    // A dead cookie is useless; drop it so the browser stops sending it.
    clearRefreshCookie(res);
    throw error;
  }
});

const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  clearRefreshCookie(res);
  res.status(httpStatus.NO_CONTENT).send();
});

const getMe = catchAsync(async (req, res) => {
  res.send({ user: req.user, permissions: req.user.getPermissions() });
});

export default {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  getMe,
};
