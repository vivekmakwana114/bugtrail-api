import { jest } from '@jest/globals';
import request from 'supertest';
import httpStatus from 'http-status';
import moment from 'moment';
import app from '../../src/app.js';
import config from '../../src/config/config.js';
import setupTestDB from '../utils/setupTestDB.js';
import { Token, User } from '../../src/models/index.js';
import { tokenService, userService } from '../../src/services/index.js';
import { tokenTypes } from '../../src/config/tokens.js';
import { getRolePermissions } from '../../src/config/roles.js';
import {
  userOne,
  admin,
  adminTwo,
  qaUser,
  projectManager,
  pendingUser,
  suspendedUser,
  insertUsers,
} from '../fixtures/user.fixture.js';
import { userOneAccessToken, adminAccessToken, projectManagerAccessToken } from '../fixtures/token.fixture.js';

setupTestDB();

/**
 * Today only Admin can create, edit, approve or delete users, so the non-Admin guards are not
 * reachable through the API. They exist for the day a role like Project Manager gets e.g.
 * user:approve in config/roles.js. This simulates that day: PMs get extra permissions for one
 * test (jest restoreMocks puts the real method back afterwards).
 */
const grantToProjectManager = (...extra) =>
  jest.spyOn(User.prototype, 'getPermissions').mockImplementation(function () {
    const base = getRolePermissions(this.role);
    return this.role === 'project_manager' ? [...base, ...extra] : base;
  });

const asAdmin = (req) => req.set('Authorization', `Bearer ${adminAccessToken}`);
const asPM = (req) => req.set('Authorization', `Bearer ${projectManagerAccessToken}`);

