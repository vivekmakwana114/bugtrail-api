import request from 'supertest';
import { faker } from '@faker-js/faker';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import setupTestDB from '../utils/setupTestDB.js';
import { User } from '../../src/models/index.js';
import { userOne, userTwo, admin, projectManager, pendingUser, insertUsers } from '../fixtures/user.fixture.js';
import { userOneAccessToken, adminAccessToken, projectManagerAccessToken } from '../fixtures/token.fixture.js';

setupTestDB();

// Phase 1 scope: the user routes are guarded by the new permission keys.
// Approval, escalation guards and PATCH /users/me arrive in Phase 2.

describe('User routes', () => {
  describe('POST /v1/users', () => {
    let newUser;
    let roles;

    beforeEach(async () => {
      roles = await insertUsers([admin]);
      newUser = {
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        password: 'password1',
        role: roles.qa.id,
      };
    });

    test('should return 201 and create an active user with the given role', async () => {
      const res = await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.CREATED);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).toMatchObject({ name: newUser.name, email: newUser.email, status: 'active', role: { slug: 'qa' } });

      const dbUser = await User.findById(res.body.id);
      expect(dbUser.password).not.toBe(newUser.password);
      expect(dbUser.role.toHexString()).toBe(roles.qa.id);
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
      const send = (body) => request(app).post('/v1/users').set('Authorization', `Bearer ${adminAccessToken}`).send(body);
      await send({ ...newUser, email: 'invalidEmail' }).expect(httpStatus.BAD_REQUEST);
      await send({ ...newUser, email: admin.email }).expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if password is invalid', async () => {
      const send = (body) => request(app).post('/v1/users').set('Authorization', `Bearer ${adminAccessToken}`).send(body);
      await send({ ...newUser, password: 'passwo1' }).expect(httpStatus.BAD_REQUEST);
      await send({ ...newUser, password: 'password' }).expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if role is not a valid id or does not exist', async () => {
      const send = (body) => request(app).post('/v1/users').set('Authorization', `Bearer ${adminAccessToken}`).send(body);
      await send({ ...newUser, role: 'admin' }).expect(httpStatus.BAD_REQUEST);
      const res = await send({ ...newUser, role: new mongoose.Types.ObjectId().toHexString() }).expect(
        httpStatus.BAD_REQUEST,
      );
      expect(res.body.message).toBe('Role not found');
    });
  });

  describe('GET /v1/users', () => {
    test('should return 200 with paginated users and populated roles', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(httpStatus.OK);

      expect(res.body).toEqual({ results: expect.any(Array), page: 1, limit: 10, totalPages: 1, totalResults: 3 });
      expect(res.body.results[0]).toMatchObject({
        id: userOne._id.toHexString(),
        name: userOne.name,
        email: userOne.email,
        status: 'active',
        role: { slug: 'developer' },
      });
      expect(res.body.results[0]).not.toHaveProperty('password');
    });

    test('should be allowed for a Project Manager (user:read) and forbidden for a Developer', async () => {
      await insertUsers([userOne, projectManager]);
      await request(app).get('/v1/users').set('Authorization', `Bearer ${projectManagerAccessToken}`).expect(httpStatus.OK);
      await request(app).get('/v1/users').set('Authorization', `Bearer ${userOneAccessToken}`).expect(httpStatus.FORBIDDEN);
    });

    test('should return 401 if access token is missing', async () => {
      await request(app).get('/v1/users').expect(httpStatus.UNAUTHORIZED);
    });

    test('should filter by role id and by status', async () => {
      const roles = await insertUsers([userOne, userTwo, admin, pendingUser]);

      const byRole = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ role: roles.developer.id })
        .expect(httpStatus.OK);
      expect(byRole.body.results.map((u) => u.id)).toEqual([userOne._id.toHexString(), userTwo._id.toHexString()]);

      const byStatus = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ status: 'pending' })
        .expect(httpStatus.OK);
      expect(byStatus.body.results.map((u) => u.id)).toEqual([pendingUser._id.toHexString()]);
    });

    test('should return 400 for an unknown status filter', async () => {
      await insertUsers([admin]);
      await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ status: 'deleted' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should sort, limit and page results', async () => {
      await insertUsers([userOne, userTwo, admin]);
      const expectedOrder = [userOne, userTwo, admin].sort((a, b) => a.name.localeCompare(b.name));

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ sortBy: 'name:asc', limit: 2, page: 2 })
        .expect(httpStatus.OK);

      expect(res.body).toMatchObject({ page: 2, limit: 2, totalPages: 2, totalResults: 3 });
      expect(res.body.results.map((u) => u.id)).toEqual([expectedOrder[2]._id.toHexString()]);
    });
  });

  describe('GET /v1/users/:userId', () => {
    test('should return 200 and the user with a populated role', async () => {
      await insertUsers([userOne, admin]);
      const res = await request(app)
        .get(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(httpStatus.OK);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).toMatchObject({ id: userOne._id.toHexString(), email: userOne.email, role: { slug: 'developer' } });
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
      await request(app)
        .get('/v1/users/invalidId')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(httpStatus.BAD_REQUEST);
      await request(app)
        .get(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /v1/users/:userId', () => {
    test('should return 200 and update the user', async () => {
      await insertUsers([userOne, admin]);
      const updateBody = { name: faker.person.fullName(), email: faker.internet.email().toLowerCase() };

      const res = await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.OK);

      expect(res.body).toMatchObject({ ...updateBody, role: { slug: 'developer' } });
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
      const patch = (body) =>
        request(app).patch(`/v1/users/${userOne._id}`).set('Authorization', `Bearer ${adminAccessToken}`).send(body);
      await patch({ email: userTwo.email }).expect(httpStatus.BAD_REQUEST);
      await patch({ email: userOne.email }).expect(httpStatus.OK);
    });

    test('should return 404 for an unknown user', async () => {
      await insertUsers([admin]);
      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'New name' })
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /v1/users/:userId', () => {
    test('should return 204 and delete the user', async () => {
      await insertUsers([userOne, admin]);
      await request(app)
        .delete(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(httpStatus.NO_CONTENT);
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
      await request(app)
        .delete(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(httpStatus.NOT_FOUND);
    });
  });
});
