import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { Bug, BugActivity, Project, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import escapeRegex from '../utils/escapeRegex.js';
import getTimeInStatus from '../utils/bugTime.js';
import { getAccessibleProjectIds, projectScopeFilter } from '../utils/scope.js';
import projectService from './project.service.js';
import notificationService from './notification.service.js';
import { emitToBug } from '../sockets/emitter.js';
import { notificationTypes } from '../config/notificationTypes.js';
import { userStatuses } from '../config/userStatuses.js';
import { projectStatuses } from '../config/projectStatuses.js';
import {
  bugStatuses,
  bugStatusValues,
  progressTransitions,
  verifyTransitions,
  bugActivityTypes,
} from '../config/bugStatuses.js';
import { userSummaryFields } from '../serializers/user.serializer.js';

/*
 * Scope works exactly like projects: a bug is visible when its project is (utils/scope.js).
 * A bug you can't see is a 404, whether it doesn't exist or sits in someone else's project.
 *
 * Writes go bug first, then its BugActivity row. Without a replica set there are no
 * transactions, so a crash in between could leave a change without its activity row; the bug
 * itself (the source of truth) is always right.
 */

/** BT-42 → key BT, number 42 */
const BUG_KEY_PATTERN = /^([A-Z][A-Z0-9]{1,9})-(\d{1,9})$/;

/* ------------------------------------------------------------------ helpers */

/** A ref that may be populated (a document) or not (an ObjectId) → its ObjectId. */
const idOf = (ref) => ref?._id ?? ref;

/**
 * @param {Project} project
 */
const assertProjectWritable = (project) => {
  if (project.status === projectStatuses.ARCHIVED) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This project is archived: its bugs are read-only');
  }
};

/**
 * Load a bug the actor can see, by id or by key (BT-42).
 * @param {User} actor
 * @param {string} bugRef - ObjectId or bug key
 * @returns {Promise<{ bug: Bug, project: Project }>}
 */
const getBugOrThrow = async (actor, bugRef) => {
  const keyMatch = BUG_KEY_PATTERN.exec(String(bugRef).toUpperCase());
  if (keyMatch) {
    const project = await Project.findOne({ key: keyMatch[1], ...projectScopeFilter(actor) });
    const bug = project && (await Bug.findOne({ project: project._id, bugNumber: Number(keyMatch[2]), deletedAt: null }));
    if (bug) {
      return { bug, project };
    }
  } else if (mongoose.isValidObjectId(bugRef)) {
    const bug = await Bug.findOne({ _id: bugRef, deletedAt: null });
    const project = bug && (await Project.findOne({ _id: bug.project, ...projectScopeFilter(actor) }));
    if (project) {
      return { bug, project };
    }
  }
  throw new ApiError(httpStatus.NOT_FOUND, 'Bug not found');
};

/**
 * Which statuses `user` may move `bug` to right now (see the table in config/bugStatuses.js).
 * Sent with every bug so the UI only offers valid options, and enforced on every status change.
 * @param {User} user
 * @param {Bug} bug
 * @param {Project} project
 * @returns {string[]} in lifecycle order, never including the current status
 */
const getAllowedStatuses = (user, bug, project) => {
  if (project.status === projectStatuses.ARCHIVED) {
    return [];
  }
  const allowed = new Set();
  if (user.hasPermission('bug:set_any_status')) {
    bugStatusValues.forEach((status) => allowed.add(status));
  } else {
    if (user.hasPermission('bug:verify')) {
      (verifyTransitions[bug.status] ?? []).forEach((status) => allowed.add(status));
    }
    const isAssignee = idOf(bug.assignee)?.equals(user._id);
    if (user.hasPermission('bug:progress') && isAssignee) {
      (progressTransitions[bug.status] ?? []).forEach((status) => allowed.add(status));
    }
  }
  allowed.delete(bug.status);
  return bugStatusValues.filter((status) => allowed.has(status));
};

/**
 * Statuses a new bug may start in: normally only `reported`; any with bug:set_any_status
 * (QA logging a bug that's already being fixed, for example).
 * @param {User} user
 * @returns {string[]}
 */
