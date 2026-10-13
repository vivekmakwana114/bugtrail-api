import { jest } from '@jest/globals';
import request from 'supertest';
import { faker } from '@faker-js/faker';
import httpStatus from 'http-status';
import httpMocks from 'node-mocks-http';
import moment from 'moment';
import bcrypt from 'bcryptjs';
import app from '../../src/app.js';
import config from '../../src/config/config.js';
import { auth, authorize } from '../../src/middlewares/auth.js';
import { tokenService, emailService } from '../../src/services/index.js';
import ApiError from '../../src/utils/ApiError.js';
import setupTestDB from '../utils/setupTestDB.js';
import { User, Token } from '../../src/models/index.js';
import { tokenTypes } from '../../src/config/tokens.js';
import { userStatuses } from '../../src/config/userStatuses.js';
import { allPermissions } from '../../src/config/permissions.js';
import { userOne, admin, projectManager, pendingUser, suspendedUser, insertUsers } from '../fixtures/user.fixture.js';
import {
  userOneAccessToken,
  adminAccessToken,
  projectManagerAccessToken,
  suspendedUserAccessToken,
} from '../fixtures/token.fixture.js';

setupTestDB();

/** @returns {string|undefined} the raw `refreshToken=...` Set-Cookie header */
const getRefreshSetCookie = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken='));

/** @returns {string} the token value from the Set-Cookie header */
const getRefreshTokenValue = (res) => getRefreshSetCookie(res).split(';')[0].split('=')[1];

const saveRefreshToken = async (user, { expires = moment().add(config.jwt.refreshExpirationDays, 'days') } = {}) => {
  const token = tokenService.generateToken(user._id, expires, tokenTypes.REFRESH);
  await tokenService.saveToken(token, user._id, expires, tokenTypes.REFRESH);
  return token;
};

