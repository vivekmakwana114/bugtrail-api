import { Project } from '../models/index.js';

/*
 * Project scope: the single answer to "which projects can this user see?".
 *
 *   project:read_all (Admin) → every project that isn't deleted
 *   everyone else            → only projects they're a member of
 *
 * Every query that touches project data (projects now; bugs, chat and the dashboard later)
 * starts from these helpers instead of writing its own membership check. One rule, one place:
 * if it's wrong, it's wrong everywhere and a test catches it; if it's right, nobody can forget it.
 */

/**
 * @param {User} user
 * @returns {boolean}
 */
const canSeeAllProjects = (user) => user.hasPermission('project:read_all');

/**
 * Mongo filter for the projects `user` may see. Merge it LAST so it always wins over
 * client-supplied filters: `{ ...clientFilter, ...projectScopeFilter(user) }`.
 * @param {User} user
 * @returns {Object}
 */
const projectScopeFilter = (user) => ({
  deletedAt: null,
  ...(!canSeeAllProjects(user) && { members: user._id }),
});

/**
 * Ids of every project `user` may see. For child collections (bugs, messages, stats):
 * `Bug.find({ project: { $in: await getAccessibleProjectIds(user) } })`.
 * @param {User} user
 * @returns {Promise<ObjectId[]>}
 */
const getAccessibleProjectIds = async (user) => Project.distinct('_id', projectScopeFilter(user));

export { canSeeAllProjects, projectScopeFilter, getAccessibleProjectIds };