describe('PATCH /v1/users/:userId/status (approval queue)', () => {
  const setStatus = (userId, body, as = asAdmin) => as(request(app).patch(`/v1/users/${userId}/status`)).send(body);

  test('should approve a pending user with a role', async () => {
    await insertUsers([admin, pendingUser]);

    const res = await setStatus(pendingUser._id, { status: 'active', role: 'developer' }).expect(httpStatus.OK);

    expect(res.body).toMatchObject({ status: 'active', role: 'developer' });
    expect(res.body.permissions.sort()).toEqual(getRolePermissions('developer').sort());
    await request(app)
      .post('/v1/auth/login')
      .send({ email: pendingUser.email, password: pendingUser.password })
      .expect(httpStatus.OK);
  });

  test('should return 400 when approving a user who has no role and none is given', async () => {
    await insertUsers([admin, pendingUser]);
    const res = await setStatus(pendingUser._id, { status: 'active' }).expect(httpStatus.BAD_REQUEST);
    expect(res.body.message).toBe('Assign a role to approve this user');
  });

  test('should reject a pending user', async () => {
    await insertUsers([admin, pendingUser]);
    const res = await setStatus(pendingUser._id, { status: 'rejected' }).expect(httpStatus.OK);
    expect(res.body.status).toBe('rejected');
  });

  test('should return 400 for a transition that is not allowed (pending → suspended)', async () => {
    await insertUsers([admin, pendingUser]);
    const res = await setStatus(pendingUser._id, { status: 'suspended' }).expect(httpStatus.BAD_REQUEST);
    expect(res.body.message).toBe("Can't change status from pending to suspended");
  });

  test('should return 400 if a role is sent with a non-activating status', async () => {
    await insertUsers([admin, pendingUser]);
    await setStatus(pendingUser._id, { status: 'rejected', role: 'qa' }).expect(httpStatus.BAD_REQUEST);
  });

  test('should suspend an active user, end their sessions, and reject their still-valid access token', async () => {
    await insertUsers([admin, userOne]);
    const expires = moment().add(config.jwt.refreshExpirationDays, 'days');
    const refreshToken = tokenService.generateToken(userOne._id, expires, tokenTypes.REFRESH);
    await tokenService.saveToken(refreshToken, userOne._id, expires, tokenTypes.REFRESH);

    await setStatus(userOne._id, { status: 'suspended' }).expect(httpStatus.OK);

    expect(await Token.countDocuments({ user: userOne._id, type: tokenTypes.REFRESH })).toBe(0);
    await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${userOneAccessToken}`)
      .expect(httpStatus.UNAUTHORIZED);
  });

  test('should reactivate a suspended user with their existing role', async () => {
    await insertUsers([admin, suspendedUser]);
    const res = await setStatus(suspendedUser._id, { status: 'active' }).expect(httpStatus.OK);
    expect(res.body).toMatchObject({ status: 'active', role: 'developer' });
  });

  test('should return 403 when changing your own status', async () => {
    await insertUsers([admin]);
    const res = await setStatus(admin._id, { status: 'suspended' }).expect(httpStatus.FORBIDDEN);
    expect(res.body.message).toBe("You can't change your own status");
  });

  test('should return 403 without user:approve', async () => {
    await insertUsers([projectManager, pendingUser]);
    await setStatus(pendingUser._id, { status: 'rejected' }, asPM).expect(httpStatus.FORBIDDEN);
  });

  test('should only let a non-Admin approver assign roles within their own permissions', async () => {
    await insertUsers([projectManager, pendingUser]);
    await grantToProjectManager('user:approve');

    const asQa = await setStatus(pendingUser._id, { status: 'active', role: 'qa' }, asPM).expect(httpStatus.FORBIDDEN);
    expect(asQa.body.message).toMatch(/bug:verify/);

    const asAdminRole = await setStatus(pendingUser._id, { status: 'active', role: 'admin' }, asPM).expect(
      httpStatus.FORBIDDEN,
    );
    expect(asAdminRole.body.message).toBe('Only an Admin can assign the Admin role');

    await setStatus(pendingUser._id, { status: 'active', role: 'developer' }, asPM).expect(httpStatus.OK);
  });

  test('should not let a non-Admin suspend an Admin', async () => {
    await insertUsers([projectManager, admin]);
    await grantToProjectManager('user:approve');
    const res = await setStatus(admin._id, { status: 'suspended' }, asPM).expect(httpStatus.FORBIDDEN);
    expect(res.body.message).toBe('Only an Admin can manage an Admin user');
  });

  test('should let an Admin suspend another Admin while one active Admin remains', async () => {
    await insertUsers([admin, adminTwo]);
    await setStatus(adminTwo._id, { status: 'suspended' }).expect(httpStatus.OK);
  });

  test('should refuse to suspend the last active Admin (service-level guard)', async () => {
    // Through the API this is only reachable in a race (two Admins suspending each other at
    // once), so drive the service directly: the acting Admin is already suspended in the DB.
    await insertUsers([admin, { ...adminTwo, status: 'suspended' }]);
    const actor = await User.findById(adminTwo._id);

    await expect(userService.updateUserStatusAsActor(actor, admin._id, { status: 'suspended' })).rejects.toMatchObject({
      statusCode: httpStatus.CONFLICT,
    });
  });
});

describe('PATCH /v1/users/:userId (escalation guards)', () => {
  const patchUser = (userId, body, as = asAdmin) => as(request(app).patch(`/v1/users/${userId}`)).send(body);

  test('should return 403 when changing your own role, even as Admin', async () => {
    await insertUsers([admin, adminTwo]);
    const res = await patchUser(admin._id, { role: 'developer' }).expect(httpStatus.FORBIDDEN);
    expect(res.body.message).toBe("You can't change your own role");
  });

  test('should let you edit your own name through this route without tripping the role guard', async () => {
    await insertUsers([admin]);
    await patchUser(admin._id, { name: 'Renamed', role: 'admin' }).expect(httpStatus.OK);
  });

  test("should stop a non-Admin from editing an Admin (e.g. resetting the Admin's password)", async () => {
    await insertUsers([projectManager, admin]);
    await grantToProjectManager('user:update');
    const res = await patchUser(admin._id, { password: 'takeover1' }, asPM).expect(httpStatus.FORBIDDEN);
    expect(res.body.message).toBe('Only an Admin can manage an Admin user');
  });

  test("should stop a non-Admin from taking over a more powerful user (resetting a QA's password)", async () => {
    await insertUsers([projectManager, qaUser]);
    await grantToProjectManager('user:update');
    const res = await patchUser(qaUser._id, { password: 'takeover1' }, asPM).expect(httpStatus.FORBIDDEN);
    expect(res.body.message).toBe(
      "You can't manage a user with permissions you don't hold: project:create, bug:delete, bug:verify, bug:set_any_status",
    );
  });

  test('should let a non-Admin edit a user whose permissions they all hold', async () => {
    await insertUsers([projectManager, userOne]);
    await grantToProjectManager('user:update');
    await patchUser(userOne._id, { name: 'Renamed Dev' }, asPM).expect(httpStatus.OK);
  });

  test('should stop a non-Admin from promoting someone to a role with permissions they lack', async () => {
    await insertUsers([projectManager, userOne]);
    await grantToProjectManager('user:update');

    const toQa = await patchUser(userOne._id, { role: 'qa' }, asPM).expect(httpStatus.FORBIDDEN);
    expect(toQa.body.message).toBe(
      "You can't assign a role with permissions you don't hold: project:create, bug:delete, bug:verify, bug:set_any_status",
    );
    await patchUser(userOne._id, { role: 'admin' }, asPM).expect(httpStatus.FORBIDDEN);
  });

  test("should end the user's sessions when someone else sets their password", async () => {
    await insertUsers([admin, userOne]);
    const expires = moment().add(1, 'day');
    const refreshToken = tokenService.generateToken(userOne._id, expires, tokenTypes.REFRESH);
    await tokenService.saveToken(refreshToken, userOne._id, expires, tokenTypes.REFRESH);

    await patchUser(userOne._id, { password: 'newPassword1' }).expect(httpStatus.OK);

    expect(await Token.countDocuments({ user: userOne._id, type: tokenTypes.REFRESH })).toBe(0);
  });

  test('should let an Admin move a QA user to Developer', async () => {
    await insertUsers([admin, qaUser]);
    const res = await patchUser(qaUser._id, { role: 'developer' }).expect(httpStatus.OK);
    expect(res.body.role).toBe('developer');
  });
});

describe('DELETE /v1/users/:userId (guards)', () => {
  test('should return 403 when deleting yourself', async () => {
    await insertUsers([admin]);
    const res = await asAdmin(request(app).delete(`/v1/users/${admin._id}`)).expect(httpStatus.FORBIDDEN);
    expect(res.body.message).toBe("You can't delete your own account");
  });

  test('should stop a non-Admin with user:delete from deleting an Admin', async () => {
    await insertUsers([projectManager, admin]);
    await grantToProjectManager('user:delete');
    await asPM(request(app).delete(`/v1/users/${admin._id}`)).expect(httpStatus.FORBIDDEN);
    expect(await User.exists({ _id: admin._id })).not.toBeNull();
  });
});

describe('PATCH /v1/users/me', () => {
  const patchMe = (body) =>
    request(app).patch('/v1/users/me').set('Authorization', `Bearer ${userOneAccessToken}`).send(body);

  test('should update your own name and avatar', async () => {
    await insertUsers([userOne]);
    const res = await patchMe({ name: 'New Name', avatarUrl: 'https://drive.google.com/avatar.png' }).expect(httpStatus.OK);
    expect(res.body).toMatchObject({ name: 'New Name', avatarUrl: 'https://drive.google.com/avatar.png' });
    expect(res.body.role).toBe('developer');
  });

  test('should clear the avatar with null', async () => {
    await insertUsers([userOne]);
    const res = await patchMe({ avatarUrl: null }).expect(httpStatus.OK);
    expect(res.body.avatarUrl).toBeNull();
  });

  test.each([
    ['role', { role: 'qa' }],
    ['permissions', { permissions: ['user:delete'] }],
    ['status', { status: 'active' }],
    ['email', { email: 'new@example.com' }],
    ['password', { password: 'password2' }],
    // eslint-disable-next-line no-script-url -- the test proves this XSS vector is rejected
    ['a non-http avatar url', { avatarUrl: 'javascript:alert(1)' }],
    ['an empty body', {}],
  ])('should return 400 for %s', async (_label, body) => {
    await insertUsers([userOne]);
    await patchMe(body).expect(httpStatus.BAD_REQUEST);
  });

  test('should require authentication', async () => {
    await request(app).patch('/v1/users/me').send({ name: 'x' }).expect(httpStatus.UNAUTHORIZED);
  });
});

describe('POST /v1/auth/change-password', () => {
  const changePassword = (body) =>
    request(app).post('/v1/auth/change-password').set('Authorization', `Bearer ${userOneAccessToken}`).send(body);

  test('should change the password, revoke other sessions and issue a fresh session', async () => {
    await insertUsers([userOne]);
    const expires = moment().add(1, 'day');
    const otherDeviceToken = tokenService.generateToken(userOne._id, expires, tokenTypes.REFRESH);
    await tokenService.saveToken(otherDeviceToken, userOne._id, expires, tokenTypes.REFRESH);

    const res = await changePassword({ currentPassword: userOne.password, newPassword: 'password2' }).expect(httpStatus.OK);

    expect(res.body.tokens.access.token).toEqual(expect.any(String));
    expect(res.headers['set-cookie'].some((c) => c.startsWith('refreshToken='))).toBe(true);
    expect(await Token.findOne({ token: otherDeviceToken })).toBeNull();
    await request(app).post('/v1/auth/login').send({ email: userOne.email, password: 'password2' }).expect(httpStatus.OK);
  });

  test('should return 400 (not 401) for a wrong current password', async () => {
    await insertUsers([userOne]);
    const res = await changePassword({ currentPassword: 'wrongPassword1', newPassword: 'password2' }).expect(
      httpStatus.BAD_REQUEST,
    );
    expect(res.body.message).toBe('Current password is incorrect');
  });

  test('should return 400 if the new password equals the current one or is weak', async () => {
    await insertUsers([userOne]);
    await changePassword({ currentPassword: userOne.password, newPassword: userOne.password }).expect(
      httpStatus.BAD_REQUEST,
    );
    await changePassword({ currentPassword: userOne.password, newPassword: 'short' }).expect(httpStatus.BAD_REQUEST);
  });
});

describe('userService.createFirstAdmin (npm run seed)', () => {
  test('should create an active Admin with the full catalog', async () => {
    const { created, user } = await userService.createFirstAdmin({ email: 'boss@example.com', password: 'password1' });

    expect(created).toBe(true);
    expect(user).toMatchObject({ email: 'boss@example.com', role: 'admin', status: 'active', name: 'Admin' });
    expect(user.getPermissions()).toContain('user:approve');
  });

  test('should do nothing when an active Admin already exists', async () => {
    await insertUsers([admin]);
    const { created, user } = await userService.createFirstAdmin({ email: 'boss@example.com', password: 'password1' });

    expect(created).toBe(false);
    expect(user.email).toBe(admin.email);
    expect(await User.countDocuments()).toBe(1);
  });

  test('should still create one when the only Admin is suspended (recovery path)', async () => {
    await insertUsers([{ ...admin, status: 'suspended' }]);
    const { created } = await userService.createFirstAdmin({ email: 'boss@example.com', password: 'password1' });
    expect(created).toBe(true);
  });
});