const getInitialStatuses = (user) =>
  user.hasPermission('bug:set_any_status') ? [...bugStatusValues] : [bugStatuses.REPORTED];

/**
 * Fields that follow from entering `status` at `now`.
 * @param {string} status
 * @param {Date} now
 * @returns {Object}
 */
const statusFields = (status, now) => ({
  status,
  lastStatusChangedAt: now,
  ...(status === bugStatuses.RESOLVED && { resolvedAt: now }),
  // Passing stops the age clock; leaving pass (QA reopens it) restarts it.
  passedAt: status === bugStatuses.PASS ? now : null,
});

/**
 * The assignee works on the bug, so they must be active and able to progress bugs. They don't
 * have to be on the project yet (changed 2026-10-13): assigning someone who isn't adds them as a
 * member (and tells them), because they need to see the project to work on the bug.
 * @param {User} actor
 * @param {Project} project
 * @param {ObjectId|string} userId
 */
const assertAssignable = async (actor, project, userId) => {
  const user = await User.findOne({ _id: userId, status: userStatuses.ACTIVE });
  if (!user || !user.hasPermission('bug:progress')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The assignee must be an active user who can work on bugs');
  }
  await projectService.ensureMember(actor, project, user._id);
};

/**
 * @param {Bug} bug
 * @param {Project} project
 * @returns {{ key: string, link: string, entity: Object }} how notifications point at the bug
 */
const bugRefs = (bug, project) => {
  const key = `${project.key}-${bug.bugNumber}`;
  return {
    key,
    link: `/projects/${project.key}/bugs/${key}`, // keys, not ids: ids stay out of URLs
    entity: { kind: 'bug', id: bug.id, projectId: project.id, key },
  };
};

/**
 * Tell everyone looking at the bug that it changed. The payload is deliberately small: who may do
 * what next (allowedStatuses) differs per viewer, so clients refetch GET /bugs/:id when they need it.
 * @param {Bug} bug
 * @param {Project} project
 * @param {Object} [extra]
 */
const broadcastBugUpdated = (bug, project, extra = {}) => {
  emitToBug(bug.id, 'bug:updated', {
    id: bug.id,
    key: bugRefs(bug, project).key,
    status: bug.status,
    failCount: bug.failCount,
    assigneeId: bug.assignee ? idOf(bug.assignee).toString() : null,
    updatedAt: bug.updatedAt,
    ...extra,
  });
};

/**
 * @param {Bug} bug
 * @param {User} actor
 * @param {string} type - bugActivityTypes
 * @param {Object} [extra] - from, to, fields
 */
const recordActivity = (bug, actor, type, extra = {}) =>
  BugActivity.create({ bug: bug._id, project: bug.project, actor: actor._id, type, ...extra });

/**
 * Everything the detail view needs: people populated, allowed moves, time per status.
 * @param {User} actor
 * @param {Bug} bug
 * @param {Project} project
 * @returns {Promise<{ bug: Bug, project: Project, allowedStatuses: string[], timeInStatus: Object }>}
 */
const withDetails = async (actor, bug, project) => {
  await bug.populate([
    { path: 'reporter', select: userSummaryFields },
    { path: 'assignee', select: userSummaryFields },
  ]);
  const statusEvents = await BugActivity.find({
    bug: bug._id,
    type: { $in: [bugActivityTypes.CREATED, bugActivityTypes.STATUS_CHANGED] },
  })
    .sort({ createdAt: 1, _id: 1 })
    .select('to createdAt');
  return {
    bug,
    project,
    allowedStatuses: getAllowedStatuses(actor, bug, project),
    timeInStatus: getTimeInStatus(statusEvents, bug.passedAt ?? new Date()),
  };
};

/**
 * Raw aggregation rows → what bugSerializer.bugListItem expects: hydrated bugs with reporter and
 * assignee populated, each paired with its project (name + key, for the bug key). Two queries
 * for the whole page, not two per row.
 * @param {Object[]} rows - plain bug documents from Bug.aggregate
 * @returns {Promise<Array<{ bug: Bug, project: Project }>>}
 */
