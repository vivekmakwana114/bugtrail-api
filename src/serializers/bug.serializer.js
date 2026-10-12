import userSerializer from './user.serializer.js';

/**
 * Response shapes for bugs (see user.serializer.js for why we pick fields explicitly).
 *
 *   bugListItem → one row of the ticket grid
 *   bugDetail   → the bug page: description, attachments, dates, time per status, allowed moves
 *   activityList → the timeline
 */

/**
 * @param {Bug} bug
 * @param {Project} project
 * @returns {string} e.g. BT-42
 */
const bugKey = (bug, project) => `${project.key}-${bug.bugNumber}`;

/**
 * @param {Project} project
 * @returns {{ id: string, key: string, name: string }}
 */
const projectRef = (project) => ({ id: project.id, key: project.key, name: project.name });

/**
 * @param {{ bug: Bug, project: Project }} item - reporter and assignee populated
 * @returns {Object}
 */
const bugListItem = ({ bug, project }) => ({
  id: bug.id,
  key: bugKey(bug, project),
  project: projectRef(project),
  title: bug.title,
  moduleName: bug.moduleName,
  status: bug.status,
  assignee: userSerializer.userRef(bug.assignee),
  reporter: userSerializer.userRef(bug.reporter),
  failCount: bug.failCount,
  ageMs: bug.getAgeMs(),
  createdAt: bug.createdAt,
  updatedAt: bug.updatedAt,
});

/**
 * @param {{ bug: Bug, project: Project, allowedStatuses: string[], timeInStatus: Object }} item
 * @returns {Object}
 */
const bugDetail = ({ bug, project, allowedStatuses, timeInStatus }) => ({
  id: bug.id,
  key: bugKey(bug, project),
  project: projectRef(project),
  title: bug.title,
  moduleName: bug.moduleName,
  description: bug.description,
  attachments: bug.attachments.map(({ title, url }) => ({ title, url })),
  status: bug.status,
  allowedStatuses,
  assignee: bug.assignee ? userSerializer.userSummary(bug.assignee) : null,
  reporter: bug.reporter ? userSerializer.userSummary(bug.reporter) : null,
  failCount: bug.failCount,
  ageMs: bug.getAgeMs(),
  timeInStatus,
  lastStatusChangedAt: bug.lastStatusChangedAt,
  resolvedAt: bug.resolvedAt,
  passedAt: bug.passedAt,
  createdAt: bug.createdAt,
  updatedAt: bug.updatedAt,
});

/**
 * @param {QueryResult} page - results are { bug, project }
 * @returns {Object}
 */
const bugPage = ({ results, page, limit, totalPages, totalResults }) => ({
  results: results.map(bugListItem),
  page,
  limit,
  totalPages,
  totalResults,
});

/**
 * Assigned events store user ids; they're turned into user refs here so the UI can say
 * "Dana assigned it to Sam" without extra requests.
 * @param {{ events: BugActivity[], usersById: Map<string, User> }} activity
 * @returns {{ activity: Object[] }}
 */
const activityList = ({ events, usersById }) => {
  const ref = (id) => (id ? userSerializer.userRef(usersById.get(id.toString())) : null);
  return {
    activity: events.map((event) => ({
      id: event.id,
      type: event.type,
      actor: ref(event.actor),
      from: event.type === 'assigned' ? ref(event.from) : event.from,
      to: event.type === 'assigned' ? ref(event.to) : event.to,
      ...(event.fields && { fields: event.fields }),
      createdAt: event.createdAt,
    })),
  };
};

export default { bugListItem, bugDetail, bugPage, activityList };
