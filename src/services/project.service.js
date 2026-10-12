import httpStatus from 'http-status';
import { Bug, Project, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import escapeRegex from '../utils/escapeRegex.js';
import { canSeeAllProjects, projectScopeFilter } from '../utils/scope.js';
import { userStatuses } from '../config/userStatuses.js';
import { bugStatusValues, bugStatuses, pieSlices, openBugStatuses, getAgedOpenCutoff } from '../config/bugStatuses.js';
import { userSummaryFields } from '../serializers/user.serializer.js';
import notificationService from './notification.service.js';
import { disconnectUser } from '../sockets/emitter.js';
import { notificationTypes } from '../config/notificationTypes.js';

/*
 * Every function that takes a project id loads it through getProjectOrThrow(actor, id),
 * which applies the caller's project scope. A project you can't see is a 404, never a 403:
 * "forbidden" would confirm that a project with that id exists.
 */

/* ------------------------------------------------------------------ helpers */

/**
 * @param {User} actor
 * @param {ObjectId|string} projectId
 * @returns {Promise<Project>}
 */
const getProjectOrThrow = async (actor, projectId) => {
  const project = await Project.findOne({ _id: projectId, ...projectScopeFilter(actor) });
  if (!project) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Project not found');
  }
  return project;
};

/**
 * Only active users with a role can join a project (not pending, suspended or rejected ones).
 * @param {Array<ObjectId|string>} userIds
 * @returns {Promise<User[]>}
 */
const getAssignableUsersOrThrow = async (userIds) => {
  const ids = [...new Set(userIds.map(String))];
  const users = await User.find({ _id: { $in: ids }, status: userStatuses.ACTIVE, role: { $ne: null } });
  if (users.length !== ids.length) {
    const found = new Set(users.map((user) => user.id));
    const invalid = ids.filter((id) => !found.has(id));
    throw new ApiError(httpStatus.BAD_REQUEST, `These users don't exist or aren't active: ${invalid.join(', ')}`);
  }
  return users;
};

/**
 * The manager runs the project, so they must be able to manage its members (PM or Admin).
 * @param {User} user
 */
const assertCanBeManager = (user) => {
  if (!user.hasPermission('project:manage_members')) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'The manager must be able to manage project members (a Project Manager or an Admin)',
    );
  }
};

/**
 * "You were added to <project>", for members added at creation or later.
 * @param {User} actor
 * @param {Project} project
 * @param {Array<ObjectId|string>} userIds - only the people who weren't members before
 */
const notifyAddedMembers = (actor, project, userIds) =>
  notificationService.notify({
    recipients: userIds,
    actor,
    type: notificationTypes.PROJECT_MEMBER_ADDED,
    title: `You were added to ${project.name}`,
    message: `${actor.name} added you to ${project.name} (${project.key}).`,
    entity: { kind: 'project', id: project.id, key: project.key },
    link: `/projects/${project.id}`,
  });

/**
 * @param {Object<string, number>} [counts] - status → count
 * @param {number} [agedOpen] - open bugs reported more than AGED_OPEN_DAYS ago
 * @returns {{ total: number, open: number, agedOpen: number, byStatus: Object, pie: Object }}
 *   open = everything not passed yet (the number in the middle of the card's ring)
 *   agedOpen = the "open > 7d" half of the card's trouble line
 */
const buildBugSummary = (counts = {}, agedOpen = 0) => {
  const byStatus = Object.fromEntries(bugStatusValues.map((status) => [status, counts[status] ?? 0]));
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const pie = Object.fromEntries(
    Object.entries(pieSlices).map(([slice, statuses]) => [slice, statuses.reduce((sum, s) => sum + byStatus[s], 0)]),
  );
  return { total, open: total - byStatus[bugStatuses.PASS], agedOpen, byStatus, pie };
};

