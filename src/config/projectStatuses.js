/**
 *   active    → work in progress
 *   completed → delivered; kept for history and reporting
 *   archived  → hidden from day-to-day lists, still readable
 * Any status can move to any other: these describe the project, they don't gate access.
 */
const projectStatuses = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
});

const projectStatusValues = Object.freeze(Object.values(projectStatuses));

export { projectStatuses, projectStatusValues };
