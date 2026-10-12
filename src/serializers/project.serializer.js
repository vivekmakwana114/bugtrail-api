import userSerializer from './user.serializer.js';

/**
 * Response shapes for projects (see user.serializer.js for why we pick fields explicitly).
 *
 *   projectListItem → one card on the projects grid: just enough for the name, the pie and a badge
 *   projectDetail   → the project page: adds description, the manager and the member list
 *
 * Services return `{ project, bugSummary }` pairs: the bug summary is computed, not stored.
 */

/**
 * @param {{ project: Project, bugSummary: Object }} item - manager populated
 * @returns {Object}
 */
const projectListItem = ({ project, bugSummary }) => ({
  id: project.id,
  name: project.name,
  key: project.key,
  status: project.status,
  manager: userSerializer.userRef(project.manager),
  memberCount: project.members.length,
  bugSummary,
  updatedAt: project.updatedAt,
});

/**
 * @param {{ project: Project, bugSummary: Object }} item - manager and members populated
 * @returns {Object}
 */
const projectDetail = ({ project, bugSummary }) => ({
  id: project.id,
  name: project.name,
  key: project.key,
  description: project.description,
  status: project.status,
  manager: project.manager ? userSerializer.userSummary(project.manager) : null,
  members: project.members.map(userSerializer.userSummary),
  bugSummary,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

/**
 * @param {QueryResult} page - results are { project, bugSummary }
 * @returns {Object}
 */
const projectPage = ({ results, page, limit, totalPages, totalResults }) => ({
  results: results.map(projectListItem),
  page,
  limit,
  totalPages,
  totalResults,
});

/**
 * @param {User[]} members
 * @returns {{ members: Object[] }}
 */
const memberList = (members) => ({ members: members.map(userSerializer.userSummary) });

export default { projectListItem, projectDetail, projectPage, memberList };