const toBugRows = async (rows) => {
  const bugs = rows.map((row) => Bug.hydrate(row));
  await Bug.populate(bugs, [
    { path: 'reporter', select: userSummaryFields },
    { path: 'assignee', select: userSummaryFields },
  ]);
  const projectIds = [...new Set(bugs.map((bug) => bug.project.toString()))];
  const projects = await Project.find({ _id: { $in: projectIds } }).select('name key');
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  return bugs.map((bug) => ({ bug, project: projectsById.get(bug.project.toString()) }));
};

/**
 * sortBy "age:desc,failCount:asc" → Mongo sort object. Age is computed (see queryBugs).
 * @param {string} sortBy
 * @returns {Object}
 */
const toSort = (sortBy) => {
  const sort = {};
  sortBy.split(',').forEach((criterion) => {
    const [field, order] = criterion.split(':');
    sort[field === 'age' ? 'ageMs' : field] = order === 'desc' ? -1 : 1;
  });
  sort._id = 1; // stable order between pages when values tie
  return sort;
};

/* ------------------------------------------------------------------ queries */

/**
 * The ticket grid. Within one project (projectId) or across every project the actor can see.
 * @param {User} actor
 * @param {Object} filter - projectId, status[], assignee (id | 'me' | 'none'), moduleName, search
 * @param {Object} options - sortBy, limit, page
 * @returns {Promise<QueryResult>} results: [{ bug, project }]
 */
