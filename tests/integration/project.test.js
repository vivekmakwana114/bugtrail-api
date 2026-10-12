import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app.js';
import setupTestDB from '../utils/setupTestDB.js';
import { Project } from '../../src/models/index.js';
import {
  userOne,
  userTwo,
  admin,
  qaUser,
  projectManager,
  pendingUser,
  suspendedUser,
  makeUser,
  insertUsers,
} from '../fixtures/user.fixture.js';
import { projectOne, projectTwo, makeProject, insertProjects } from '../fixtures/project.fixture.js';
import {
  userOneAccessToken,
  userTwoAccessToken,
  adminAccessToken,
  qaUserAccessToken,
  projectManagerAccessToken,
} from '../fixtures/token.fixture.js';

setupTestDB();

const LIST_ITEM_KEYS = ['bugSummary', 'id', 'key', 'manager', 'memberCount', 'name', 'status', 'updatedAt'].sort();
const DETAIL_KEYS = [
  'bugSummary',
  'createdAt',
  'description',
  'id',
  'key',
  'manager',
  'members',
  'name',
  'status',
  'updatedAt',
].sort();
const EMPTY_SUMMARY = {
  total: 0,
  open: 0,
  agedOpen: 0,
  byStatus: { reported: 0, ongoing: 0, resolved: 0, pass: 0, failed: 0 },
  pie: { reported: 0, ongoing: 0, resolved: 0 },
};

const as = (token) => (req) => req.set('Authorization', `Bearer ${token}`);
const asAdmin = as(adminAccessToken);
const asPM = as(projectManagerAccessToken);
const asDev = as(userOneAccessToken);

// Minimal raw bug documents: the summary only reads project, status and deletedAt.
// Each needs its own bugNumber because of the unique {project, bugNumber} index.
const bugs = () => mongoose.connection.db.collection('bugs');
let nextBugNumber = 0;
const insertBugs = (projectId, statuses, extra = {}) =>
  bugs().insertMany(
    statuses.map((status) => {
      nextBugNumber += 1;
      return { project: projectId, bugNumber: nextBugNumber, status, deletedAt: null, createdAt: new Date(), ...extra };
    }),
  );

const allUsers = [userOne, userTwo, admin, qaUser, projectManager, pendingUser, suspendedUser];