/**
 * Per-status bug counts and aged-open counts for a set of projects, in one aggregation
 * (not one query per card). Soft-deleted bugs don't count. Uses the {project, status} index.
 *
 * @param {ObjectId[]} projectIds
 * @returns {Promise<Map<string, Object>>} project id → bug summary (projects without bugs are absent)
 */
const getBugSummaries = async (projectIds) => {
  if (!projectIds.length) {
    return new Map();
  }
  const isAgedOpen = { $and: [{ $ne: ['$status', bugStatuses.PASS] }, { $lt: ['$createdAt', getAgedOpenCutoff()] }] };
  const rows = await Bug.aggregate([
    { $match: { project: { $in: projectIds }, deletedAt: null } },
    {
      $group: {
        _id: { project: '$project', status: '$status' },
        count: { $sum: 1 },
        aged: { $sum: { $cond: [isAgedOpen, 1, 0] } },
      },
    },
  ]);

  const byProject = new Map();
  rows.forEach(({ _id, count, aged }) => {
    const id = _id.project.toString();
    if (!byProject.has(id)) {
      byProject.set(id, { counts: {}, agedOpen: 0 });
    }
    const entry = byProject.get(id);
    entry.counts[_id.status] = count;
    entry.agedOpen += aged;
  });
  return new Map([...byProject].map(([id, { counts, agedOpen }]) => [id, buildBugSummary(counts, agedOpen)]));
};

/**
 * @param {ObjectId} projectId
 * @returns {Promise<User[]>} members as summaries-ready user docs, sorted by name
 */
const getMembers = async (projectId) => {
  const project = await Project.findById(projectId).populate({
    path: 'members',
    select: userSummaryFields,
    options: { sort: { name: 1 } },
  });
  return project.members;
};

/**
 * @param {Project} project
 * @returns {Promise<{ project: Project, bugSummary: Object }>} manager + members populated
 */
const withDetails = async (project) => {
  await project.populate([
    { path: 'manager', select: userSummaryFields },
    { path: 'members', select: userSummaryFields, options: { sort: { name: 1 } } },
  ]);
  const summaries = await getBugSummaries([project._id]);
  return { project, bugSummary: summaries.get(project.id) ?? buildBugSummary() };
};

/* ------------------------------------------------------------------ queries */

/**
 * Projects the actor can see, one page at a time, each with its bug summary for the pie.
 * @param {User} actor
 * @param {{ status?: string, search?: string }} filter
 * @param {Object} options - sortBy, limit, page
 * @returns {Promise<QueryResult>} results: [{ project, bugSummary }]
 */
const queryProjects = async (actor, { status, search }, options) => {
  const filter = {
    ...(status && { status }),
    ...(search && {
      $or: [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { key: { $regex: escapeRegex(search), $options: 'i' } },
      ],
    }),
    ...projectScopeFilter(actor), // last, so nothing above can widen the scope
  };
  const page = await Project.paginate(filter, { sortBy: 'name:asc', ...options });
  await Project.populate(page.results, { path: 'manager', select: userSummaryFields });
  const summaries = await getBugSummaries(page.results.map((project) => project._id));
  return {
    ...page,
    results: page.results.map((project) => ({ project, bugSummary: summaries.get(project.id) ?? buildBugSummary() })),
  };
};

/**
 * @param {User} actor
 * @param {ObjectId} projectId
 * @returns {Promise<{ project: Project, bugSummary: Object }>}
 */
const getProject = async (actor, projectId) => withDetails(await getProjectOrThrow(actor, projectId));

/* ------------------------------------------------------------------ commands */

/**
 * @param {User} actor
 * @param {{ name: string, key: string, description?: string, status?: string, manager?: string, members?: string[] }} body
 * @returns {Promise<{ project: Project, bugSummary: Object }>}
 */