const queryBugs = async (actor, { projectId, status, assignee, moduleName, search }, options) => {
  let projectIds = await getAccessibleProjectIds(actor);
  if (projectId) {
    if (!projectIds.some((id) => id.equals(projectId))) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Project not found');
    }
    projectIds = [new mongoose.Types.ObjectId(projectId)];
  }

  const match = { project: { $in: projectIds }, deletedAt: null };
  if (status) {
    match.status = { $in: status };
  }
  // Spelled out on purpose: a lookup table with `??` treats "none" → null as "not found" and
  // falls through to new ObjectId('none'), which throws.
  if (assignee === 'me') {
    match.assignee = actor._id;
  } else if (assignee === 'none') {
    match.assignee = null;
  } else if (assignee) {
    match.assignee = new mongoose.Types.ObjectId(assignee);
  }
  if (moduleName) {
    match.moduleName = moduleName;
  }
  if (search) {
    const keyMatch = BUG_KEY_PATTERN.exec(search.toUpperCase());
    if (keyMatch) {
      // "BT-42" jumps straight to that bug (if the actor can see BT).
      const project = await Project.findOne({ key: keyMatch[1], _id: { $in: projectIds } }).select('_id');
      match.project = project?._id ?? null;
      match.bugNumber = Number(keyMatch[2]);
    } else {
      const pattern = { $regex: escapeRegex(search), $options: 'i' };
      match.$or = [{ title: pattern }, { moduleName: pattern }];
    }
  }

  const sortBy = options.sortBy ?? 'updatedAt:desc';
  const limit = options.limit ?? 20;
  const page = options.page ?? 1;

  // Age isn't stored (it grows every second), so sorting by it computes it in the pipeline:
  // passedAt (or now) minus createdAt.
  const [{ results, total }] = await Bug.aggregate([
    { $match: match },
    ...(sortBy.includes('age:')
      ? [{ $addFields: { ageMs: { $subtract: [{ $ifNull: ['$passedAt', '$$NOW'] }, '$createdAt'] } } }]
      : []),
    { $sort: toSort(sortBy) },
    {
      $facet: {
        results: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const totalResults = total[0]?.count ?? 0;
  return {
    results: await toBugRows(results),
    page,
    limit,
    totalPages: Math.ceil(totalResults / limit),
    totalResults,
  };
};

/**
 * @param {User} actor
 * @param {string} bugRef - id or key
 */
const getBug = async (actor, bugRef) => {
  const { bug, project } = await getBugOrThrow(actor, bugRef);
  return withDetails(actor, bug, project);
};

/**
 * A bug's full timeline, oldest first, with the people involved.
 * @param {User} actor
 * @param {string} bugRef
 * @returns {Promise<{ events: BugActivity[], usersById: Map<string, User> }>}
 */
const getActivity = async (actor, bugRef) => {
  const { bug } = await getBugOrThrow(actor, bugRef);
  const events = await BugActivity.find({ bug: bug._id }).sort({ createdAt: 1, _id: 1 }).limit(500);

  // Actors, plus the people in `assigned` events (stored as ids), in one query.
  const ids = new Set();
  events.forEach((event) => {
    ids.add(event.actor.toString());
    if (event.type === bugActivityTypes.ASSIGNED) {
      [event.from, event.to].filter(Boolean).forEach((id) => ids.add(id.toString()));
    }
  });
  const users = await User.find({ _id: { $in: [...ids] } }).select(userSummaryFields);
  return { events, usersById: new Map(users.map((user) => [user.id, user])) };
};

/**
 * Distinct module/screen names used in a project, for the report form's autocomplete.
 * @param {User} actor
 * @param {ObjectId} projectId
 * @returns {Promise<string[]>}
 */
const getModules = async (actor, projectId) => {
  const project = await projectService.getProjectOrThrow(actor, projectId);
  const modules = await Bug.distinct('moduleName', { project: project._id, deletedAt: null });
  return modules.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

/* ------------------------------------------------------------------ commands */

/**
 * @param {User} actor
 * @param {Object} body - project, title, moduleName, description, attachments, status, assignee, sendEmail
 */
const createBug = async (actor, body) => {
  const { project: projectId, status = bugStatuses.REPORTED, assignee = null, sendEmail = false } = body;
  const { title, moduleName, description, attachments } = body;
  const project = await projectService.getProjectOrThrow(actor, projectId);
  assertProjectWritable(project);
  if (!getInitialStatuses(actor).includes(status)) {
    throw new ApiError(httpStatus.FORBIDDEN, `You can't report a bug as ${status}`);
  }
  if (assignee) {
    await assertAssignable(actor, project, assignee);
  }

  // Atomic: two bugs reported at the same moment can't get the same number. If the insert
  // below fails, that number is simply skipped (gaps are fine, duplicates aren't).
  const { bugCounter } = await Project.findByIdAndUpdate(
    project._id,
    { $inc: { bugCounter: 1 } },
    { new: true, projection: { bugCounter: 1 } },
  );

  const bug = await Bug.create({
    title,
    moduleName,
    description,
    attachments,
    project: project._id,
    bugNumber: bugCounter,
    reporter: actor._id,
    assignee,
    ...statusFields(status, new Date()),
  });
  await recordActivity(bug, actor, bugActivityTypes.CREATED, { to: status });
  if (assignee) {
    await recordActivity(bug, actor, bugActivityTypes.ASSIGNED, { from: null, to: bug.assignee });
  }
  if (assignee) {
    const { key, link, entity } = bugRefs(bug, project);
    await notificationService.notify({
      recipients: [assignee],
      actor,
      type: notificationTypes.BUG_ASSIGNED,
      title: `${key} was assigned to you`,
      message: `${actor.name} reported "${bug.title}" in ${project.name} and assigned it to you.`,
      entity,
      link,
      sendEmail,
    });
  }
  return withDetails(actor, bug, project);
};

/**
 * Title, module, description, attachments. Status and assignee have their own endpoints
 * because they have their own rules, activity and notifications.
 * @param {User} actor
 * @param {ObjectId} bugId
 * @param {Object} body
 */
const updateBug = async (actor, bugId, body) => {
  const { bug, project } = await getBugOrThrow(actor, bugId);
  assertProjectWritable(project);

  const changed = Object.keys(body).filter((field) => JSON.stringify(bug[field]) !== JSON.stringify(body[field]));
  if (changed.length) {
    Object.assign(bug, body);
    await bug.save();
    await recordActivity(bug, actor, bugActivityTypes.UPDATED, { fields: changed });
    broadcastBugUpdated(bug, project, { fields: changed });
  }
  return withDetails(actor, bug, project);
};

/**
 * Move a bug to another status, if the transition table allows it for this actor.
 * @param {User} actor
 * @param {ObjectId} bugId
 * @param {{ status: string, sendEmail?: boolean }} body
 */
const changeStatus = async (actor, bugId, { status, sendEmail = false }) => {
  const { bug, project } = await getBugOrThrow(actor, bugId);
  assertProjectWritable(project);
  if (status === bug.status) {
    throw new ApiError(httpStatus.BAD_REQUEST, `The bug is already ${status}`);
  }
  if (!getAllowedStatuses(actor, bug, project).includes(status)) {
    throw new ApiError(httpStatus.FORBIDDEN, `You can't move this bug from ${bug.status} to ${status}`);
  }

  // Conditional on the status we checked: if someone moved it in the meantime, nothing is
  // written and the caller reloads, instead of both changes "winning" in turn.
  const updated = await Bug.findOneAndUpdate(
    { _id: bug._id, status: bug.status, deletedAt: null },
    {
      $set: statusFields(status, new Date()),
      ...(status === bugStatuses.FAILED && { $inc: { failCount: 1 } }),
    },
    { new: true },
  );
  if (!updated) {
    throw new ApiError(httpStatus.CONFLICT, 'Someone else changed this bug. Reload and try again.');
  }
  await recordActivity(updated, actor, bugActivityTypes.STATUS_CHANGED, { from: bug.status, to: status });
  broadcastBugUpdated(updated, project);
  const { key, link, entity } = bugRefs(updated, project);
  await notificationService.notify({
    recipients: [updated.assignee, updated.reporter],
    actor,
    type: notificationTypes.BUG_STATUS_CHANGED,
    title: `${key} is now ${status}`,
    message: `${actor.name} moved "${updated.title}" from ${bug.status} to ${status}.`,
    entity,
    link,
    sendEmail,
  });
  return withDetails(actor, updated, project);
};

/**
 * @param {User} actor
 * @param {ObjectId} bugId
 * @param {{ assignee: string|null, sendEmail?: boolean }} body
 */
const assignBug = async (actor, bugId, { assignee, sendEmail = false }) => {
  const { bug, project } = await getBugOrThrow(actor, bugId);
  assertProjectWritable(project);
  if (String(bug.assignee) === String(assignee)) {
    return withDetails(actor, bug, project); // nothing to change
  }
  if (assignee) {
    await assertAssignable(actor, project, assignee);
  }

  const updated = await Bug.findOneAndUpdate(
    { _id: bug._id, assignee: bug.assignee, deletedAt: null },
    { $set: { assignee } },
    { new: true },
  );
  if (!updated) {
    throw new ApiError(httpStatus.CONFLICT, 'Someone else changed this bug. Reload and try again.');
  }
  await recordActivity(updated, actor, bugActivityTypes.ASSIGNED, { from: bug.assignee, to: updated.assignee });
  broadcastBugUpdated(updated, project);
  if (updated.assignee) {
    const { key, link, entity } = bugRefs(updated, project);
    await notificationService.notify({
      recipients: [updated.assignee],
      actor,
      type: notificationTypes.BUG_ASSIGNED,
      title: `${key} was assigned to you`,
      message: `${actor.name} assigned you "${updated.title}" in ${project.name}.`,
      entity,
      link,
      sendEmail,
    });
  }
  return withDetails(actor, updated, project);
};

/**
 * Soft delete: hidden everywhere, history kept, its number never reused.
 * @param {User} actor
 * @param {ObjectId} bugId
 */
const deleteBug = async (actor, bugId) => {
  const { bug, project } = await getBugOrThrow(actor, bugId);
  bug.deletedAt = new Date();
  await bug.save();
  await recordActivity(bug, actor, bugActivityTypes.DELETED);
  broadcastBugUpdated(bug, project, { deleted: true });
};

export { BUG_KEY_PATTERN };
export default {
  getBugOrThrow,
  toBugRows,
  queryBugs,
  getBug,
  getActivity,
  getModules,
  createBug,
  updateBug,
  changeStatus,
  assignBug,
  deleteBug,
  getAllowedStatuses,
};