describe('Project routes', () => {
  beforeEach(async () => {
    await insertUsers(allUsers);
  });

  afterEach(async () => {
    await bugs().deleteMany({});
  });

  describe('POST /v1/projects', () => {
    let newProject;

    beforeEach(() => {
      newProject = { name: 'BugTrail', key: 'bt', description: 'Internal bug tracker' };
    });

    test('should return 201, store the key uppercase and return the detail shape', async () => {
      const res = await asAdmin(request(app).post('/v1/projects')).send(newProject).expect(httpStatus.CREATED);

      expect(Object.keys(res.body).sort()).toEqual(DETAIL_KEYS);
      expect(res.body).toMatchObject({ name: 'BugTrail', key: 'BT', status: 'active', manager: null, members: [] });
      expect(res.body.bugSummary).toEqual(EMPTY_SUMMARY);

      const dbProject = await Project.findById(res.body.id);
      expect(dbProject.key).toBe('BT');
      expect(dbProject.bugCounter).toBe(0);
    });

    test('should add the manager to the members, and not add an Admin creator (who sees everything anyway)', async () => {
      const res = await asAdmin(request(app).post('/v1/projects'))
        .send({ ...newProject, manager: projectManager._id.toString(), members: [userOne._id.toString()] })
        .expect(httpStatus.CREATED);

      expect(res.body.manager.id).toBe(projectManager._id.toString());
      expect(res.body.members.map((m) => m.id).sort()).toEqual(
        [projectManager._id.toString(), userOne._id.toString()].sort(),
      );
      expect(Object.keys(res.body.members[0]).sort()).toEqual(['avatarUrl', 'email', 'id', 'name', 'role', 'status']);
    });

    test('should return 400 if the key is already used, even by a deleted project', async () => {
      await insertProjects([makeProject({ key: 'BT', deletedAt: new Date() })]);
      const res = await asAdmin(request(app).post('/v1/projects')).send(newProject).expect(httpStatus.BAD_REQUEST);
      expect(res.body.message).toBe('Project key already taken');
    });

    test('should return 400 for an invalid key', async () => {
      await Promise.all(
        ['B', '1BT', 'B-T', 'ABCDEFGHIJK'].map((key) =>
          asAdmin(request(app).post('/v1/projects'))
            .send({ ...newProject, key })
            .expect(httpStatus.BAD_REQUEST),
        ),
      );
    });

    test('should return 400 if a member is pending, suspended or unknown', async () => {
      const ids = [pendingUser._id, suspendedUser._id, new mongoose.Types.ObjectId()].map(String);
      const res = await asAdmin(request(app).post('/v1/projects'))
        .send({ ...newProject, members: ids })
        .expect(httpStatus.BAD_REQUEST);
      ids.forEach((id) => expect(res.body.message).toContain(id));
      expect(await Project.countDocuments()).toBe(0);
    });

    test('should return 400 if the manager is not a Project Manager or Admin', async () => {
      await asAdmin(request(app).post('/v1/projects'))
        .send({ ...newProject, manager: userOne._id.toString() })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 403 for a Project Manager (no project:create)', async () => {
      await asPM(request(app).post('/v1/projects')).send(newProject).expect(httpStatus.FORBIDDEN);
    });

    test('should return 401 without a token', async () => {
      await request(app).post('/v1/projects').send(newProject).expect(httpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /v1/projects', () => {
    beforeEach(async () => {
      await insertProjects([
        projectOne,
        projectTwo,
        makeProject({ name: 'Gone', members: [userOne._id], deletedAt: new Date() }),
      ]);
    });

    test('should show a member only their own projects', async () => {
      const res = await asDev(request(app).get('/v1/projects')).expect(httpStatus.OK);

      expect(res.body).toMatchObject({ page: 1, limit: 10, totalPages: 1, totalResults: 1 });
      expect(res.body.results.map((p) => p.key)).toEqual(['ALPHA']);
      expect(Object.keys(res.body.results[0]).sort()).toEqual(LIST_ITEM_KEYS);
      expect(res.body.results[0]).toMatchObject({
        memberCount: 2,
        manager: { id: projectManager._id.toString(), name: projectManager.name, avatarUrl: null },
      });
    });

    test('should show an Admin every project except deleted ones, sorted by name by default', async () => {
      const res = await asAdmin(request(app).get('/v1/projects')).expect(httpStatus.OK);
      expect(res.body.results.map((p) => p.key)).toEqual(['ALPHA', 'BETA']);
    });

    test('should show a user who is in no project an empty list', async () => {
      await Project.updateMany({}, { $pull: { members: userOne._id } });
      const res = await asDev(request(app).get('/v1/projects')).expect(httpStatus.OK);
      expect(res.body.results).toEqual([]);
    });

    test('should not let query params widen the scope', async () => {
      // `members` is not an accepted filter, and the scope is merged last in the service anyway.
      await asDev(request(app).get('/v1/projects'))
        .query({ members: userTwo._id.toString() })
        .expect(httpStatus.BAD_REQUEST);
      const res = await asDev(request(app).get('/v1/projects')).query({ search: 'BETA' }).expect(httpStatus.OK);
      expect(res.body.results).toEqual([]);
    });

    test('should filter by status and search by name or key (case-insensitive, regex characters literal)', async () => {
      await Project.updateOne({ _id: projectTwo._id }, { status: 'completed' });

      let res = await asAdmin(request(app).get('/v1/projects')).query({ status: 'completed' }).expect(httpStatus.OK);
      expect(res.body.results.map((p) => p.key)).toEqual(['BETA']);

      res = await asAdmin(request(app).get('/v1/projects')).query({ search: 'alp' }).expect(httpStatus.OK);
      expect(res.body.results.map((p) => p.key)).toEqual(['ALPHA']);

      res = await asAdmin(request(app).get('/v1/projects')).query({ search: '.*' }).expect(httpStatus.OK);
      expect(res.body.results).toEqual([]);
    });

    test('should include per-status counts, open count and the 3-slice pie, ignoring deleted bugs', async () => {
      await insertBugs(projectOne._id, ['reported', 'reported', 'ongoing', 'failed', 'resolved', 'pass', 'pass']);
      await insertBugs(projectOne._id, ['reported'], { deletedAt: new Date() });
      await insertBugs(projectTwo._id, ['ongoing']);

      const res = await asAdmin(request(app).get('/v1/projects')).expect(httpStatus.OK);
      const [alpha, beta] = res.body.results;

      expect(alpha.bugSummary).toEqual({
        total: 7,
        open: 5,
        agedOpen: 0,
        byStatus: { reported: 2, ongoing: 1, resolved: 1, pass: 2, failed: 1 },
        pie: { reported: 2, ongoing: 2, resolved: 3 },
      });
      expect(beta.bugSummary.pie).toEqual({ reported: 0, ongoing: 1, resolved: 0 });
    });

    test('should paginate and sort by an allowed field only', async () => {
      const res = await asAdmin(request(app).get('/v1/projects'))
        .query({ sortBy: 'name:desc', limit: 1, page: 2 })
        .expect(httpStatus.OK);
      expect(res.body).toMatchObject({ page: 2, limit: 1, totalPages: 2, totalResults: 2 });
      expect(res.body.results.map((p) => p.key)).toEqual(['ALPHA']);

      await asAdmin(request(app).get('/v1/projects')).query({ sortBy: 'bugCounter:asc' }).expect(httpStatus.BAD_REQUEST);
      await asAdmin(request(app).get('/v1/projects')).query({ limit: 1000 }).expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/projects/:projectId', () => {
    beforeEach(async () => {
      await insertProjects([projectOne, projectTwo]);
    });

    test('should return the detail with members sorted by name for a member', async () => {
      const res = await asDev(request(app).get(`/v1/projects/${projectOne._id}`)).expect(httpStatus.OK);

      expect(Object.keys(res.body).sort()).toEqual(DETAIL_KEYS);
      const names = [projectManager.name, userOne.name].sort((a, b) => a.localeCompare(b));
      expect(res.body.members.map((m) => m.name)).toEqual(names);
      expect(res.body.manager.id).toBe(projectManager._id.toString());
    });

    test("should return 404, not 403, for a project outside the user's scope", async () => {
      const res = await asDev(request(app).get(`/v1/projects/${projectTwo._id}`)).expect(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe('Project not found');
    });

    test('should return 404 for a deleted project, even for an Admin', async () => {
      await Project.updateOne({ _id: projectOne._id }, { deletedAt: new Date() });
      await asAdmin(request(app).get(`/v1/projects/${projectOne._id}`)).expect(httpStatus.NOT_FOUND);
    });

    test('should return 400 for an invalid id', async () => {
      await asAdmin(request(app).get('/v1/projects/not-an-id')).expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('PATCH /v1/projects/:projectId', () => {
    beforeEach(async () => {
      await insertProjects([projectOne, projectTwo]);
    });

    test('should let a PM edit a project they are in', async () => {
      const res = await asPM(request(app).patch(`/v1/projects/${projectOne._id}`))
        .send({ name: 'Alpha v2', status: 'completed', description: '' })
        .expect(httpStatus.OK);
      expect(res.body).toMatchObject({ name: 'Alpha v2', status: 'completed', key: 'ALPHA' });
    });

    test("should return 404 to a PM for a project they aren't in", async () => {
      await asPM(request(app).patch(`/v1/projects/${projectTwo._id}`))
        .send({ name: 'Hijacked' })
        .expect(httpStatus.NOT_FOUND);
      expect((await Project.findById(projectTwo._id)).name).toBe('Beta');
    });

    test('should return 403 for a developer (no project:update)', async () => {
      await asDev(request(app).patch(`/v1/projects/${projectOne._id}`))
        .send({ name: 'x' })
        .expect(httpStatus.FORBIDDEN);
    });

    test('should reject a key change and a members change (not editable here)', async () => {
      await asAdmin(request(app).patch(`/v1/projects/${projectOne._id}`))
        .send({ key: 'NEW' })
        .expect(httpStatus.BAD_REQUEST);
      await asAdmin(request(app).patch(`/v1/projects/${projectOne._id}`))
        .send({ members: [] })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should only accept a manager who is already an eligible member, and allow clearing it', async () => {
      const otherPM = makeUser({ role: 'project_manager' });
      await insertUsers([otherPM]);

      await asAdmin(request(app).patch(`/v1/projects/${projectOne._id}`))
        .send({ manager: otherPM._id.toString() })
        .expect(httpStatus.BAD_REQUEST);
      await asAdmin(request(app).patch(`/v1/projects/${projectOne._id}`))
        .send({ manager: userOne._id.toString() })
        .expect(httpStatus.BAD_REQUEST);

      const res = await asAdmin(request(app).patch(`/v1/projects/${projectOne._id}`))
        .send({ manager: null })
        .expect(httpStatus.OK);
      expect(res.body.manager).toBeNull();
    });
  });

  describe('DELETE /v1/projects/:projectId', () => {
    beforeEach(async () => {
      await insertProjects([projectOne]);
    });

    test('should soft delete: 204, then 404 and gone from lists, but the document and key remain', async () => {
      await asAdmin(request(app).delete(`/v1/projects/${projectOne._id}`)).expect(httpStatus.NO_CONTENT);

      await asAdmin(request(app).get(`/v1/projects/${projectOne._id}`)).expect(httpStatus.NOT_FOUND);
      const res = await asAdmin(request(app).get('/v1/projects')).expect(httpStatus.OK);
      expect(res.body.results).toEqual([]);

      const dbProject = await Project.findById(projectOne._id);
      expect(dbProject.deletedAt).toBeInstanceOf(Date);
      await asAdmin(request(app).post('/v1/projects')).send({ name: 'Reuse', key: 'ALPHA' }).expect(httpStatus.BAD_REQUEST);
    });

    test('should return 403 for a PM (no project:delete)', async () => {
      await asPM(request(app).delete(`/v1/projects/${projectOne._id}`)).expect(httpStatus.FORBIDDEN);
    });
  });

  describe('POST /v1/projects/:projectId/members', () => {
    beforeEach(async () => {
      await insertProjects([projectOne, projectTwo]);
    });

    test('should let the PM add members, idempotently, and return the full list', async () => {
      const userIds = [qaUser._id.toString(), userOne._id.toString()]; // userOne is already a member
      const res = await asPM(request(app).post(`/v1/projects/${projectOne._id}/members`))
        .send({ userIds })
        .expect(httpStatus.OK);

      expect(res.body.members.map((m) => m.id).sort()).toEqual(
        [projectManager._id, userOne._id, qaUser._id].map(String).sort(),
      );
      expect((await Project.findById(projectOne._id)).members).toHaveLength(3);
    });

    test('should give the new member access straight away', async () => {
      await asDev(request(app).get(`/v1/projects/${projectTwo._id}`)).expect(httpStatus.NOT_FOUND);
      await asAdmin(request(app).post(`/v1/projects/${projectTwo._id}/members`))
        .send({ userIds: [userOne._id.toString()] })
        .expect(httpStatus.OK);
      await asDev(request(app).get(`/v1/projects/${projectTwo._id}`)).expect(httpStatus.OK);
    });

    test('should return 400 for a pending user and add nobody', async () => {
      await asPM(request(app).post(`/v1/projects/${projectOne._id}/members`))
        .send({ userIds: [qaUser._id.toString(), pendingUser._id.toString()] })
        .expect(httpStatus.BAD_REQUEST);
      expect((await Project.findById(projectOne._id)).members).toHaveLength(2);
    });

    test('should return 400 for an empty or duplicated list', async () => {
      await asPM(request(app).post(`/v1/projects/${projectOne._id}/members`))
        .send({ userIds: [] })
        .expect(httpStatus.BAD_REQUEST);
      const id = qaUser._id.toString();
      await asPM(request(app).post(`/v1/projects/${projectOne._id}/members`))
        .send({ userIds: [id, id] })
        .expect(httpStatus.BAD_REQUEST);
    });

    test("should return 404 to a PM managing members of a project they aren't in", async () => {
      await asPM(request(app).post(`/v1/projects/${projectTwo._id}/members`))
        .send({ userIds: [userOne._id.toString()] })
        .expect(httpStatus.NOT_FOUND);
    });

    test('should return 403 for a developer or QA (no project:manage_members)', async () => {
      await asDev(request(app).post(`/v1/projects/${projectOne._id}/members`))
        .send({ userIds: [qaUser._id.toString()] })
        .expect(httpStatus.FORBIDDEN);
      await as(qaUserAccessToken)(request(app).post(`/v1/projects/${projectTwo._id}/members`))
        .send({ userIds: [userOne._id.toString()] })
        .expect(httpStatus.FORBIDDEN);
    });
  });

  describe('DELETE /v1/projects/:projectId/members/:userId', () => {
    beforeEach(async () => {
      await insertProjects([projectOne, projectTwo]);
    });

    test('should remove a member, who then loses access', async () => {
      const res = await asPM(request(app).delete(`/v1/projects/${projectOne._id}/members/${userOne._id}`)).expect(
        httpStatus.OK,
      );
      expect(res.body.members.map((m) => m.id)).toEqual([projectManager._id.toString()]);
      await asDev(request(app).get(`/v1/projects/${projectOne._id}`)).expect(httpStatus.NOT_FOUND);
    });

    test('should return 400 when removing the manager', async () => {
      await asAdmin(request(app).delete(`/v1/projects/${projectOne._id}/members/${projectManager._id}`)).expect(
        httpStatus.BAD_REQUEST,
      );
    });

    test('should return 404 when the user is not a member', async () => {
      await asAdmin(request(app).delete(`/v1/projects/${projectOne._id}/members/${userTwo._id}`)).expect(
        httpStatus.NOT_FOUND,
      );
    });
  });

  describe('Scope with other users', () => {
    test('should keep each user to their own projects', async () => {
      await insertProjects([projectOne, projectTwo]);
      const res = await as(userTwoAccessToken)(request(app).get('/v1/projects')).expect(httpStatus.OK);
      expect(res.body.results.map((p) => p.key)).toEqual(['BETA']);
    });
  });

  describe('Deleting a user', () => {
    test('should remove them from every project and clear them as manager', async () => {
      await insertProjects([projectOne]);
      await asAdmin(request(app).delete(`/v1/users/${projectManager._id}`)).expect(httpStatus.NO_CONTENT);

      const dbProject = await Project.findById(projectOne._id);
      expect(dbProject.manager).toBeNull();
      expect(dbProject.members.map(String)).toEqual([userOne._id.toString()]);
    });
  });
});