const createProject = async (actor, { members = [], manager = null, ...fields }) => {
  if (await Project.isKeyTaken(fields.key)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Project key already taken');
  }

  const memberIds = [...members, ...(manager ? [manager] : [])];
  const users = await getAssignableUsersOrThrow(memberIds);
  if (manager) {
    assertCanBeManager(users.find((user) => user._id.equals(manager)));
  }
  // Someone who can create projects but can't see all of them must not lose sight of their own.
  if (!canSeeAllProjects(actor)) {
    memberIds.push(actor._id);
  }

  const project = await Project.create({ ...fields, manager, members: [...new Set(memberIds.map(String))] });
  await notifyAddedMembers(actor, project, project.members);
  return withDetails(project);
};

/**
 * Name, description, status and manager. The key never changes; members have their own endpoints.
 * @param {User} actor
 * @param {ObjectId} projectId
 * @param {Object} body
 * @returns {Promise<{ project: Project, bugSummary: Object }>}
 */
const updateProject = async (actor, projectId, { manager, ...fields }) => {
  const project = await getProjectOrThrow(actor, projectId);

  if (manager !== undefined) {
    if (manager !== null) {
      if (!project.hasMember(manager)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'The manager must be a member of the project. Add them first.');
      }
      const [user] = await getAssignableUsersOrThrow([manager]);
      assertCanBeManager(user);
    }
    project.manager = manager;
  }

  Object.assign(project, fields);
  await project.save();
  return withDetails(project);
};

/**
 * Soft delete: the project disappears from every list and lookup, but its bugs and history stay
 * intact and its key stays reserved.
 * @param {User} actor
 * @param {ObjectId} projectId
 */
const deleteProject = async (actor, projectId) => {
  const project = await getProjectOrThrow(actor, projectId);
  project.deletedAt = new Date();
  await project.save();
};

/**
 * Add members. $addToSet makes it idempotent (adding someone twice is fine) and atomic
 * (two people adding members at the same time don't overwrite each other's change).
 * @param {User} actor
 * @param {ObjectId} projectId
 * @param {string[]} userIds
 * @returns {Promise<User[]>} the full member list
 */
const addMembers = async (actor, projectId, userIds) => {
  const project = await getProjectOrThrow(actor, projectId);
  const users = await getAssignableUsersOrThrow(userIds);
  const newMembers = users.filter((user) => !project.hasMember(user._id));
  await Project.updateOne({ _id: project._id }, { $addToSet: { members: { $each: users.map((user) => user._id) } } });
  await notifyAddedMembers(
    actor,
    project,
    newMembers.map((user) => user._id),
  );
  return getMembers(project._id);
};

/**
 * @param {User} actor
 * @param {ObjectId} projectId
 * @param {ObjectId} userId
 * @returns {Promise<User[]>} the full member list
 */
const removeMember = async (actor, projectId, userId) => {
  const project = await getProjectOrThrow(actor, projectId);
  if (!project.hasMember(userId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'This user is not a member of the project');
  }
  if (project.manager?.equals(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This user is the project manager. Change the manager first.');
  }
  // Block rather than silently unassign: open work shouldn't vanish from everyone's list.
  const openAssigned = await Bug.countDocuments({
    project: project._id,
    assignee: userId,
    status: { $in: openBugStatuses },
    deletedAt: null,
  });
  if (openAssigned) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `This member has ${openAssigned} open bug(s) assigned in this project. Reassign them first.`,
    );
  }
  await Project.updateOne({ _id: project._id }, { $pull: { members: userId } });
  disconnectUser(userId); // they may be in this project's bug rooms
  return getMembers(project._id);
};

/**
 * Called when a user is deleted, so no project keeps a dangling member or manager id.
 * @param {ObjectId} userId
 */
const removeUserFromAllProjects = async (userId) => {
  await Project.updateMany({ manager: userId }, { $set: { manager: null } });
  await Project.updateMany({ members: userId }, { $pull: { members: userId } });
};

export default {
  buildBugSummary,
  getProjectOrThrow,
  queryProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  addMembers,
  removeMember,
  removeUserFromAllProjects,
  getBugSummaries,
};
