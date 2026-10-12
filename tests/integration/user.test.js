import request from 'supertest';
import { faker } from '@faker-js/faker';
import httpStatus from 'http-status';
import app from '../../src/app.js';
import setupTestDB from '../utils/setupTestDB.js';
import { User } from '../../src/models/index.js';
import { getRolePermissions } from '../../src/config/roles.js';
import { userOne, userTwo, admin, projectManager, pendingUser, insertUsers } from '../fixtures/user.fixture.js';
import { userOneAccessToken, adminAccessToken, projectManagerAccessToken } from '../fixtures/token.fixture.js';

setupTestDB();

const SUMMARY_KEYS = ['avatarUrl', 'email', 'id', 'name', 'role', 'status'].sort();
const DETAIL_KEYS = [...SUMMARY_KEYS, 'createdAt', 'lastLoginAt', 'permissions'].sort();

const asAdmin = (req) => req.set('Authorization', `Bearer ${adminAccessToken}`);

describe('User routes', () => {
  describe('POST /v1/users', () => {
    let newUser;

    beforeEach(async () => {
      await insertUsers([admin]);
      newUser = {
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        password: 'password1',
        role: 'qa',
      };
    });

    test("should return 201, create an active user, and report the role's permissions", async () => {
      const res = await asAdmin(request(app).post('/v1/users')).send(newUser).expect(httpStatus.CREATED);

      expect(Object.keys(res.body).sort()).toEqual(DETAIL_KEYS);
      expect(res.body).toMatchObject({ name: newUser.name, email: newUser.email, status: 'active', role: 'qa' });
      expect(res.body.permissions).toEqual(getRolePermissions('qa'));

      const dbUser = await User.findById(res.body.id);
      expect(dbUser.password).not.toBe(newUser.password);
      expect(dbUser.toObject()).not.toHaveProperty('permissions');
    });

    test('should return 401 error if access token is missing', async () => {
      await request(app).post('/v1/users').send(newUser).expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 403 error if the caller lacks user:create', async () => {
      await insertUsers([projectManager]);
      await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${projectManagerAccessToken}`)
        .send(newUser)
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 400 error if email is invalid or already used', async () => {
      await asAdmin(request(app).post('/v1/users'))
        .send({ ...newUser, email: 'invalidEmail' })
        .expect(httpStatus.BAD_REQUEST);
      await asAdmin(request(app).post('/v1/users'))
        .send({ ...newUser, email: admin.email })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if password is invalid', async () => {
      await asAdmin(request(app).post('/v1/users'))
        .send({ ...newUser, password: 'passwo1' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 for an unknown role, or if permissions are sent (they follow from the role)', async () => {
      await asAdmin(request(app).post('/v1/users'))
        .send({ ...newUser, role: 'superuser' })
        .expect(httpStatus.BAD_REQUEST);
      await asAdmin(request(app).post('/v1/users'))
        .send({ ...newUser, permissions: ['bug:read'] })
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/users', () => {
    test('should return 200 with paginated users in the compact summary shape', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await asAdmin(request(app).get('/v1/users')).expect(httpStatus.OK);

      expect(res.body).toEqual({ results: expect.any(Array), page: 1, limit: 10, totalPages: 1, totalResults: 3 });
      expect(Object.keys(res.body.results[0]).sort()).toEqual(SUMMARY_KEYS);
      expect(res.body.results[0]).toEqual({
        id: userOne._id.toHexString(),
        name: userOne.name,
        email: userOne.email,
        role: 'developer',
        status: 'active',
        avatarUrl: null,
      });
    });

    test('should be allowed for a Project Manager (user:read) and forbidden for a Developer', async () => {
      await insertUsers([userOne, projectManager]);
      await request(app).get('/v1/users').set('Authorization', `Bearer ${projectManagerAccessToken}`).expect(httpStatus.OK);
      await request(app).get('/v1/users').set('Authorization', `Bearer ${userOneAccessToken}`).expect(httpStatus.FORBIDDEN);
    });

    test('should return 401 if access token is missing', async () => {
      await request(app).get('/v1/users').expect(httpStatus.UNAUTHORIZED);
    });

    test('should filter by role and by status', async () => {
      await insertUsers([userOne, userTwo, admin, pendingUser]);

      const byRole = await asAdmin(request(app).get('/v1/users')).query({ role: 'developer' }).expect(httpStatus.OK);
      expect(byRole.body.results.map((u) => u.id)).toEqual([userOne._id.toHexString(), userTwo._id.toHexString()]);

      const byStatus = await asAdmin(request(app).get('/v1/users')).query({ status: 'pending' }).expect(httpStatus.OK);
      expect(byStatus.body.results.map((u) => u.id)).toEqual([pendingUser._id.toHexString()]);
    });

    test('should return 400 for an unknown role or status filter', async () => {
      await insertUsers([admin]);
      await asAdmin(request(app).get('/v1/users')).query({ status: 'deleted' }).expect(httpStatus.BAD_REQUEST);
      await asAdmin(request(app).get('/v1/users')).query({ role: 'superuser' }).expect(httpStatus.BAD_REQUEST);
    });

    test('should sort, limit and page results', async () => {
      await insertUsers([userOne, userTwo, admin]);
      const expectedOrder = [userOne, userTwo, admin].sort((a, b) => a.name.localeCompare(b.name));

      const res = await asAdmin(request(app).get('/v1/users'))
        .query({ sortBy: 'name:asc', limit: 2, page: 2 })
        .expect(httpStatus.OK);

      expect(res.body).toMatchObject({ page: 2, limit: 2, totalPages: 2, totalResults: 3 });
      expect(res.body.results.map((u) => u.id)).toEqual([expectedOrder[2]._id.toHexString()]);
    });
  });

  describe('GET /v1/users/:userId', () => {
    test('should return 200 and the user detail', async () => {
      await insertUsers([userOne, admin]);
      const res = await asAdmin(request(app).get(`/v1/users/${userOne._id}`)).expect(httpStatus.OK);

      expect(Object.keys(res.body).sort()).toEqual(DETAIL_KEYS);
      expect(res.body).toMatchObject({ id: userOne._id.toHexString(), email: userOne.email, role: 'developer' });
      expect(res.body.permissions).toEqual(getRolePermissions('developer'));
    });

    test('should return 403 for a Developer, even fetching themselves (use /auth/me)', async () => {
      await insertUsers([userOne]);
      await request(app)
        .get(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 400 for an invalid id and 404 for an unknown user', async () => {
      await insertUsers([admin]);
      await asAdmin(request(app).get('/v1/users/invalidId')).expect(httpStatus.BAD_REQUEST);
      await asAdmin(request(app).get(`/v1/users/${userOne._id}`)).expect(httpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /v1/users/:userId', () => {
    test('should return 200 and update the profile fields', async () => {
      await insertUsers([userOne, admin]);
      const updateBody = { name: faker.person.fullName(), email: faker.internet.email().toLowerCase() };

      const res = await asAdmin(request(app).patch(`/v1/users/${userOne._id}`))
        .send(updateBody)
        .expect(httpStatus.OK);

      expect(res.body).toMatchObject({ ...updateBody, role: 'developer' });
    });

    test('should change the role, and the permissions with it', async () => {
      await insertUsers([userOne, admin]);
      const res = await asAdmin(request(app).patch(`/v1/users/${userOne._id}`))
        .send({ role: 'qa' })
        .expect(httpStatus.OK);
      expect(res.body.role).toBe('qa');
      expect(res.body.permissions).toEqual(getRolePermissions('qa'));
    });

    test('should return 400 if permissions are sent', async () => {
      await insertUsers([userOne, admin]);
      await asAdmin(request(app).patch(`/v1/users/${userOne._id}`))
        .send({ permissions: ['bug:read'] })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 403 if the caller lacks user:update', async () => {
      await insertUsers([userOne, projectManager]);
      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${projectManagerAccessToken}`)
        .send({ name: 'New name' })
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 400 if email is taken, but not if it is the same user', async () => {
      await insertUsers([userOne, userTwo, admin]);
      const patch = (body) => asAdmin(request(app).patch(`/v1/users/${userOne._id}`)).send(body);
      await patch({ email: userTwo.email }).expect(httpStatus.BAD_REQUEST);
      await patch({ email: userOne.email }).expect(httpStatus.OK);
    });

    test('should return 404 for an unknown user', async () => {
      await insertUsers([admin]);
      await asAdmin(request(app).patch(`/v1/users/${userOne._id}`))
        .send({ name: 'New name' })
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /v1/users/:userId', () => {
    test('should return 204 and delete the user', async () => {
      await insertUsers([userOne, admin]);
      await asAdmin(request(app).delete(`/v1/users/${userOne._id}`)).expect(httpStatus.NO_CONTENT);
      expect(await User.findById(userOne._id)).toBeNull();
    });

    test('should return 403 if the caller lacks user:delete', async () => {
      await insertUsers([userOne, userTwo]);
      await request(app)
        .delete(`/v1/users/${userTwo._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 404 for an unknown user', async () => {
      await insertUsers([admin]);
      await asAdmin(request(app).delete(`/v1/users/${userOne._id}`)).expect(httpStatus.NOT_FOUND);
    });
  });
});

describe('GET /v1/roles (access catalog)', () => {
  test('should return the four roles with what each can do, and the permission groups', async () => {
    await insertUsers([userOne]);
    const res = await request(app)
      .get('/v1/roles')
      .set('Authorization', `Bearer ${userOneAccessToken}`)
      .expect(httpStatus.OK);

    expect(res.body.roles.map((r) => r.key)).toEqual(['admin', 'project_manager', 'developer', 'qa']);
    expect(res.body.roles.find((r) => r.key === 'qa').permissions).toEqual(getRolePermissions('qa'));
    expect(res.body.permissionGroups.map((g) => g.key)).toEqual(['dashboard', 'project', 'bug', 'chat', 'user']);
  });

  test('should require authentication', async () => {
    await request(app).get('/v1/roles').expect(httpStatus.UNAUTHORIZED);
  });
});