describe('Auth routes', () => {
  describe('POST /v1/auth/register', () => {
    let newUser;
    beforeEach(() => {
      newUser = {
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        password: 'password1',
      };
    });

    test('should return 201 and create a pending user with no role and no tokens', async () => {
      const res = await request(app).post('/v1/auth/register').send(newUser).expect(httpStatus.CREATED);

      expect(res.body.user).not.toHaveProperty('password');
      // Registration returns only what the client needs: no role, permissions or dates.
      expect(res.body.user).toEqual({ id: expect.any(String), name: newUser.name, email: newUser.email, status: 'pending' });
      expect(res.body).not.toHaveProperty('tokens');
      expect(getRefreshSetCookie(res)).toBeUndefined();

      const dbUser = await User.findById(res.body.user.id);
      expect(dbUser.password).not.toBe(newUser.password);
      expect(dbUser.status).toBe(userStatuses.PENDING);
    });

    test('should reject role and status sent by the client', async () => {
      const res = await request(app)
        .post('/v1/auth/register')
        .send({ ...newUser, role: 'admin', status: 'active' })
        .expect(httpStatus.BAD_REQUEST);

      expect(res.body.message).toMatch(/not allowed/);
    });

    test('should return 400 error if email is invalid', async () => {
      newUser.email = 'invalidEmail';
      await request(app).post('/v1/auth/register').send(newUser).expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if email is already used', async () => {
      await insertUsers([userOne]);
      newUser.email = userOne.email;
      await request(app).post('/v1/auth/register').send(newUser).expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if password is too short or lacks letters/numbers', async () => {
      await request(app)
        .post('/v1/auth/register')
        .send({ ...newUser, password: 'passwo1' })
        .expect(httpStatus.BAD_REQUEST);
      await request(app)
        .post('/v1/auth/register')
        .send({ ...newUser, password: 'password' })
        .expect(httpStatus.BAD_REQUEST);
      await request(app)
        .post('/v1/auth/register')
        .send({ ...newUser, password: '11111111' })
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('POST /v1/auth/login', () => {
    test('should return 200 with the user detail and access token, and set an httpOnly refresh cookie', async () => {
      await insertUsers([userOne]);

      const res = await request(app)
        .post('/v1/auth/login')
        .send({ email: userOne.email, password: userOne.password })
        .expect(httpStatus.OK);

      expect(Object.keys(res.body.user).sort()).toEqual(
        [
          'avatarUrl',
          'createdAt',
          'designation',
          'email',
          'id',
          'lastLoginAt',
          'name',
          'permissions',
          'role',
          'status',
        ].sort(),
      );
      expect(res.body.user).toMatchObject({ id: userOne._id.toHexString(), email: userOne.email, role: 'developer' });
      expect(res.body.user.permissions).toEqual(expect.arrayContaining(['bug:read', 'bug:progress']));
      expect(res.body.user.permissions).not.toContain('bug:verify');
      expect(res.body.tokens).toEqual({ access: { token: expect.any(String), expires: expect.any(String) } });

      const cookie = getRefreshSetCookie(res);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Path=\/v1\/auth/);
      expect(cookie).toMatch(/SameSite=Lax/);

      const dbUser = await User.findById(userOne._id);
      expect(dbUser.lastLoginAt).toBeInstanceOf(Date);
    });

    test('should return 401 error if there are no users with that email', async () => {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({ email: userOne.email, password: userOne.password })
        .expect(httpStatus.UNAUTHORIZED);

      expect(res.body).toEqual({ code: httpStatus.UNAUTHORIZED, message: 'Incorrect email or password' });
    });

    test('should return 401 error if password is wrong', async () => {
      await insertUsers([userOne]);
      const res = await request(app)
        .post('/v1/auth/login')
        .send({ email: userOne.email, password: 'wrongPassword1' })
        .expect(httpStatus.UNAUTHORIZED);

      expect(res.body).toEqual({ code: httpStatus.UNAUTHORIZED, message: 'Incorrect email or password' });
    });

    test('should return 403 for a pending user and issue no tokens', async () => {
      await insertUsers([pendingUser]);
      const res = await request(app)
        .post('/v1/auth/login')
        .send({ email: pendingUser.email, password: pendingUser.password })
        .expect(httpStatus.FORBIDDEN);

      expect(res.body.message).toBe('Your account is awaiting approval');
      expect(getRefreshSetCookie(res)).toBeUndefined();
    });

    test('should return 403 for suspended and rejected users', async () => {
      const rejectedUser = { ...pendingUser, status: userStatuses.REJECTED };
      await insertUsers([suspendedUser, rejectedUser]);

      await request(app)
        .post('/v1/auth/login')
        .send({ email: suspendedUser.email, password: suspendedUser.password })
        .expect(httpStatus.FORBIDDEN);
      await request(app)
        .post('/v1/auth/login')
        .send({ email: rejectedUser.email, password: rejectedUser.password })
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 401 (not 403) for a pending user with a wrong password, so status is not revealed', async () => {
      await insertUsers([pendingUser]);
      await request(app)
        .post('/v1/auth/login')
        .send({ email: pendingUser.email, password: 'wrongPassword1' })
        .expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v1/auth/logout', () => {
    test('should return 204, delete the refresh token and clear the cookie', async () => {
      await insertUsers([userOne]);
      const refreshToken = await saveRefreshToken(userOne);

      const res = await request(app)
        .post('/v1/auth/logout')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(httpStatus.NO_CONTENT);

      expect(await Token.findOne({ token: refreshToken })).toBe(null);
      expect(getRefreshSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    test('should return 204 even without a cookie (idempotent)', async () => {
      await request(app).post('/v1/auth/logout').expect(httpStatus.NO_CONTENT);
    });
  });

  describe('POST /v1/auth/refresh-tokens', () => {
    test('should return 200 with a new access token and rotate the refresh cookie', async () => {
      await insertUsers([userOne]);
      const refreshToken = await saveRefreshToken(userOne);

      const res = await request(app)
        .post('/v1/auth/refresh-tokens')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(httpStatus.OK);

      expect(res.body).toEqual({ tokens: { access: { token: expect.any(String), expires: expect.any(String) } } });

      const newRefreshToken = getRefreshTokenValue(res);
      expect(newRefreshToken).not.toBe(refreshToken);
      expect(await Token.findOne({ token: refreshToken })).toBe(null);
      expect(await Token.findOne({ token: newRefreshToken, type: tokenTypes.REFRESH })).not.toBe(null);
    });

    test('should return 401 if the cookie is missing', async () => {
      await request(app).post('/v1/auth/refresh-tokens').expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 401 and clear the cookie if the refresh token was already used (rotated)', async () => {
      await insertUsers([userOne]);
      const refreshToken = await saveRefreshToken(userOne);
      await request(app).post('/v1/auth/refresh-tokens').set('Cookie', `refreshToken=${refreshToken}`).expect(httpStatus.OK);

      const res = await request(app)
        .post('/v1/auth/refresh-tokens')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(httpStatus.UNAUTHORIZED);
      expect(getRefreshSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    test('should return 401 if the refresh token is signed with an invalid secret', async () => {
      await insertUsers([userOne]);
      const expires = moment().add(config.jwt.refreshExpirationDays, 'days');
      const refreshToken = tokenService.generateToken(userOne._id, expires, tokenTypes.REFRESH, 'invalidSecret');
      await tokenService.saveToken(refreshToken, userOne._id, expires, tokenTypes.REFRESH);

      await request(app)
        .post('/v1/auth/refresh-tokens')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 401 if the refresh token is expired', async () => {
      await insertUsers([userOne]);
      const refreshToken = await saveRefreshToken(userOne, { expires: moment().subtract(1, 'minutes') });

      await request(app)
        .post('/v1/auth/refresh-tokens')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 401 if the user has been suspended since login', async () => {
      await insertUsers([suspendedUser]);
      const refreshToken = await saveRefreshToken(suspendedUser);

      await request(app)
        .post('/v1/auth/refresh-tokens')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 401 if the user no longer exists', async () => {
      const refreshToken = await saveRefreshToken(userOne);
      await request(app)
        .post('/v1/auth/refresh-tokens')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /v1/auth/me', () => {
    test('should return the user detail with role and effective permissions', async () => {
      await insertUsers([admin]);
      const res = await request(app)
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(httpStatus.OK);

      expect(res.body.user).toMatchObject({ email: admin.email, role: 'admin' });
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user.permissions.sort()).toEqual([...allPermissions].sort());
    });

    test('should return 401 without an access token', async () => {
      await request(app).get('/v1/auth/me').expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 401 for a suspended user even with an unexpired access token', async () => {
      await insertUsers([suspendedUser]);
      await request(app)
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${suspendedUserAccessToken}`)
        .expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v1/auth/forgot-password', () => {
    beforeEach(() => {
      jest.spyOn(emailService.transport, 'sendMail').mockResolvedValue();
    });

    test('should return 204 and send a reset email linking to the web app', async () => {
      await insertUsers([userOne]);
      const sendResetPasswordEmailSpy = jest.spyOn(emailService, 'sendResetPasswordEmail');

      await request(app).post('/v1/auth/forgot-password').send({ email: userOne.email }).expect(httpStatus.NO_CONTENT);

      expect(sendResetPasswordEmailSpy).toHaveBeenCalledWith(userOne.email, expect.any(String));
      const resetPasswordToken = sendResetPasswordEmailSpy.mock.calls[0][1];
      const dbResetPasswordTokenDoc = await Token.findOne({ token: resetPasswordToken, user: userOne._id });
      expect(dbResetPasswordTokenDoc).toBeDefined();
    });

    test('should return 400 if email is missing', async () => {
      await request(app).post('/v1/auth/forgot-password').send().expect(httpStatus.BAD_REQUEST);
    });

    test('should return 204 without sending anything if the email has no account (no enumeration)', async () => {
      const sendResetPasswordEmailSpy = jest.spyOn(emailService, 'sendResetPasswordEmail');
      await request(app).post('/v1/auth/forgot-password').send({ email: userOne.email }).expect(httpStatus.NO_CONTENT);
      expect(sendResetPasswordEmailSpy).not.toHaveBeenCalled();
    });

    test('should not send a reset email to a pending user', async () => {
      await insertUsers([pendingUser]);
      const sendResetPasswordEmailSpy = jest.spyOn(emailService, 'sendResetPasswordEmail');
      await request(app).post('/v1/auth/forgot-password').send({ email: pendingUser.email }).expect(httpStatus.NO_CONTENT);
      expect(sendResetPasswordEmailSpy).not.toHaveBeenCalled();
    });
  });

  describe('POST /v1/auth/reset-password', () => {
    const saveResetToken = async (user, expires = moment().add(config.jwt.resetPasswordExpirationMinutes, 'minutes')) => {
      const token = tokenService.generateToken(user._id, expires, tokenTypes.RESET_PASSWORD);
      await tokenService.saveToken(token, user._id, expires, tokenTypes.RESET_PASSWORD);
      return token;
    };

    test('should return 204, reset the password and revoke every refresh token', async () => {
      await insertUsers([userOne]);
      const resetPasswordToken = await saveResetToken(userOne);
      await saveRefreshToken(userOne);

      await request(app)
        .post('/v1/auth/reset-password')
        .query({ token: resetPasswordToken })
        .send({ password: 'password2' })
        .expect(httpStatus.NO_CONTENT);

      const dbUser = await User.findById(userOne._id);
      expect(await bcrypt.compare('password2', dbUser.password)).toBe(true);
      expect(await Token.countDocuments({ user: userOne._id })).toBe(0);
    });

    test('should return 400 if reset password token is missing', async () => {
      await insertUsers([userOne]);
      await request(app).post('/v1/auth/reset-password').send({ password: 'password2' }).expect(httpStatus.BAD_REQUEST);
    });

    test('should return 401 if reset password token is expired', async () => {
      await insertUsers([userOne]);
      const resetPasswordToken = await saveResetToken(userOne, moment().subtract(1, 'minutes'));
      await request(app)
        .post('/v1/auth/reset-password')
        .query({ token: resetPasswordToken })
        .send({ password: 'password2' })
        .expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 401 if user is not found', async () => {
      const resetPasswordToken = await saveResetToken(userOne);
      await request(app)
        .post('/v1/auth/reset-password')
        .query({ token: resetPasswordToken })
        .send({ password: 'password2' })
        .expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 400 if password is missing or invalid', async () => {
      await insertUsers([userOne]);
      const resetPasswordToken = await saveResetToken(userOne);
      const send = (body) => request(app).post('/v1/auth/reset-password').query({ token: resetPasswordToken }).send(body);

      await send().expect(httpStatus.BAD_REQUEST);
      await send({ password: 'short1' }).expect(httpStatus.BAD_REQUEST);
      await send({ password: 'password' }).expect(httpStatus.BAD_REQUEST);
      await send({ password: '11111111' }).expect(httpStatus.BAD_REQUEST);
    });
  });
});

/**
 * Run a middleware and resolve with whatever it passes to next().
 * @returns {Promise<undefined|Error>}
 */
const runMiddleware = (middleware, req) =>
  new Promise((resolve) => {
    middleware(req, httpMocks.createResponse(), resolve);
  });

describe('auth() middleware (authentication)', () => {
  test('should call next with no error and set req.user', async () => {
    await insertUsers([userOne]);
    const req = httpMocks.createRequest({ headers: { Authorization: `Bearer ${userOneAccessToken}` } });

    const err = await runMiddleware(auth(), req);

    expect(err).toBeUndefined();
    expect(req.user._id).toEqual(userOne._id);
    expect(req.user.role).toBe('developer');
  });

  test.each([
    ['no token', () => ({})],
    ['a malformed token', () => ({ Authorization: 'Bearer randomToken' })],
    [
      'a refresh token instead of an access token',
      () => ({
        Authorization: `Bearer ${tokenService.generateToken(userOne._id, moment().add(1, 'minutes'), tokenTypes.REFRESH)}`,
      }),
    ],
    [
      'a token signed with another secret',
      () => ({
        Authorization: `Bearer ${tokenService.generateToken(userOne._id, moment().add(1, 'minutes'), tokenTypes.ACCESS, 'x')}`,
      }),
    ],
    [
      'an expired token',
      () => ({
        Authorization: `Bearer ${tokenService.generateToken(userOne._id, moment().subtract(1, 'minutes'), tokenTypes.ACCESS)}`,
      }),
    ],
  ])('should call next with 401 for %s', async (_label, headers) => {
    await insertUsers([userOne]);
    const err = await runMiddleware(auth(), httpMocks.createRequest({ headers: headers() }));

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ statusCode: httpStatus.UNAUTHORIZED, message: 'Please authenticate' });
  });

  test('should call next with 401 if the user no longer exists', async () => {
    const req = httpMocks.createRequest({ headers: { Authorization: `Bearer ${userOneAccessToken}` } });
    const err = await runMiddleware(auth(), req);
    expect(err).toMatchObject({ statusCode: httpStatus.UNAUTHORIZED });
  });
});

describe('authorize() middleware (authorization)', () => {
  const authenticatedRequest = async (user) => {
    const dbUser = await User.findById(user._id);
    return httpMocks.createRequest({ user: dbUser });
  };

  test('should throw at definition time for a permission that is not in the catalog', () => {
    expect(() => authorize('bug:raed')).toThrow(/unknown permission/);
  });

  test('should call next with no error if the user holds every required permission', async () => {
    await insertUsers([projectManager]);
    const err = await runMiddleware(authorize('user:read', 'bug:assign'), await authenticatedRequest(projectManager));
    expect(err).toBeUndefined();
  });

  test('should call next with 403 if the user lacks any one of the required permissions', async () => {
    await insertUsers([projectManager]);
    const err = await runMiddleware(authorize('user:read', 'user:delete'), await authenticatedRequest(projectManager));
    expect(err).toMatchObject({ statusCode: httpStatus.FORBIDDEN, message: 'Forbidden' });
  });

  test('should grant Admin every permission in the catalog', async () => {
    await insertUsers([admin]);
    const err = await runMiddleware(authorize('user:delete', 'user:approve'), await authenticatedRequest(admin));
    expect(err).toBeUndefined();
  });

  test('should call next with 403 for a user with no role', async () => {
    const roleless = { ...userOne, role: null };
    await insertUsers([roleless]);
    const err = await runMiddleware(authorize('bug:read'), await authenticatedRequest(roleless));
    expect(err).toMatchObject({ statusCode: httpStatus.FORBIDDEN });
  });

  test('should call next with 401 if auth() did not run first', async () => {
    const err = await runMiddleware(authorize('bug:read'), httpMocks.createRequest());
    expect(err).toMatchObject({ statusCode: httpStatus.UNAUTHORIZED });
  });

  test('should apply a role change on the very next request, with the same access token', async () => {
    await insertUsers([projectManager]);
    const call = () => request(app).get('/v1/users').set('Authorization', `Bearer ${projectManagerAccessToken}`);

    await call().expect(httpStatus.OK);
    await User.updateOne({ _id: projectManager._id }, { $set: { role: 'developer' } }); // developers lack user:read
    await call().expect(httpStatus.FORBIDDEN);
  });
});
