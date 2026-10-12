import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { Bug, Project, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { getAccessibleProjectIds } from '../utils/scope.js';
import bugService from './bug.service.js';
import projectService from './project.service.js';
import { bugStatuses, bugStatusValues, openBugStatuses, getAgedOpenCutoff } from '../config/bugStatuses.js';
import { projectStatuses } from '../config/projectStatuses.js';
import { userSummaryFields } from '../serializers/user.serializer.js';

/*
 * Dashboard numbers. Every endpoint:
 *   - starts from getScope(): the actor's projects (or one of them), non-deleted bugs, and the
 *     optional date range on when the bug was reported;
 *   - does its counting inside MongoDB with ONE aggregation, and returns only the totals.
 * Nothing is precomputed or cached, so the numbers are always current. See learning note 06.
 */

/**
 * @param {User} actor
 * @param {{ projectId?: string, from?: Date, to?: Date }} filter
 * @returns {Promise<{ projectIds: ObjectId[], bugMatch: Object }>}
 */
const getScope = async (actor, { projectId, from, to }) => {
  let projectIds = await getAccessibleProjectIds(actor);
  if (projectId) {
    if (!projectIds.some((id) => id.equals(projectId))) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Project not found');
    }
    projectIds = [new mongoose.Types.ObjectId(projectId)];
  }
  const bugMatch = {
    project: { $in: projectIds },
    deletedAt: null,
    ...((from || to) && { createdAt: { ...(from && { $gte: from }), ...(to && { $lte: to }) } }),
  };
  return { projectIds, bugMatch };
};

/**
 * @param {Object} match
 * @returns {Promise<Object<string, number>>} status → count
 */
const countBugsByStatus = async (match) => {
  const rows = await Bug.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map(({ _id, count }) => [_id, count]));
};

/**
 * Top cards: projects by status, bugs by status.
 * Project counts ignore the date range (a project isn't "reported"); bug counts respect it.
 * @param {User} actor
 * @param {Object} filter
 */
const getSummary = async (actor, filter) => {
  const { projectIds, bugMatch } = await getScope(actor, filter);
  // Aged = still open and reported before the cutoff (and, with a date filter, within the range too).
  const agedMatch = {
    ...bugMatch,
    status: { $in: openBugStatuses },
    createdAt: { ...bugMatch.createdAt, $lt: getAgedOpenCutoff() },
  };
  const [projectRows, bugCounts, agedOpen] = await Promise.all([
    Project.aggregate([{ $match: { _id: { $in: projectIds } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    countBugsByStatus(bugMatch),
    Bug.countDocuments(agedMatch),
  ]);
  const projects = Object.fromEntries(Object.values(projectStatuses).map((status) => [status, 0]));
  projectRows.forEach(({ _id, count }) => {
    projects[_id] = count;
  });
  return { projects, bugs: projectService.buildBugSummary(bugCounts, agedOpen) };
};

/**
 * The bug status chart: all five statuses, in lifecycle order, zeros included.
 * @param {User} actor
 * @param {Object} filter
 * @returns {Promise<{ statuses: Array<{ status: string, count: number }> }>}
 */
const getBugStatus = async (actor, filter) => {
  const { bugMatch } = await getScope(actor, filter);
  const counts = await countBugsByStatus(bugMatch);
  return { statuses: bugStatusValues.map((status) => ({ status, count: counts[status] ?? 0 })) };
};

/**
 * Per assignee, over the bugs in scope that are assigned to them now:
 *   assigned, open, passed, totalFails (sum of failCount),
 *   firstPassRate (share of passed bugs that never failed), avgTimeToPassMs (reported → pass).
 * Attribution is to the CURRENT assignee: a bug reassigned before passing counts for whoever has it.
 * @param {User} actor
 * @param {Object} filter
 */
const getDeveloperPerformance = async (actor, filter) => {
  const { bugMatch } = await getScope(actor, filter);
  const isPass = { $eq: ['$status', bugStatuses.PASS] };
  const rows = await Bug.aggregate([
    { $match: { ...bugMatch, assignee: { $ne: null } } },
    {
      $group: {
        _id: '$assignee',
        assigned: { $sum: 1 },
        passed: { $sum: { $cond: [isPass, 1, 0] } },
        firstPass: { $sum: { $cond: [{ $and: [isPass, { $eq: ['$failCount', 0] }] }, 1, 0] } },
        totalFails: { $sum: '$failCount' },
        // $avg skips nulls, so only passed bugs count towards the average.
        avgTimeToPassMs: { $avg: { $cond: [isPass, { $subtract: ['$passedAt', '$createdAt'] }, null] } },
      },
    },
    { $sort: { passed: -1, assigned: -1, _id: 1 } },
  ]);

  const users = await User.find({ _id: { $in: rows.map((row) => row._id) } }).select(userSummaryFields);
  const usersById = new Map(users.map((user) => [user.id, user]));
  return {
    developers: rows.map((row) => ({
      developer: usersById.get(row._id.toString()) ?? null,
      assigned: row.assigned,
      open: row.assigned - row.passed,
      passed: row.passed,
      totalFails: row.totalFails,
      firstPassRate: row.passed ? Number((row.firstPass / row.passed).toFixed(4)) : null,
      avgTimeToPassMs: row.avgTimeToPassMs === null ? null : Math.round(row.avgTimeToPassMs),
    })),
  };
};

/**
 * Longest-running tickets: the oldest by age (reported until passed, or until now).
 * @param {User} actor
 * @param {Object} filter - plus `open` (only not-yet-passed) and `limit`
 * @returns {Promise<Array<{ bug: Bug, project: Project }>>}
 */
const getSlowestTickets = async (actor, { open, limit = 10, ...filter }) => {
  const { bugMatch } = await getScope(actor, filter);
  const rows = await Bug.aggregate([
    { $match: { ...bugMatch, ...(open && { status: { $in: openBugStatuses } }) } },
    { $addFields: { ageMs: { $subtract: [{ $ifNull: ['$passedAt', '$$NOW'] }, '$createdAt'] } } },
    { $sort: { ageMs: -1, _id: 1 } },
    { $limit: limit },
  ]);
  return bugService.toBugRows(rows);
};

export default { getSummary, getBugStatus, getDeveloperPerformance, getSlowestTickets };
